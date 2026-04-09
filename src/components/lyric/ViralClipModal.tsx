import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import type { Moment } from "@/lib/buildMoments";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import { canExportVideo, exportVideoAsMP4 } from "@/engine/exportVideo";
import { ChevronDown, Heart, Pause, Play, Volume2, VolumeX, X } from "lucide-react";

interface ViralClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  getPlayer: () => LyricDancePlayer | null;
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  comments: Array<{ text: string; line_index: number | null }>;
  songTitle: string;
  artistName: string;
  audioUrl: string;
}

type Platform = "tiktok" | "reels" | "shorts" | "twitter";
type Quality = "1080p" | "720p" | "480p";

const PLATFORMS: Record<Platform, { label: string; w: number; h: number }> = {
  tiktok: { label: "TikTok", w: 1080, h: 1920 },
  reels: { label: "Reels", w: 1080, h: 1920 },
  shorts: { label: "Shorts", w: 1080, h: 1920 },
  twitter: { label: "Twitter/X", w: 1920, h: 1080 },
};

const QUALITY_SCALE: Record<Quality, number> = { "1080p": 1, "720p": 0.667, "480p": 0.444 };
const PLATFORM_ORDER: Platform[] = ["tiktok", "reels", "shorts", "twitter"];
const QUALITY_ORDER: Quality[] = ["1080p", "720p", "480p"];

function safeName(input: string): string {
  return (input || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "clip";
}

export function ViralClipModal({
  isOpen,
  onClose,
  getPlayer,
  moments,
  fireHeat,
  comments,
  songTitle,
  artistName,
  audioUrl,
}: ViralClipModalProps) {
  const [selectedMoment, setSelectedMoment] = useState(0);
  const [caption, setCaption] = useState("");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [quality, setQuality] = useState<Quality>("1080p");
  const [stage, setStage] = useState<"config" | "rendering" | "done" | "error">("config");
  const [progress, setProgress] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sortedMoments = useMemo(() => {
    const fireCounts = deriveMomentFireCounts(fireHeat, moments);
    return moments
      .map((moment, index) => ({ moment, index, fires: fireCounts[index] ?? 0 }))
      .sort((a, b) => b.fires - a.fires);
  }, [fireHeat, moments]);

  const selected = sortedMoments[selectedMoment] ?? null;
  const { previewW, previewH, previewAspect } = useMemo(() => {
    const { w, h } = PLATFORMS[platform];
    const portrait = h > w;
    return {
      previewW: 720,
      previewH: portrait ? Math.round(720 * (14 / 9)) : Math.round(720 * (10 / 16)),
      previewAspect: portrait ? "9 / 14" : "16 / 10",
    };
  }, [platform]);

  const commentSuggestions = useMemo(() => {
    if (!selected) return [] as Array<{ text: string; votes: number }>;
    const matchLineIndexes = new Set<number>(selected.moment.lines.map((l) => l.lineIndex));
    const bucket = new Map<string, number>();
    for (const c of comments) {
      const trimmed = c.text?.trim();
      if (!trimmed) continue;
      if (c.line_index == null || !matchLineIndexes.has(c.line_index)) continue;
      bucket.set(trimmed, (bucket.get(trimmed) ?? 0) + 1);
    }
    return [...bucket.entries()]
      .map(([text, votes]) => ({ text, votes }))
      .sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));
  }, [comments, selected]);

  useEffect(() => {
    if (!isOpen) return;
    setStage("config");
    setProgress(0);
    setSelectedMoment(0);
    setDropdownOpen(false);
    setPreviewing(false);
    setDownloadBlob(null);
    setBrowserSupported(canExportVideo());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const next = commentSuggestions[0]?.text ?? "";
    setCaption(next);
  }, [selectedMoment, commentSuggestions, isOpen]);

  const drawCaptionOverlay = useCallback(() => {
    const preview = previewCanvasRef.current;
    const snapshot = snapshotRef.current;
    if (!preview || !snapshot) return;
    const ctx = preview.getContext("2d");
    if (!ctx) return;

    ctx.putImageData(snapshot, 0, 0);
    const trimmedCaption = caption.trim();
    if (!trimmedCaption) return;

    const w = preview.width;
    const h = preview.height;
    const fontSize = Math.round(h * 0.05);
    const y = Math.round(h * 0.65);
    ctx.font = `800 ${fontSize}px "SF Pro Display", "Helvetica Neue", -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.12));
    ctx.lineJoin = "round";
    ctx.strokeText(trimmedCaption, w / 2, y, w - 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(trimmedCaption, w / 2, y, w - 36);
  }, [caption]);

  const captureSnapshot = useCallback(() => {
    if (!isOpen || !selected || stage !== "config") return;
    const player = getPlayer();
    const preview = previewCanvasRef.current;
    if (!player || !preview) return;
    player.seek(selected.moment.startSec);

    requestAnimationFrame(() => {
      const source = player.getExportCanvas();
      const ctx = preview.getContext("2d");
      if (!ctx || !source) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      try {
        ctx.drawImage(source, 0, 0, preview.width, preview.height);
        snapshotRef.current = ctx.getImageData(0, 0, preview.width, preview.height);
      } catch (err) {
        console.warn("[ViralClipModal] snapshot failed:", err);
      }
      drawCaptionOverlay();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawCaptionOverlay, isOpen, selected, stage]);

  useEffect(() => {
    captureSnapshot();
  }, [captureSnapshot]);

  useEffect(() => {
    drawCaptionOverlay();
  }, [drawCaptionOverlay]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const wrapper = document.getElementById("caption-combo-wrapper");
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cyclePlatform = () => {
    setPlatform((prev) => PLATFORM_ORDER[(PLATFORM_ORDER.indexOf(prev) + 1) % PLATFORM_ORDER.length]);
  };

  const cycleQuality = () => {
    setQuality((prev) => QUALITY_ORDER[(QUALITY_ORDER.indexOf(prev) + 1) % QUALITY_ORDER.length]);
  };

  const handlePreviewPlay = () => {
    if (!selected) return;
    const player = getPlayer();
    if (!player) return;
    if (previewing) {
      player.pause();
      player.setRegion(undefined, undefined);
      setPreviewing(false);
      return;
    }
    player.setRegion(selected.moment.startSec, selected.moment.endSec);
    player.seek(selected.moment.startSec);
    player.setMuted(!includeAudio);
    player.play(true);
    setPreviewing(true);
  };

  useEffect(() => {
    const player = getPlayer();
    setPreviewing(false);
    if (!isOpen && player) {
      player.pause();
      player.setRegion(undefined, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedMoment]);

  const triggerDownload = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(artistName)}-${safeName(songTitle)}-moment${selectedMoment + 1}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [artistName, selectedMoment, songTitle]);

  const handleDownload = useCallback(async () => {
    if (!browserSupported) return;
    if (!selected) return;
    const player = getPlayer();
    if (!player) {
      console.error("[ViralClipModal] No player available");
      setStage("error");
      return;
    }

    const { w, h } = PLATFORMS[platform];
    const scale = QUALITY_SCALE[quality];
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);

    player.pause();
    player.wickBarEnabled = true;
    player.beatVisEnabled = true;

    const abort = new AbortController();
    abortRef.current = abort;
    setStage("rendering");
    setProgress(0);

    try {
      const blob = await exportVideoAsMP4({
        player,
        width,
        height,
        fps: 30,
        songDuration: selected.moment.endSec - selected.moment.startSec,
        startOffset: selected.moment.startSec,
        captionText: caption.trim() || undefined,
        audioSlice: includeAudio && audioUrl
          ? {
            audioUrl,
            startSec: selected.moment.startSec,
            endSec: selected.moment.endSec,
          }
          : undefined,
        onProgress: setProgress,
        signal: abort.signal,
      });

      setDownloadBlob(blob);
      triggerDownload(blob);
      setProgress(100);
      setStage("done");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[ViralClipModal] export failed", err);
        setStage("error");
      } else {
        setStage("config");
      }
    } finally {
      player.wickBarEnabled = false;
      player.beatVisEnabled = false;
      abortRef.current = null;
      player.setRegion(undefined, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, browserSupported, caption, includeAudio, platform, quality, selected, triggerDownload]);

  const selectionDuration = selected ? Math.max(0, selected.moment.endSec - selected.moment.startSec) : 0;
  const scaledResolution = useMemo(() => {
    const { w, h } = PLATFORMS[platform];
    const scale = QUALITY_SCALE[quality];
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }, [platform, quality]);

  const closeSafe = () => {
    if (stage === "rendering") return;
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeSafe(); }}>
      <DialogContent className="sm:max-w-[780px] p-0 border-0 [&>button]:hidden" style={{ background: "transparent", maxHeight: "calc(100dvh - 32px)" }}>
        <div style={{ background: "#0c0c0c", borderRadius: 20, padding: "14px 16px", color: "rgba(255,255,255,0.92)", fontFamily: '"SF Pro Display", "Helvetica Neue", -apple-system, sans-serif', display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)" }}>
          {stage === "rendering" && (
            <div style={{ minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 999, border: "3px solid rgba(255,255,255,0.16)", borderTopColor: "rgba(68,210,126,0.9)", animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 17, fontWeight: 700 }}>Rendering... {Math.round(progress)}%</div>
              <button onClick={() => abortRef.current?.abort()} style={{ border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "rgba(255,255,255,0.78)", borderRadius: 10, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <style>{"@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }"}</style>
            </div>
          )}

          {stage === "done" && (
            <div style={{ minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Done</div>
              <button onClick={() => downloadBlob && triggerDownload(downloadBlob)} disabled={!downloadBlob} style={{ border: "none", background: "rgba(68,210,126,0.9)", color: "#fff", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: downloadBlob ? "pointer" : "not-allowed", opacity: downloadBlob ? 1 : 0.5 }}>
                Download again
              </button>
              <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.88)", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Close
              </button>
            </div>
          )}

          {(stage === "config" || stage === "error") && (
            <>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexShrink: 0 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.3 }}>Share clip</div>
                <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.74)", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>

              {/* Two-column: left config, right preview */}
              <div style={{ display: "flex", gap: 14, minHeight: 320 }}>

                {/* Left column — config */}
                <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
                  {/* Moments row */}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, flexShrink: 0 }}>
                    {sortedMoments.map((m, idx) => {
                      const isSel = idx === selectedMoment;
                      const dur = Math.max(0, m.moment.endSec - m.moment.startSec);
                      return (
                        <button
                          key={`${m.moment.index}-${idx}`}
                          onClick={() => setSelectedMoment(idx)}
                          style={{
                            borderRadius: 10,
                            border: isSel ? "1px solid rgba(68,210,126,0.9)" : "1px solid rgba(255,255,255,0.12)",
                            background: isSel ? "rgba(68,210,126,0.13)" : "rgba(255,255,255,0.02)",
                            color: "inherit",
                            minWidth: 80,
                            padding: "6px 8px",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          {idx === 0 && <div style={{ color: "#44d27e", fontSize: 9, fontWeight: 700, marginBottom: 1 }}>top</div>}
                          <div style={{ fontSize: 11, fontWeight: 700 }}>Moment {m.moment.index + 1}</div>
                          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>{Math.round(m.fires)} · {Math.round(dur)}s</div>
                        </button>
                      );
                    })}
                    {sortedMoments.length === 0 && (
                      <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", padding: "12px 0", width: "100%" }}>
                        No moments available.
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <div id="caption-combo-wrapper" style={{ position: "relative", flexShrink: 0 }}>
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Add a caption..."
                      style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", color: "white", padding: "0 36px 0 10px", fontSize: 13, outline: "none" }}
                    />
                    <button onClick={() => setDropdownOpen((v) => !v)} style={{ position: "absolute", right: 6, top: 4, width: 28, height: 28, border: "none", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                      <ChevronDown size={14} />
                    </button>
                    {dropdownOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#161616", zIndex: 10, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 6 }}>
                        {commentSuggestions.length === 0 && (
                          <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>No suggestions yet.</div>
                        )}
                        {commentSuggestions.map((s) => (
                          <button key={s.text} onClick={() => { setCaption(s.text); setDropdownOpen(false); }} style={{ width: "100%", border: "none", background: "transparent", color: "inherit", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 6px", fontSize: 11, cursor: "pointer" }}>
                            <span style={{ textAlign: "left", opacity: 0.9 }}>{s.text}</span>
                            <span style={{ opacity: 0.7, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3 }}><Heart size={10} /> {s.votes}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {stage === "error" && <div style={{ fontSize: 11, color: "#ff9f9f", flexShrink: 0 }}>Export failed. Please retry.</div>}
                  {!browserSupported && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", flexShrink: 0 }}>Video export requires Chrome or Edge.</div>}

                  {/* Download button + settings */}
                  <div style={{ marginTop: "auto", flexShrink: 0 }}>
                    <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", marginBottom: 6 }}>
                      <button onClick={handleDownload} disabled={!selected || !browserSupported} style={{ flex: 1, height: 40, border: "none", background: "rgba(68,210,126,0.9)", color: "#ffffff", fontSize: 13, fontWeight: 700, cursor: selected && browserSupported ? "pointer" : "not-allowed", opacity: selected && browserSupported ? 1 : 0.35 }}>
                        Download for {PLATFORMS[platform].label}
                      </button>
                      <button onClick={cyclePlatform} style={{ width: 40, height: 40, border: "none", borderLeft: "1px solid rgba(255,255,255,0.15)", background: "rgba(68,210,126,0.75)", color: "rgba(255,255,255,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, opacity: 0.86 }}>
                      <button onClick={cycleQuality} style={{ border: "none", background: "transparent", color: "inherit", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        {quality} <ChevronDown size={12} />
                      </button>
                      <div>{scaledResolution.w} × {scaledResolution.h}</div>
                      <button onClick={() => setIncludeAudio((v) => !v)} style={{ border: "none", background: "transparent", color: "inherit", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        {includeAudio ? <Volume2 size={13} /> : <VolumeX size={13} />} {includeAudio ? "On" : "Off"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right column — preview */}
                <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#070707", width: "100%", height: 320, aspectRatio: previewAspect }}>
                    <canvas ref={previewCanvasRef} width={previewW} height={previewH} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
                    <button onClick={handlePreviewPlay} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.45)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      {previewing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                    </button>
                    <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, borderRadius: 999, background: "rgba(0,0,0,0.55)", padding: "3px 6px" }}>{Math.round(selectionDuration)}s</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
