/**
 * LyricDanceExporter — Full-song lyric video export using the Hook Dance engine.
 *
 * Reuses PhysicsIntegrator + EffectRegistry to render ALL lines across the entire song,
 * with options for system backgrounds or AI-generated backgrounds, resolution, and aspect ratio.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Film, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PhysicsIntegrator, mulberry32, hashSeed, type PhysicsSpec, type PhysicsState } from "@/engine/PhysicsIntegrator";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import type { BeatTick } from "@/engine/HookDanceEngine";
import type { LyricLine } from "./LyricDisplay";

// ── Aspect ratio → canvas dimensions ────────────────────────────────────────

const RESOLUTION_PRESETS = {
  "720p": { scale: 0.667, label: "720p", sub: "Fast" },
  "1080p": { scale: 1.0, label: "1080p", sub: "HD" },
} as const;

const ASPECT_BASE: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1":  [1080, 1080],
  "16:9": [1920, 1080],
};

const ASPECT_OPTIONS = [
  { key: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { key: "1:1",  label: "1:1",  sub: "Instagram" },
  { key: "16:9", label: "16:9", sub: "YouTube" },
];

type BgMode = "system" | "ai";
type ResolutionKey = keyof typeof RESOLUTION_PRESETS;

const FPS = 30;
const EXPORT_BLOOM_MULTIPLIER = 2.0;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: PhysicsSpec;
  beats: BeatTick[];
  lines: LyricLine[];
  title: string;
  artist: string;
  audioFile: File;
  seed: string;
  mood?: string;
  description?: string;
}

export function LyricDanceExporter({
  open,
  onOpenChange,
  spec,
  beats,
  lines,
  title,
  artist,
  audioFile,
  seed,
  mood,
  description,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState<ResolutionKey>("720p");
  const [bgMode, setBgMode] = useState<BgMode>("system");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "generating_bg" | "rendering" | "encoding" | "done">("idle");
  const cancelRef = useRef(false);
  const [aiBgLoading, setAiBgLoading] = useState(false);
  const [aiBgUrl, setAiBgUrl] = useState<string | null>(null);

  // Fetch AI background
  const fetchAiBg = useCallback(async () => {
    if (aiBgUrl || aiBgLoading) return;
    setAiBgLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lyric-video-bg", {
        body: { title, artist, mood: mood || "cinematic", description },
      });
      if (error) throw error;
      if (data?.imageUrl) setAiBgUrl(data.imageUrl);
      else throw new Error("No image returned");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate background");
    } finally {
      setAiBgLoading(false);
    }
  }, [title, artist, mood, description, aiBgUrl, aiBgLoading]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setProgress(0);
    cancelRef.current = false;

    const scale = RESOLUTION_PRESETS[resolution].scale;
    const [baseW, baseH] = ASPECT_BASE[aspectRatio] || ASPECT_BASE["9:16"];
    const cw = Math.round(baseW * scale);
    const ch = Math.round(baseH * scale);

    // Determine song duration from lines
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const duration = songEnd - songStart;
    const totalFrames = Math.ceil(duration * FPS);

    if (totalFrames <= 0) {
      toast.error("No lines to render");
      setIsExporting(false);
      return;
    }

    // Load AI bg image if needed
    let bgImage: HTMLImageElement | null = null;
    if (bgMode === "ai" && aiBgUrl) {
      setStage("generating_bg");
      try {
        bgImage = await loadImage(aiBgUrl);
      } catch {
        toast.error("Failed to load AI background, using system background");
      }
    }

    setStage("rendering");

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
      audioEl.currentTime = songStart;
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audioEl);
      audioDest = audioCtx.createMediaStreamDestination();
      source.connect(audioDest);
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      source.connect(muteGain);
      muteGain.connect(audioCtx.destination);
    } catch (e) {
      console.warn("Could not set up audio for recording:", e);
    }

    // MediaRecorder
    const videoStream = canvas.captureStream(0);
    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
    if (audioDest) {
      audioDest.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: resolution === "1080p" ? 12_000_000 : 6_000_000,
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    // Initialize deterministic engine
    const integrator = new PhysicsIntegrator(spec);
    const rng = mulberry32(hashSeed(seed));
    const sortedBeats = [...beats].sort((a, b) => a.time - b.time);

    if (audioEl) {
      try { await audioEl.play(); } catch (e) { console.warn("Audio play failed:", e); }
    }

    mediaRecorder.start();
    const videoTrack = videoStream.getVideoTracks()[0] as any;

    let beatIndex = 0;
    let prevTime = songStart;
    let frame = 0;

    const renderNextFrame = () => {
      if (cancelRef.current || frame >= totalFrames) {
        setStage("encoding");
        mediaRecorder.stop();
        if (audioEl) { audioEl.pause(); audioEl.src = ""; }
        if (audioCtx) audioCtx.close();
        return;
      }

      const currentTime = songStart + (frame / FPS);

      // Scan beats
      while (beatIndex < sortedBeats.length && sortedBeats[beatIndex].time <= currentTime) {
        const beat = sortedBeats[beatIndex];
        if (beat.time > prevTime) {
          integrator.onBeat(beat.strength, beat.isDownbeat);
        }
        beatIndex++;
      }

      const state = integrator.tick();
      const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;

      // ── Draw frame ──

      // Background
      if (bgImage) {
        // AI background with Ken Burns
        const kbProgress = frame / totalFrames;
        const zoomFactor = 1 + kbProgress * 0.1; // subtle zoom over duration
        const sw = bgImage.width / zoomFactor;
        const sh = bgImage.height / zoomFactor;
        const sx = (bgImage.width - sw) / 2;
        const sy = (bgImage.height - sh) / 2;
        ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, cw, ch);
        // Darken overlay for text readability
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, 0, cw, ch);
      } else {
        // Temporal ghosting: fade previous frame
        ctx.drawImage(ghostCanvas, 0, 0);
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, cw, ch);

        // System background
        const bgPalette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];
        drawSystemBackground(ctx, {
          system: spec.system, physState: state, w: cw, h: ch,
          time: currentTime, beatCount: beatIndex,
          rng, palette: bgPalette, hookStart: songStart, hookEnd: songEnd,
        });
      }

      if (activeLine) {
        // Resolve effect
        let effectKey = "STATIC_RESOLVE";
        if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
          const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
          effectKey = spec.effect_pool[poolIdx];
        }
        const drawFn = getEffect(effectKey);

        const age = (currentTime - activeLine.start) * 1000;
        const lineDur = activeLine.end - activeLine.start;
        const lineProgress = Math.min(1, (currentTime - activeLine.start) / lineDur);
        const stackedLayout = computeStackedLayout(ctx, activeLine.text, cw, ch, spec.system);
        const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
          ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
          : computeFitFontSize(ctx, activeLine.text, cw, spec.system);

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
      }

      // Film grain (lighter for full song)
      drawFilmGrain(ctx, cw, ch, rng);

      // Progress bar
      const songProgress = (currentTime - songStart) / (songEnd - songStart);
      ctx.save();
      ctx.fillStyle = spec.palette?.[1] || "#a855f7";
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, ch - 3, cw * Math.max(0, Math.min(1, songProgress)), 3);
      ctx.restore();

      // System label
      ctx.save();
      ctx.font = `${Math.round(cw * 0.009)}px "Geist Mono", monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${spec.system} · lyric dance`, 16, ch - 12);
      ctx.restore();

      // Save to ghost buffer
      ghostCtx.drawImage(canvas, 0, 0);

      // Capture frame
      if (videoTrack && typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }

      frame++;
      prevTime = currentTime;
      setProgress(frame / totalFrames);

      // Use setTimeout for long renders to avoid blocking UI
      if (frame % 5 === 0) {
        setTimeout(renderNextFrame, 0);
      } else {
        requestAnimationFrame(renderNextFrame);
      }
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
      a.download = `${artist.replace(/[^a-zA-Z0-9]/g, "_")}_lyric_dance_${aspectRatio.replace(":", "x")}_${resolution}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setStage("done");
      setProgress(1);
      toast.success("Lyric Dance video exported!");
      setTimeout(() => { setStage("idle"); setProgress(0); }, 2000);
    };

    renderNextFrame();
  }, [aspectRatio, resolution, bgMode, aiBgUrl, spec, beats, lines, title, artist, audioFile, seed]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const scale = RESOLUTION_PRESETS[resolution].scale;
  const [baseW, baseH] = ASPECT_BASE[aspectRatio] || ASPECT_BASE["9:16"];
  const cw = Math.round(baseW * scale);
  const ch = Math.round(baseH * scale);

  const songDuration = lines.length > 0
    ? Math.round(lines[lines.length - 1].end - Math.max(0, lines[0].start - 0.5))
    : 0;
  const estimatedFrames = songDuration * FPS;
  const estimatedMinutes = resolution === "1080p"
    ? Math.ceil(estimatedFrames / 900) // ~30fps render speed at 1080p
    : Math.ceil(estimatedFrames / 1800); // ~60fps at 720p

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isExporting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground font-medium">
            Lyric Dance · Full Song
          </DialogTitle>
          <DialogDescription className="sr-only">
            Export your entire song as a lyric dance video
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Song info */}
          <div className="text-center space-y-0.5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{artist}</p>
            <p className="text-[10px] font-mono text-muted-foreground/50">
              {lines.length} lines · ~{songDuration}s
            </p>
          </div>

          {/* Background mode */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
              Background
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => !isExporting && setBgMode("system")}
                disabled={isExporting}
                className={`flex-1 py-2 rounded-md text-center transition-colors ${
                  bgMode === "system"
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">Physics</span>
                <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">{spec.system}</span>
              </button>
              <button
                onClick={() => {
                  if (isExporting) return;
                  setBgMode("ai");
                  fetchAiBg();
                }}
                disabled={isExporting}
                className={`flex-1 py-2 rounded-md text-center transition-colors ${
                  bgMode === "ai"
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block flex items-center justify-center gap-1">
                  {aiBgLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                  AI
                </span>
                <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">
                  {aiBgUrl ? "Ready" : aiBgLoading ? "Generating…" : "Generate"}
                </span>
              </button>
            </div>
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
                  className={`flex-1 py-2 rounded-md text-center transition-colors ${
                    aspectRatio === opt.key
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">{opt.label}</span>
                  <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground block mb-2">
              Resolution
            </label>
            <div className="flex gap-2">
              {(Object.keys(RESOLUTION_PRESETS) as ResolutionKey[]).map((key) => {
                const preset = RESOLUTION_PRESETS[key];
                return (
                  <button
                    key={key}
                    onClick={() => !isExporting && setResolution(key)}
                    disabled={isExporting}
                    className={`flex-1 py-2 rounded-md text-center transition-colors ${
                      resolution === key
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    } disabled:opacity-50`}
                  >
                    <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">{preset.label}</span>
                    <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">{preset.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specs */}
          <div className="glass-card rounded-lg border border-border/30 p-3 space-y-1.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <span className="font-mono text-foreground">{cw}×{ch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System</span>
                <span className="font-mono text-foreground capitalize">{spec.system}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frames</span>
                <span className="font-mono text-foreground tabular-nums">~{estimatedFrames.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. time</span>
                <span className="font-mono text-foreground">~{estimatedMinutes} min</span>
              </div>
            </div>
            <div className="flex gap-1 mt-1">
              {(spec.palette || []).map((c, i) => (
                <div key={i} className="w-3.5 h-3.5 rounded-full border border-border/30" style={{ backgroundColor: c }} />
              ))}
            </div>
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
                    {stage === "generating_bg" ? "Generating background…" :
                     stage === "rendering" ? "Rendering full song…" :
                     stage === "encoding" ? "Encoding…" : "Done!"}
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
                disabled={bgMode === "ai" && !aiBgUrl && !aiBgLoading}
                className="flex-1 text-[13px] font-semibold tracking-[0.15em] uppercase"
              >
                <Film size={12} className="mr-2" />
                Export Lyric Dance
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawFilmGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
) {
  ctx.save();
  ctx.globalAlpha = 0.03;
  const step = 8;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = Math.floor(rng() * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}
