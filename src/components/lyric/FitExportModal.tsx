/**
 * FitExportModal — Download export modal for the FIT tab.
 * Allows users to pick aspect ratio + quality, then exports via WebCodecs.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { X, Download, Check, AlertTriangle, Loader2, Info } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { exportVideoAsMP4, canExportVideo, probeEncoderSupport } from "@/engine/exportVideo";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";

type AspectRatio = "9:16" | "16:9" | "1:1";
type Quality = "1080p" | "720p" | "480p";
type ExportStage = "config" | "preparing" | "rendering" | "encoding" | "finalizing" | "done" | "error";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  getPlayer: (() => LyricDancePlayer | null) | null;
  songTitle: string;
  artistName: string;
}

const ASPECT_OPTIONS: { value: AspectRatio; label: string; sub: string }[] = [
  { value: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { value: "16:9", label: "16:9", sub: "YouTube" },
  { value: "1:1", label: "1:1", sub: "Social Post" },
];

const QUALITY_OPTIONS: { value: Quality; label: string; est: string }[] = [
  { value: "1080p", label: "1080p", est: "~5 min" },
  { value: "720p", label: "720p", est: "~2 min" },
  { value: "480p", label: "480p", est: "~1 min" },
];

const RESOLUTIONS: Record<Quality, Record<AspectRatio, { width: number; height: number }>> = {
  "1080p": { "9:16": { width: 1080, height: 1920 }, "16:9": { width: 1920, height: 1080 }, "1:1": { width: 1080, height: 1080 } },
  "720p":  { "9:16": { width: 720, height: 1280 },  "16:9": { width: 1280, height: 720 },  "1:1": { width: 720, height: 720 } },
  "480p":  { "9:16": { width: 480, height: 854 },   "16:9": { width: 854, height: 480 },   "1:1": { width: 480, height: 480 } },
};

export function FitExportModal({ isOpen, onClose, getPlayer, songTitle, artistName }: Props) {
  const [ratio, setRatio] = useState<AspectRatio>("9:16");
  const [quality, setQuality] = useState<Quality>("720p");
  const [stage, setStage] = useState<ExportStage>("config");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(0);
  const [etaText, setEtaText] = useState("");

  // Check browser support on open
  useEffect(() => {
    if (!isOpen) return;
    setBrowserSupported(canExportVideo());
  }, [isOpen]);

  // ETA calculation
  useEffect(() => {
    if (stage !== "rendering" || progress <= 2) { setEtaText(""); return; }
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const rate = progress / elapsed;
    if (rate <= 0) return;
    const remaining = (100 - progress) / rate;
    if (remaining < 60) setEtaText(`~${Math.ceil(remaining)}s remaining`);
    else setEtaText(`~${Math.ceil(remaining / 60)} min remaining`);
  }, [progress, stage]);

  // Cleanup blob on unmount
  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  const resetState = useCallback(() => {
    setStage("config");
    setProgress(0);
    setErrorMsg("");
    setEtaText("");
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }
  }, [blobUrl]);

  const handleClose = useCallback(() => {
    if (stage === "rendering" || stage === "preparing" || stage === "encoding" || stage === "finalizing") {
      // Don't close during export — user can cancel first
      return;
    }
    resetState();
    onClose();
  }, [stage, onClose, resetState]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    resetState();
  }, [resetState]);

  const handleStart = useCallback(async () => {
    const player = getPlayer?.();
    if (!player) return;

    if (!canExportVideo()) {
      setStage("error");
      setErrorMsg("Your browser doesn't support video export. Use Chrome or Edge (94+).");
      return;
    }

    const { width, height } = RESOLUTIONS[quality][ratio];
    const supported = await probeEncoderSupport(width, height);
    if (!supported) {
      setStage("error");
      setErrorMsg("Your browser's encoder doesn't support this resolution. Try a lower quality or use Chrome.");
      return;
    }

    const songDuration = player.getSongDuration();
    if (!songDuration || songDuration <= 0) {
      setStage("error");
      setErrorMsg("Could not determine song duration.");
      return;
    }

    player.pause();
    setStage("preparing");
    setProgress(0);
    startTimeRef.current = Date.now();

    const abort = new AbortController();
    abortRef.current = abort;

    // Small delay for preparing state visibility
    await new Promise(r => setTimeout(r, 300));
    if (abort.signal.aborted) return;

    setStage("rendering");

    try {
      const blob = await exportVideoAsMP4({
        player,
        width,
        height,
        fps: 30,
        songDuration,
        onProgress: (pct) => {
          setProgress(pct);
          if (pct >= 95) setStage("encoding");
          if (pct >= 99) setStage("finalizing");
        },
        signal: abort.signal,
      });

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setStage("done");
      setProgress(100);
    } catch (err: any) {
      if (err.name === "AbortError") {
        resetState();
        return;
      }
      console.error("[FitExportModal] export failed:", err);
      setStage("error");
      setErrorMsg(err.message || "Export failed. Try Chrome or Edge.");
    } finally {
      abortRef.current = null;
    }
  }, [getPlayer, quality, ratio, resetState]);

  const handleDownloadFile = useCallback(() => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    a.download = `${safe(artistName || "artist")}-${safe(songTitle || "song")}-${ratio.replace(":", "x")}-${quality}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [blobUrl, artistName, songTitle, ratio, quality]);

  const isExporting = stage === "preparing" || stage === "rendering" || stage === "encoding" || stage === "finalizing";

  const stageLabel: Record<ExportStage, string> = {
    config: "",
    preparing: "Preparing export…",
    rendering: `Rendering frames… ${progress}%`,
    encoding: "Encoding video…",
    finalizing: "Finalizing…",
    done: "Your video is ready.",
    error: "Export failed",
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-md bg-background border-border/60 p-0 gap-0 [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold tracking-tight text-foreground">Download Video</h2>
          {!isExporting && (
            <button onClick={handleClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* ── Config state ── */}
          {stage === "config" && (
            <>
              {/* Format */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRatio(opt.value)}
                      className={`flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-all text-center ${
                        ratio === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className="text-[9px] font-mono opacity-70">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Quality</label>
                <div className="grid grid-cols-3 gap-2">
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={`flex flex-col items-center gap-1 rounded-lg border py-3 px-2 transition-all text-center ${
                        quality === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className="text-[9px] font-mono opacity-70">{opt.est}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio notice */}
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                <Info size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Downloads are video-only. Add your music directly on TikTok, Instagram, or YouTube when posting.
                </p>
              </div>

              {/* Browser warning */}
              {!browserSupported && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                  <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-[11px] text-destructive leading-relaxed">
                    Video export requires Chrome or Edge (version 94+).
                  </p>
                </div>
              )}

              {/* Start button */}
              <button
                onClick={handleStart}
                disabled={!browserSupported || !getPlayer}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-semibold uppercase tracking-wide text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={14} />
                Start Download
              </button>
            </>
          )}

          {/* ── Exporting states ── */}
          {isExporting && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-muted-foreground">{stageLabel[stage]}</p>
                  {etaText && <p className="text-[10px] font-mono text-muted-foreground/60">{etaText}</p>}
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-2"
              >
                Cancel Export
              </button>
            </div>
          )}

          {/* ── Done state ── */}
          {stage === "done" && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check size={20} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{stageLabel.done}</p>
              </div>
              <button
                onClick={handleDownloadFile}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-semibold uppercase tracking-wide text-primary hover:bg-primary/20 transition-colors"
              >
                <Download size={14} />
                Download File
              </button>
              <button
                onClick={resetState}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Export Another
              </button>
            </div>
          )}

          {/* ── Error state ── */}
          {stage === "error" && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-destructive" />
                </div>
                <p className="text-sm font-semibold text-foreground">{stageLabel.error}</p>
                <p className="text-xs text-muted-foreground text-center">{errorMsg}</p>
              </div>
              <button
                onClick={resetState}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/40 py-3 text-sm font-semibold uppercase tracking-wide text-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
