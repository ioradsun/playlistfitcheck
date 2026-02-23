/**
 * LyricDanceExporter — Full-song lyric video export using the full render pipeline.
 *
 * Now uses ParticleEngine + DirectionInterpreter + renderText + renderParticles
 * to match the live Lyric Dance experience in exported videos.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PhysicsIntegrator,
  mulberry32,
  hashSeed,
  type PhysicsSpec,
} from "@/engine/PhysicsIntegrator";
import { getEffect, resolveEffectKey, type EffectState } from "@/engine/EffectRegistry";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import {
  computeFitFontSize,
  computeStackedLayout,
} from "@/engine/SystemStyles";
import type { BeatTick } from "@/engine/HookDanceEngine";
import { deriveSceneManifestFromSpec } from "@/engine/buildSceneManifest";
import { safeManifest } from "@/engine/validateManifest";
import { getBackgroundSystemForTime } from "@/engine/getBackgroundSystemForTime";
import { ParticleEngine } from "@/engine/ParticleEngine";
import { DirectionInterpreter, getCurrentTensionStage, getActiveShot } from "@/engine/DirectionInterpreter";
import { renderChapterBackground } from "@/engine/BackgroundDirector";
import { renderChapterLighting } from "@/engine/LightingDirector";
import { renderText, type TextState, type TextInput } from "@/engine/renderText";
import { getParticleConfigForTime, renderParticles, type ParticleState } from "@/engine/renderFrame";
import { animationResolver } from "@/engine/AnimationResolver";
import type { CinematicDirection, Chapter } from "@/types/CinematicDirection";
import type { SceneManifest } from "@/engine/SceneManifest";
import type { LyricLine } from "./LyricDisplay";

// ── Aspect ratio → canvas dimensions ────────────────────────────────────────

const RESOLUTION_PRESETS = {
  "720p": { scale: 0.667, label: "720p", sub: "Fast" },
  "1080p": { scale: 1.0, label: "1080p", sub: "HD" },
} as const;

const ASPECT_BASE: Record<string, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

const ASPECT_OPTIONS = [
  { key: "9:16", label: "9:16", sub: "TikTok / Reels" },
  { key: "1:1", label: "1:1", sub: "Instagram" },
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
  cinematicDirection?: CinematicDirection | null;
  sceneManifest?: SceneManifest | null;
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
  cinematicDirection,
  sceneManifest,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState<ResolutionKey>("720p");
  const [bgMode, setBgMode] = useState<BgMode>("system");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<
    "idle" | "generating_bg" | "rendering" | "encoding" | "done"
  >("idle");
  const cancelRef = useRef(false);
  const [aiBgLoading, setAiBgLoading] = useState(false);
  const [aiBgUrl, setAiBgUrl] = useState<string | null>(null);

  // Fetch AI background
  const fetchAiBg = useCallback(async () => {
    if (aiBgUrl || aiBgLoading) return;
    setAiBgLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "lyric-video-bg",
        {
          body: {
            manifest: safeManifest(
              deriveSceneManifestFromSpec({
                spec,
                mood,
                description,
                songTitle: title,
              }),
            ).manifest,
            userDirection: `Song: ${title} by ${artist}`,
          },
        },
      );
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
    const baseManifest = sceneManifest
      ? safeManifest(sceneManifest).manifest
      : safeManifest(
          deriveSceneManifestFromSpec({ spec, mood, description, songTitle: title }),
        ).manifest;

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

    // Particle canvas (offscreen)
    const particleCanvas = document.createElement("canvas");
    particleCanvas.width = cw;
    particleCanvas.height = ch;
    const particleCtx = particleCanvas.getContext("2d")!;

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
    videoStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));
    if (audioDest) {
      audioDest.stream
        .getAudioTracks()
        .forEach((t) => combinedStream.addTrack(t));
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: resolution === "1080p" ? 12_000_000 : 6_000_000,
    });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Initialize deterministic engine
    const integrator = new PhysicsIntegrator(spec);
    const rng = mulberry32(hashSeed(seed));
    const sortedBeats = [...beats].sort((a, b) => a.time - b.time);
    const sortedBeatTimes = sortedBeats.map((b) => b.time);
    const effectivePalette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];

    // ── Particle engine ──────────────────────────────────────────────
    let particleEngine: ParticleEngine | null = null;
    if (baseManifest.particleConfig?.system !== "none") {
      particleEngine = new ParticleEngine(baseManifest);
      particleEngine.setBounds({ x: 0, y: 0, w: cw, h: ch });
      particleEngine.init(baseManifest.particleConfig, baseManifest);
    }

    // ── Cinematic direction interpreter ──────────────────────────────
    let interpreter: DirectionInterpreter | null = null;
    if (cinematicDirection) {
      interpreter = new DirectionInterpreter(cinematicDirection, duration);
    }

    // ── Mutable state for particle + text layers ────────────────────
    const particleState: ParticleState = {
      configCache: { bucket: -1, config: null },
      slowFrameCount: 0,
      adaptiveMaxParticles: 200,
      frameCount: 0,
    };

    const textState: TextState = {
      xOffset: 0,
      yBase: 0,
      beatScale: 1,
      wordCounts: new Map(),
      seenAppearances: new Set(),
      wordHistory: new Map(),
      directiveCache: new Map(),
      evolutionCache: new Map(),
    };

    // Word width cache for export
    const wordWidthCache = new Map<string, number>();
    const getWordWidth = (word: string, fSize: number, fontFamily: string): number => {
      const key = `${word}:${fSize}:${fontFamily}`;
      if (wordWidthCache.has(key)) return wordWidthCache.get(key)!;
      ctx.font = `${fSize}px ${fontFamily}`;
      const w = ctx.measureText(word).width;
      wordWidthCache.set(key, w);
      return w;
    };

    if (audioEl) {
      try {
        await audioEl.play();
      } catch (e) {
        console.warn("Audio play failed:", e);
      }
    }

    mediaRecorder.start();
    const videoTrack = videoStream.getVideoTracks()[0] as any;

    let beatIndex = 0;
    let prevTime = songStart;
    let frame = 0;
    let lightIntensity = 0.5;

    const renderNextFrame = () => {
      if (cancelRef.current || frame >= totalFrames) {
        setStage("encoding");
        mediaRecorder.stop();
        if (audioEl) {
          audioEl.pause();
          audioEl.src = "";
        }
        if (audioCtx) audioCtx.close();
        return;
      }

      const currentTime = songStart + frame / FPS;
      const deltaMs = 1000 / FPS;

      // Scan beats
      while (
        beatIndex < sortedBeats.length &&
        sortedBeats[beatIndex].time <= currentTime
      ) {
        const beat = sortedBeats[beatIndex];
        if (beat.time > prevTime) {
          integrator.onBeat(beat.strength, beat.isDownbeat);
        }
        beatIndex++;
      }

      const state = integrator.tick();
      const songProgress = (currentTime - songStart) / Math.max(0.001, duration);
      const activeSystem = getBackgroundSystemForTime(baseManifest, songProgress, state.heat * 0.8);
      const activeLine = lines.find(
        (l) => currentTime >= l.start && currentTime < l.end,
      );
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;

      // Beat intensity from physics
      const currentBeatIntensity = Math.max(state.glow, state.shake * 2, 0);

      // ── Cinematic direction lookups ──────────────────────────────
      const chapter: Chapter = interpreter?.getCurrentChapter(songProgress) ?? {
        title: "default",
        startRatio: 0,
        endRatio: 1,
        emotionalArc: "steady",
        emotionalIntensity: 0.5,
        dominantColor: effectivePalette[0],
        lightBehavior: "steady",
        particleDirective: "ambient",
        backgroundDirective: "default",
        typographyShift: null,
      };
      const tensionStage = cinematicDirection
        ? getCurrentTensionStage(songProgress, cinematicDirection.tensionCurve)
        : null;
      const shot = cinematicDirection
        ? getActiveShot(activeLineIndex, cinematicDirection.shotProgression)
        : null;
      const isClimax = interpreter?.isClimaxMoment(songProgress) ?? false;
      const symbol = cinematicDirection?.symbolSystem;
      const activeWordPosition = { x: cw / 2, y: ch / 2 };

      // ── Draw frame ──

      // Background
      if (bgImage) {
        // AI background with Ken Burns
        const kbProgress = frame / totalFrames;
        const zoomFactor = 1 + kbProgress * 0.1;
        const sw = bgImage.width / zoomFactor;
        const sh = bgImage.height / zoomFactor;
        const sx = (bgImage.width - sw) / 2;
        const sy = (bgImage.height - sh) / 2;
        ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, cw, ch);
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(0, 0, cw, ch);
      } else {
        // Temporal ghosting: fade previous frame
        ctx.drawImage(ghostCanvas, 0, 0);
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, cw, ch);

        // System background
        drawSystemBackground(ctx, {
          system: activeSystem,
          physState: state,
          w: cw,
          h: ch,
          time: currentTime,
          beatCount: beatIndex,
          rng,
          palette: effectivePalette,
          hookStart: songStart,
          hookEnd: songEnd,
        });
      }

      // Chapter background + lighting (cinematic direction)
      if (interpreter && chapter) {
        renderChapterBackground(
          ctx,
          canvas,
          chapter,
          songProgress,
          currentBeatIntensity,
          currentTime,
          symbol,
        );
        renderChapterLighting(
          ctx,
          canvas,
          chapter,
          activeWordPosition,
          songProgress,
          currentBeatIntensity * lightIntensity,
          currentTime,
        );
      }

      // ── Particles ────────────────────────────────────────────────
      if (particleEngine) {
        const lineDir = activeLine && interpreter
          ? interpreter.getLineDirection(activeLineIndex)
          : null;
        const particleResult = renderParticles(
          particleCtx, ctx,
          {
            particleEngine,
            baseParticleConfig: baseManifest.particleConfig,
            timelineManifest: baseManifest,
            physicsSpec: spec,
            songProgress,
            beatIntensity: currentBeatIntensity,
            deltaMs,
            cw, ch,
            chapterDirective: chapter,
            isClimax,
            climaxMaxParticleDensity: cinematicDirection?.climax?.maxParticleDensity ?? null,
            tensionParticleDensity: tensionStage?.particleDensity ?? null,
            tensionLightBrightness: tensionStage?.lightBrightness ?? null,
            hasLineAnim: !!activeLine,
            particleBehavior: lineDir?.particleBehavior ?? null,
            interpreter,
            activeLineIndex,
          },
          particleState,
        );
        lightIntensity = particleResult.lightIntensity;
        // renderParticles already draws to ctx (textCtx param), no extra composite needed
      }

      // ── Text + word effects ─────────────────────────────────────
      if (activeLine) {
        const visibleLines = lines.filter(l => currentTime >= l.start && currentTime < l.end);

        const textResult = renderText(ctx, {
          lines: lines as any,
          activeLine: activeLine as any,
          activeLineIndex,
          visibleLines: visibleLines as any,
          currentTime,
          songProgress,
          beatIntensity: currentBeatIntensity,
          beatIndex,
          sortedBeats: sortedBeatTimes,
          cw, ch,
          effectivePalette,
          effectiveSystem: activeSystem,
          resolvedManifest: baseManifest,
          textPalette: effectivePalette,
          spec,
          state: {
            ...state,
            glow: state.glow * EXPORT_BLOOM_MULTIPLIER,
            shake: state.shake * 1.2,
          },
          interpreter,
          shot,
          tensionStage,
          chapterDirective: chapter,
          cinematicDirection: cinematicDirection ?? null,
          isClimax,
          particleEngine,
          rng,
          getWordWidth,
          isMobile: false,
          hardwareConcurrency: navigator.hardwareConcurrency ?? 4,
          devicePixelRatio: 1,
        }, textState);
      } else {
        // No active line — still draw fallback glow if needed
        // (silence between lines)
      }

      // Film grain (lighter for full song)
      drawFilmGrain(ctx, cw, ch, rng);

      // Progress bar
      const progressBarSongProgress = (currentTime - songStart) / (songEnd - songStart);
      ctx.save();
      ctx.fillStyle = effectivePalette[1] || "#a855f7";
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, ch - 3, cw * Math.max(0, Math.min(1, progressBarSongProgress)), 3);
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
      setTimeout(() => {
        setStage("idle");
        setProgress(0);
      }, 2000);
    };

    renderNextFrame();
  }, [
    aspectRatio,
    resolution,
    bgMode,
    aiBgUrl,
    spec,
    beats,
    lines,
    title,
    artist,
    audioFile,
    seed,
    cinematicDirection,
    sceneManifest,
  ]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const scale = RESOLUTION_PRESETS[resolution].scale;
  const [baseW, baseH] = ASPECT_BASE[aspectRatio] || ASPECT_BASE["9:16"];
  const cw = Math.round(baseW * scale);
  const ch = Math.round(baseH * scale);

  const songDuration =
    lines.length > 0
      ? Math.round(
          lines[lines.length - 1].end - Math.max(0, lines[0].start - 0.5),
        )
      : 0;
  const estimatedFrames = songDuration * FPS;
  const estimatedMinutes =
    resolution === "1080p"
      ? Math.ceil(estimatedFrames / 900)
      : Math.ceil(estimatedFrames / 1800);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isExporting) onOpenChange(v);
      }}
    >
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
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {artist}
            </p>
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
                <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">
                  Physics
                </span>
                <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">
                  {spec.system}
                </span>
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
                  {aiBgLoading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Sparkles size={10} />
                  )}
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
                  <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">
                    {opt.label}
                  </span>
                  <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">
                    {opt.sub}
                  </span>
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
              {(Object.keys(RESOLUTION_PRESETS) as ResolutionKey[]).map(
                (key) => {
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
                      <span className="text-[12px] font-semibold tracking-[0.1em] uppercase block">
                        {preset.label}
                      </span>
                      <span className="text-[9px] font-mono tracking-widest opacity-60 block mt-0.5">
                        {preset.sub}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Specs */}
          <div className="glass-card rounded-lg border border-border/30 p-3 space-y-1.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <span className="font-mono text-foreground">
                  {cw}×{ch}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">System</span>
                <span className="font-mono text-foreground capitalize">
                  {spec.system}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frames</span>
                <span className="font-mono text-foreground tabular-nums">
                  ~{estimatedFrames.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. time</span>
                <span className="font-mono text-foreground">
                  ~{estimatedMinutes} min
                </span>
              </div>
            </div>
            <div className="flex gap-1 mt-1">
              {(spec.palette || []).map((c, i) => (
                <div
                  key={i}
                  className="w-3.5 h-3.5 rounded-full border border-border/30"
                  style={{ backgroundColor: c }}
                />
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
                    {stage === "generating_bg"
                      ? "Generating background…"
                      : stage === "rendering"
                        ? "Rendering full song…"
                        : stage === "encoding"
                          ? "Encoding…"
                          : "Done!"}
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
