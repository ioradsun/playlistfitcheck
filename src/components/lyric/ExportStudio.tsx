import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { deriveMomentFireCounts } from "@/lib/momentUtils";
import type { Moment } from "@/lib/buildMoments";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import { canExportVideo, exportVideoAsMP4 } from "@/engine/exportVideo";
import { SelectorCard } from "./SelectorCard";

interface ExportStudioProps {
  isOpen: boolean;
  onClose: () => void;
  getPlayer: () => LyricDancePlayer | null;
  moments: Moment[];
  fireHeat: Record<string, { line: Record<number, number>; total: number }>;
  comments: Array<{ text: string; line_index: number | null }>;
  songTitle: string;
  artistName: string;
  audioUrl: string;
  durationSec: number;
  empowermentHooks?: string[];
  hookVoteCounts?: number[];
}

const PLATFORMS = [
  { label: "TikTok / Reels / Shorts", ratio: "9:16 portrait", w: 1080, h: 1920, canvasW: 220, canvasH: 390 },
  { label: "Instagram square", ratio: "1:1 square", w: 1080, h: 1080, canvasW: 300, canvasH: 300 },
  { label: "YouTube / Twitter", ratio: "16:9 landscape", w: 1920, h: 1080, canvasW: 380, canvasH: 214 },
] as const;

function safeName(input: string): string {
  return (input || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "clip";
}

export function ExportStudio({
  isOpen,
  onClose,
  getPlayer,
  moments,
  fireHeat,
  comments,
  songTitle,
  artistName,
  audioUrl,
  durationSec,
  empowermentHooks,
  hookVoteCounts,
}: ExportStudioProps) {
  const [selectedMomentIdx, setSelectedMomentIdx] = useState(1);
  const [captionMode, setCaptionMode] = useState<"hook" | "custom">("hook");
  const [selectedHookIdx, setSelectedHookIdx] = useState(0);
  const [customCaption, setCustomCaption] = useState("");
  const [platformIdx, setPlatformIdx] = useState(0);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [exportStage, setExportStage] = useState<"ready" | "rendering" | "done" | "error">("ready");
  const [exportProgress, setExportProgress] = useState(0);
  const [openPanel, setOpenPanel] = useState<"moment" | "caption" | "platform" | null>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captionInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);

  const hooks = empowermentHooks ?? [];

  const sortedMoments = useMemo(() => {
    const fireCounts = deriveMomentFireCounts(fireHeat, moments);
    const ranked = moments
      .map((moment, index) => ({ moment, index, fires: fireCounts[index] ?? 0 }))
      .sort((a, b) => b.fires - a.fires);
    const fullVideo = {
      moment: { startSec: 0, endSec: durationSec, lines: [], index: -1 } as any,
      index: -1,
      fires: 0,
      isFull: true,
    };
    return [fullVideo, ...ranked];
  }, [fireHeat, moments, durationSec]);

  const activeSelection = sortedMoments[Math.min(selectedMomentIdx, sortedMoments.length - 1)] ?? sortedMoments[0];
  const activeCaption = captionMode === "custom"
    ? customCaption
    : (empowermentHooks?.[selectedHookIdx] ?? "");

  const totalVotes = (hookVoteCounts ?? []).reduce((sum, n) => sum + n, 0);

  const captionPositions = [
    { bottom: "22%", left: "8%", right: "20%", textAlign: "left" as const },
    { bottom: "18%", left: "8%", right: "8%", textAlign: "center" as const },
    { bottom: "18%", left: "10%", right: "10%", textAlign: "center" as const },
  ];

  const captionStyle: CSSProperties = {
    position: "absolute",
    ...captionPositions[platformIdx],
    fontSize: platformIdx === 2 ? 11 : 13,
    fontWeight: 800,
    color: "#ffffff",
    textShadow: "0 1px 4px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.4)",
    fontFamily: '"SF Pro Display", -apple-system, sans-serif',
    zIndex: 2,
    lineHeight: 1.3,
    wordBreak: "break-word",
    pointerEvents: "none",
  };

  useEffect(() => {
    if (!isOpen) return;
    setBrowserSupported(canExportVideo());
    setExportStage("ready");
    setExportProgress(0);
    setOpenPanel(null);
    setDownloadBlob(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !openPanel) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      const target = e.target as Node;
      if (!rootRef.current.contains(target)) return;
      const inSelector = (target as HTMLElement).closest("[data-selector-card='true']");
      if (!inSelector) setOpenPanel(null);
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isOpen, openPanel]);

  useEffect(() => {
    if (openPanel === "caption") {
      captionInputRef.current?.focus();
    }
  }, [openPanel]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const { canvasW, canvasH } = PLATFORMS[platformIdx];
    canvas.width = canvasW;
    canvas.height = canvasH;
  }, [platformIdx]);

  useEffect(() => {
    if (!isOpen || exportStage === "rendering") return;
    const player = getPlayer();
    const canvas = previewCanvasRef.current;
    if (!player || !canvas) return;

    let rafId = 0;
    const draw = () => {
      const source = player.getExportCanvas();
      const ctx = canvas.getContext("2d");
      if (ctx && source) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, exportStage, getPlayer]);

  useEffect(() => {
    if (!isOpen) return;
    const player = getPlayer();
    if (!player) return;
    if (!prevSizeRef.current) {
      prevSizeRef.current = { w: player.width, h: player.height };
    }
    const { w, h } = PLATFORMS[platformIdx];
    player.resize(w, h);
  }, [platformIdx, getPlayer, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const player = getPlayer();
    if (!player || !activeSelection) return;
    if ((activeSelection as any).isFull) {
      player.setRegion(undefined, undefined);
      player.seek(0);
    } else {
      player.setRegion(activeSelection.moment.startSec, activeSelection.moment.endSec);
      player.seek(activeSelection.moment.startSec);
    }
    player.setMuted(!includeAudio);
    player.play(true);
  }, [selectedMomentIdx, includeAudio, getPlayer, isOpen, activeSelection]);

  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    const player = getPlayer();
    if (player) {
      player.pause();
      player.setRegion(undefined, undefined);
      const prev = prevSizeRef.current;
      if (prev) {
        player.resize(prev.w, prev.h);
      }
    }
    prevSizeRef.current = null;
  }, [isOpen, getPlayer]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const triggerDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName(artistName)}-${safeName(songTitle)}-moment${selectedMomentIdx}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleDownload = async () => {
    if (!browserSupported || !activeSelection) return;
    const player = getPlayer();
    if (!player) {
      setExportStage("error");
      return;
    }

    const { w, h } = PLATFORMS[platformIdx];
    const startSec = (activeSelection as any).isFull ? 0 : activeSelection.moment.startSec;
    const endSec = (activeSelection as any).isFull ? durationSec : activeSelection.moment.endSec;

    const abort = new AbortController();
    abortRef.current = abort;
    setExportProgress(0);
    setExportStage("rendering");

    try {
      const blob = await exportVideoAsMP4({
        player,
        width: w,
        height: h,
        fps: 30,
        songDuration: Math.max(0, endSec - startSec),
        startOffset: startSec,
        captionText: activeCaption.trim() || undefined,
        audioSlice: includeAudio && audioUrl
          ? {
            audioUrl,
            startSec,
            endSec,
          }
          : undefined,
        onProgress: setExportProgress,
        signal: abort.signal,
      });
      setDownloadBlob(blob);
      setExportStage("done");
      triggerDownload(blob);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setExportStage("ready");
      } else {
        console.error("[ExportStudio] export failed", error);
        setExportStage("error");
      }
    } finally {
      abortRef.current = null;
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  const panelWidth = platformIdx === 2 ? 360 : 320;
  const momentTag = selectedMomentIdx === 0 ? "full" : `#${selectedMomentIdx} hottest`;
  const captionTag = captionMode === "custom"
    ? "custom"
    : selectedHookIdx >= hooks.length
      ? "none"
      : `fmly hook #${selectedHookIdx + 1}`;

  return createPortal(
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0a0a0a",
        fontFamily: '"SF Pro Display", -apple-system, sans-serif',
        color: "rgba(255,255,255,0.9)",
        display: "flex",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
          width: 32,
          height: 32,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.02)",
          color: "rgba(255,255,255,0.78)",
          fontSize: 18,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ×
      </button>

      <div
        style={{
          width: panelWidth,
          borderRight: "0.5px solid rgba(255,255,255,0.06)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          padding: "16px 0",
          gap: 12,
        }}
      >
        <SelectorCard
          label="Moment"
          tag={momentTag}
          mainText={selectedMomentIdx === 0 ? "Full video" : `Moment #${selectedMomentIdx}`}
          subTexts={[
            `${Math.round(((activeSelection?.moment.endSec ?? 0) - (activeSelection?.moment.startSec ?? 0)) || durationSec)}s`,
            `${Math.round(activeSelection?.fires ?? 0)} fire`,
          ]}
          isOpen={openPanel === "moment"}
          onToggle={() => setOpenPanel((curr) => (curr === "moment" ? null : "moment"))}
        >
          {sortedMoments.map((entry, idx) => {
            const isActive = idx === selectedMomentIdx;
            const duration = Math.max(0, entry.moment.endSec - entry.moment.startSec);
            const firePct = Math.min(1, (entry.fires ?? 0) / Math.max(1, sortedMoments[1]?.fires ?? 1));
            return (
              <button
                key={`${entry.index}-${idx}`}
                type="button"
                onClick={() => {
                  setSelectedMomentIdx(idx);
                  setOpenPanel(null);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  background: isActive ? "rgba(68,210,126,0.06)" : "transparent",
                  color: "inherit",
                  padding: "9px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: isActive ? "#44d27e" : "rgba(255,255,255,0.2)", boxShadow: isActive ? "0 0 8px rgba(68,210,126,0.7)" : "none" }} />
                  <div style={{ minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.83)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx === 0 ? "Full video" : `Moment #${idx}`}
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: '"SF Mono", monospace' }}>
                      {duration.toFixed(1)}s · {entry.moment.lines?.length ?? 0} lines
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {idx === 0 ? (
                    <span style={{ fontSize: 9, fontFamily: '"SF Mono", monospace', color: "rgba(255,255,255,0.42)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, padding: "2px 6px" }}>full</span>
                  ) : (
                    <>
                      <div style={{ width: 36, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(firePct * 100)}%`, height: "100%", background: "#44d27e" }} />
                      </div>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontFamily: '"SF Mono", monospace' }}>{Math.round(entry.fires)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </SelectorCard>

        <SelectorCard
          label="Caption"
          tag={captionTag}
          mainText={activeCaption || "(no caption)"}
          subTexts={[`${hooks.length} hooks`, `${totalVotes} votes`, `${comments.length} comments`]}
          isOpen={openPanel === "caption"}
          onToggle={() => setOpenPanel((curr) => (curr === "caption" ? null : "caption"))}
        >
          <input
            ref={captionInputRef}
            value={customCaption}
            placeholder="Type a custom caption..."
            onInput={(e) => {
              setCustomCaption((e.target as HTMLInputElement).value);
              setCaptionMode("custom");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") setOpenPanel(null);
            }}
            style={{
              width: "100%",
              border: "none",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
              fontSize: 12,
              padding: "8px 14px",
              outline: "none",
            }}
          />
          {customCaption.trim() && captionMode === "custom" && (
            <button
              type="button"
              onClick={() => {
                setCaptionMode("custom");
                setOpenPanel(null);
              }}
              style={{
                width: "100%",
                border: "none",
                borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                background: "rgba(68,210,126,0.06)",
                color: "rgba(255,255,255,0.9)",
                fontStyle: "italic",
                padding: "8px 14px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {customCaption}
            </button>
          )}
          {hooks.map((hook, idx) => {
            const votes = hookVoteCounts?.[idx] ?? 0;
            const pct = totalVotes > 0 ? `${Math.round((votes / totalVotes) * 100)}%` : "0%";
            const active = captionMode === "hook" && selectedHookIdx === idx;
            return (
              <button
                key={`${hook}-${idx}`}
                type="button"
                onClick={() => {
                  setCaptionMode("hook");
                  setSelectedHookIdx(idx);
                  setOpenPanel(null);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                  background: active ? "rgba(68,210,126,0.06)" : "transparent",
                  color: "rgba(255,255,255,0.82)",
                  padding: "8px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ fontStyle: "italic", fontSize: 12, textAlign: "left" }}>{hook}</span>
                <span style={{ fontFamily: '"SF Mono", monospace', fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{pct}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setCaptionMode("hook");
              setSelectedHookIdx(hooks.length);
              setOpenPanel(null);
            }}
            style={{
              width: "100%",
              border: "none",
              background: captionMode === "hook" && selectedHookIdx >= hooks.length ? "rgba(68,210,126,0.06)" : "transparent",
              color: "rgba(255,255,255,0.56)",
              padding: "8px 14px",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            (no caption)
          </button>
        </SelectorCard>

        <SelectorCard
          label="Platform"
          tag={PLATFORMS[platformIdx].ratio}
          mainText={PLATFORMS[platformIdx].label}
          subTexts={[`${PLATFORMS[platformIdx].w}×${PLATFORMS[platformIdx].h}`]}
          isOpen={openPanel === "platform"}
          onToggle={() => setOpenPanel((curr) => (curr === "platform" ? null : "platform"))}
        >
          {PLATFORMS.map((platform, idx) => {
            const active = idx === platformIdx;
            return (
              <button
                key={platform.label}
                type="button"
                onClick={() => {
                  setPlatformIdx(idx);
                  setOpenPanel(null);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                  background: active ? "rgba(68,210,126,0.06)" : "transparent",
                  color: "inherit",
                  padding: "9px 14px",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? "#44d27e" : "rgba(255,255,255,0.25)" }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.83)" }}>{platform.label}</span>
                </span>
                <span style={{ fontFamily: '"SF Mono", monospace', fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{platform.w}×{platform.h}</span>
              </button>
            );
          })}
        </SelectorCard>

        <div style={{ marginTop: "auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            onClick={() => setIncludeAudio((v) => !v)}
            style={{
              width: "100%",
              height: 34,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.8)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontFamily: '"SF Mono", monospace',
              cursor: "pointer",
            }}
          >
            Audio: {includeAudio ? "On" : "Off"}
          </button>

          {exportStage === "ready" && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!browserSupported}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: "none",
                background: "#44d27e",
                color: "#06170e",
                fontWeight: 800,
                cursor: browserSupported ? "pointer" : "not-allowed",
                opacity: browserSupported ? 1 : 0.5,
              }}
            >
              Download
            </button>
          )}

          {exportStage === "rendering" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Rendering {Math.round(exportProgress)}%</div>
              <div style={{ width: "100%", height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(exportProgress)}%`, height: "100%", background: "#44d27e" }} />
              </div>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                style={{ border: "1px solid rgba(255,255,255,0.16)", background: "transparent", color: "rgba(255,255,255,0.72)", borderRadius: 10, height: 34, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          )}

          {exportStage === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => downloadBlob && triggerDownload(downloadBlob)} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, cursor: "pointer" }}>
                Download again
              </button>
              <button type="button" onClick={onClose} style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.82)", cursor: "pointer" }}>
                Close
              </button>
            </div>
          )}

          {exportStage === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: "#ffadad", fontSize: 12 }}>Export failed. Retry.</div>
              <button type="button" onClick={() => void handleDownload()} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "#44d27e", color: "#06170e", fontWeight: 800, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, background: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: PLATFORMS[platformIdx].canvasW,
            height: PLATFORMS[platformIdx].canvasH,
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            background: "#000",
          }}
        >
          <canvas ref={previewCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          {activeCaption && <div style={captionStyle}>{activeCaption}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type { ExportStudioProps };
