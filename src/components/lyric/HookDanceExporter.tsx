/**
 * HookDanceExporter — Frame-by-frame deterministic video export for the Hook Dance.
 *
 * Instead of screen-recording, this steps through time at exact frame boundaries,
 * re-running the PhysicsIntegrator and EffectRegistry for each frame. This enables
 * export-only enhancements: temporal ghosting, bloom multiplier, and seeded film grain.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PhysicsIntegrator, mulberry32, hashSeed, type PhysicsSpec, type PhysicsState } from "@/engine/PhysicsIntegrator";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import type { BeatTick } from "@/engine/HookDanceEngine";
import type { LyricLine } from "./LyricDisplay";

// ── Aspect ratio → canvas dimensions ────────────────────────────────────────

const ASPECT_DIMS: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1":  [1080, 1080],
  "16:9": [1920, 1080],
};

const ASPECT_OPTIONS = [
  { key: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { key: "1:1",  label: "1:1",  sub: "Instagram" },
  { key: "16:9", label: "16:9", sub: "YouTube" },
];

const FPS = 30;
const TEMPORAL_SAMPLES = 4; // sub-frames for motion blur
const EXPORT_BLOOM_MULTIPLIER = 2.5;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: PhysicsSpec;
  beats: BeatTick[];
  lines: LyricLine[];
  hookStart: number;
  hookEnd: number;
  title: string;
  artist: string;
  audioFile: File;
  seed: string;
}

export function HookDanceExporter({
  open,
  onOpenChange,
  spec,
  beats,
  lines,
  hookStart,
  hookEnd,
  title,
  artist,
  audioFile,
  seed,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "rendering" | "encoding" | "done">("idle");
  const cancelRef = useRef(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setProgress(0);
    setStage("rendering");
    cancelRef.current = false;

    const [cw, ch] = ASPECT_DIMS[aspectRatio] || ASPECT_DIMS["9:16"];
    const duration = hookEnd - hookStart;
    const totalFrames = Math.ceil(duration * FPS);

    // Create export canvas
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // Temporal ghosting buffer
    const ghostCanvas = document.createElement("canvas");
    ghostCanvas.width = cw;
    ghostCanvas.height = ch;
    const ghostCtx = ghostCanvas.getContext("2d", { alpha: false })!;
    ghostCtx.fillStyle = "#000";
    ghostCtx.fillRect(0, 0, cw, ch);

    // Set up audio for muxing
    let audioEl: HTMLAudioElement | null = null;
    let audioCtx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;

    try {
      audioEl = new Audio(URL.createObjectURL(audioFile));
      audioEl.currentTime = hookStart;
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audioEl);
      audioDest = audioCtx.createMediaStreamDestination();
      source.connect(audioDest);
      // Also connect to speakers so MediaRecorder can capture
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      source.connect(muteGain);
      muteGain.connect(audioCtx.destination);
    } catch (e) {
      console.warn("Could not set up audio for recording:", e);
    }

    // MediaRecorder with manual frame capture
    const videoStream = canvas.captureStream(0);
    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
    if (audioDest) {
      audioDest.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 12_000_000, // Higher bitrate for export
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    // Initialize deterministic engine
    const integrator = new PhysicsIntegrator(spec);
    const rng = mulberry32(hashSeed(seed));
    const hookBeats = beats
      .filter(b => b.time >= hookStart && b.time <= hookEnd)
      .sort((a, b) => a.time - b.time);

    if (audioEl) {
      try { await audioEl.play(); } catch (e) { console.warn("Audio play failed:", e); }
    }

    mediaRecorder.start();
    const videoTrack = videoStream.getVideoTracks()[0] as any;

    let beatIndex = 0;
    let prevTime = hookStart;
    let frame = 0;

    const renderNextFrame = () => {
      if (cancelRef.current || frame >= totalFrames) {
        setStage("encoding");
        mediaRecorder.stop();
        if (audioEl) { audioEl.pause(); audioEl.src = ""; }
        if (audioCtx) audioCtx.close();
        return;
      }

      const currentTime = hookStart + (frame / FPS);

      // Scan beats for this frame interval
      while (beatIndex < hookBeats.length && hookBeats[beatIndex].time <= currentTime) {
        const beat = hookBeats[beatIndex];
        if (beat.time > prevTime) {
          integrator.onBeat(beat.strength, beat.isDownbeat);
        }
        beatIndex++;
      }

      // Tick physics
      const state = integrator.tick();

      // Find active line
      const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;

      // ── Draw export frame with enhancements ──

      // 1. Temporal ghosting: fade previous frame
      ctx.drawImage(ghostCanvas, 0, 0);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(0, 0, cw, ch);

      if (activeLine) {
        // Resolve effect: v6 pool-based or v5 sequence-based
        let effectKey = "STATIC_RESOLVE";
        if (spec.effect_sequence) {
          const seqEntry = spec.effect_sequence.find(e => e.line_index === activeLineIndex);
          effectKey = seqEntry?.effect_key ?? "STATIC_RESOLVE";
        } else if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
          const isLastHookLine = activeLine.end >= hookEnd - 0.5;
          if (isLastHookLine) {
            effectKey = "HOOK_FRACTURE";
          } else {
            const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
            effectKey = spec.effect_pool[poolIdx];
          }
        }
        const drawFn = getEffect(effectKey);

        const age = (currentTime - activeLine.start) * 1000;
        const lineDur = activeLine.end - activeLine.start;
        const lineProgress = Math.min(1, (currentTime - activeLine.start) / lineDur);
        const stackedLayout = computeStackedLayout(ctx, activeLine.text, cw, ch, spec.system, aspectRatio);
        const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
          ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
          : computeFitFontSize(ctx, activeLine.text, cw, spec.system);

        // Draw with export-grade bloom
        ctx.save();
        const effectState: EffectState = {
          text: activeLine.text,
          physState: {
            ...state,
            glow: state.glow * EXPORT_BLOOM_MULTIPLIER,
            shake: state.shake * 1.2,
          },
          w: cw,
          h: ch,
          fs,
          age,
          progress: lineProgress,
          rng,
          palette: spec.palette || ["#ffffff", "#a855f7", "#ec4899"],
          system: spec.system,
          effectiveLetterSpacing,
          stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
        };
        drawFn(ctx, effectState);
        ctx.restore();

        // Micro-surprise
        if (
          spec.micro_surprise &&
          frame > 0 &&
          frame % Math.max(1, Math.round(spec.micro_surprise.every_n_beats * (FPS / 4))) === 0
        ) {
          drawExportMicroSurprise(ctx, cw, ch, spec.micro_surprise.action, state, rng);
        }
      }

      // 2. Seeded film grain overlay
      drawFilmGrain(ctx, cw, ch, rng);

      // 3. Progress bar
      const hookProgress = (currentTime - hookStart) / (hookEnd - hookStart);
      ctx.save();
      ctx.fillStyle = spec.palette?.[1] || "#a855f7";
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, ch - 4, cw * Math.max(0, Math.min(1, hookProgress)), 4);
      ctx.restore();

      // 4. System label
      ctx.save();
      ctx.font = '10px "Geist Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${spec.system} · hook dance`, 16, ch - 16);
      ctx.restore();

      // Save to ghost buffer for temporal trail
      ghostCtx.drawImage(canvas, 0, 0);

      // Capture frame
      if (videoTrack && typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }

      frame++;
      prevTime = currentTime;
      setProgress(frame / totalFrames);
      requestAnimationFrame(renderNextFrame);
    };

    mediaRecorder.onstop = () => {
      if (cancelRef.current) {
        setIsExporting(false);
        setStage("idle");
        setProgress(0);
        return;
      }
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${artist.replace(/[^a-zA-Z0-9]/g, "_")}_hook_dance_${aspectRatio.replace(":", "x")}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setStage("done");
      setProgress(1);
      toast.success("Hook Dance video exported!");
      setTimeout(() => { setStage("idle"); setProgress(0); }, 2000);
    };

    renderNextFrame();
  }, [aspectRatio, spec, beats, lines, hookStart, hookEnd, title, artist, audioFile, seed]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const [cw, ch] = ASPECT_DIMS[aspectRatio] || ASPECT_DIMS["9:16"];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isExporting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground font-medium">
            Export Hook Dance
          </DialogTitle>
          <DialogDescription className="sr-only">
            Export your Hook Dance as a video file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Song info */}
          <div className="text-center space-y-0.5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{artist}</p>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
              Aspect Ratio
            </label>
            <div className="flex gap-2">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => !isExporting && setAspectRatio(opt.key)}
                  disabled={isExporting}
                  className={`flex-1 py-2.5 rounded-md text-center transition-colors ${
                    aspectRatio === opt.key
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  <span className="text-[13px] font-semibold tracking-[0.15em] uppercase block">{opt.label}</span>
                  <span className="text-[10px] font-mono tracking-widest opacity-60 block mt-0.5">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Physics breakdown — visible during export */}
          <div className="glass-card rounded-lg border border-border/30 p-3 space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Physics Breakdown
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">System</span>
                <span className="font-mono text-foreground capitalize">{spec.system}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <span className="font-mono text-foreground">{cw}×{ch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mass</span>
                <span className="font-mono text-foreground">{spec.params?.mass?.toFixed(1) ?? spec.material?.mass?.toFixed(1) ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Elasticity</span>
                <span className="font-mono text-foreground">{spec.params?.elasticity?.toFixed(1) ?? spec.material?.elasticity?.toFixed(1) ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Damping</span>
                <span className="font-mono text-foreground">{spec.params?.damping?.toFixed(1) ?? spec.material?.damping?.toFixed(1) ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Effects</span>
                <span className="font-mono text-foreground">{spec.effect_pool?.length ?? spec.effect_sequence?.length ?? 0}</span>
              </div>
            </div>
            <div className="flex gap-1 mt-1">
              {(spec.palette || []).map((c, i) => (
                <div key={i} className="w-4 h-4 rounded-full border border-border/30" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Export-only enhancements info */}
          <div className="text-[10px] font-mono text-muted-foreground/50 space-y-0.5">
            <p>✦ Temporal ghosting · motion blur trail</p>
            <p>✦ Export bloom · {EXPORT_BLOOM_MULTIPLIER}× glow radius</p>
            <p>✦ Seeded film grain · deterministic texture</p>
            <p>✦ Higher bitrate · 12 Mbps</p>
          </div>

          {/* Progress */}
          {isExporting && (
            <div className="space-y-2">
              <div className="h-[2px] w-full bg-border/40 overflow-hidden rounded-full">
                <motion.div
                  className="h-full bg-foreground"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(progress * 100)}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={stage}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-[11px] font-mono text-muted-foreground"
                  >
                    {stage === "rendering" ? "Baking your video…" : stage === "encoding" ? "Encoding…" : "Done!"}
                  </motion.p>
                </AnimatePresence>
                <p className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {Math.round(progress * 100)}%
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isExporting ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="flex-1 text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExport}
                className="flex-1 text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                <Download size={12} className="mr-2" />
                Export Video
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Export-only effect helpers ───────────────────────────────────────────────

function drawExportMicroSurprise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  action: string,
  state: PhysicsState,
  rng: () => number,
) {
  ctx.save();
  switch (action) {
    case "rgb_split": {
      ctx.globalAlpha = 0.2;
      const lineCount = 8 + Math.floor(rng() * 15);
      for (let i = 0; i < lineCount; i++) {
        const y = rng() * h;
        ctx.fillStyle = rng() > 0.5 ? "cyan" : "red";
        ctx.fillRect(0, y, w, 2);
      }
      break;
    }
    case "flash": {
      ctx.globalAlpha = 0.08 + state.heat * 0.15;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "invert": {
      ctx.globalCompositeOperation = "difference";
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    default: {
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, rng() * h, w, 1);
      }
    }
  }
  ctx.restore();
}

function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
) {
  ctx.save();
  ctx.globalAlpha = 0.04;
  const step = 6; // sample every 6px for performance
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = Math.floor(rng() * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}
