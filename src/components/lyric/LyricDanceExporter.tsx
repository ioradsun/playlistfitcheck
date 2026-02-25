import { useState, useRef, useEffect } from "react";
import { X, Play, Pause, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getBackgroundSystemForTime } from "@/engine/getBackgroundSystemForTime";
import { ParticleEngine } from "@/engine/ParticleEngine";
import { DirectionInterpreter } from "@/engine/DirectionInterpreter";
import { renderSectionBackground } from "@/engine/BackgroundDirector";
import { renderSectionLighting } from "@/engine/LightingDirector";
import { renderText, type TextState, type TextInput } from "@/engine/renderText";
import { renderSymbol } from "@/engine/SymbolRenderer";
import { getParticleConfigForTime, renderParticles, type ParticleState } from "@/engine/renderFrame";
import { animationResolver } from "@/engine/AnimationResolver";
import type { CinematicDirection, Chapter, CinematicSection, WordDirective } from "@/types/CinematicDirection";
import type { SceneManifest } from "@/engine/SceneManifest";
import type { LyricLine } from "./LyricDisplay";
import { ensureFullTensionCurve } from "@/engine/presetDerivation";

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

const FPS = 60; // Smooth 60fps video

// Helpers
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export function LyricDanceExporter({
  isOpen,
  onClose,
  lines,
  songStart,
  songEnd,
  beats,
  spec,
  audioUrl,
  cinematicDirection,
  sceneManifest,
}: {
  isOpen: boolean;
  onClose: () => void;
  lines: LyricLine[];
  songStart: number;
  songEnd: number;
  beats: Array<{ time: number; strength: number; isDownbeat: boolean }>;
  spec: any;
  audioUrl: string;
  cinematicDirection: CinematicDirection | null;
  sceneManifest: SceneManifest | null;
}) {
  const [stage, setStage] = useState<"idle" | "rendering" | "encoding" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [resolution, setResolution] = useState<keyof typeof RESOLUTION_PRESETS>("1080p");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  const duration = songEnd - songStart;
  const seed = sceneManifest?.seed || "default-seed";

  // Use base manifest with fallbacks
  const baseManifest: SceneManifest = sceneManifest ?? {
    seed: "fallback",
    systemType: "nebula",
    palette: ["#000", "#fff", "#888"],
    particleConfig: { system: "stars", density: 0.5, speed: 0.5, size: [1, 3], opacity: [0.5, 1], direction: "up", beatReactive: true },
    beatGrid: { bpm: 120, beats: [], confidence: 1 },
    physicsSpec: { params: { heat: 0.5, tension: 0.5, velocity: 0.5 } }
  };

  const startExport = async () => {
    if (!canvasRef.current || !particleCanvasRef.current || !textCanvasRef.current || !ghostCanvasRef.current) return;
    setStage("rendering");
    setProgress(0);
    cancelRef.current = false;
    setError(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const particleCanvas = particleCanvasRef.current;
    const particleCtx = particleCanvas.getContext("2d")!;
    const textCanvas = textCanvasRef.current;
    const textCtx = textCanvas.getContext("2d")!;
    const ghostCanvas = ghostCanvasRef.current;
    const ghostCtx = ghostCanvas.getContext("2d")!;

    // Setup resolution
    const [baseW, baseH] = ASPECT_BASE[aspectRatio];
    const scale = RESOLUTION_PRESETS[resolution].scale;
    const cw = Math.round(baseW * scale);
    const ch = Math.round(baseH * scale);

    [canvas, particleCanvas, textCanvas, ghostCanvas].forEach((c) => {
      c.width = cw;
      c.height = ch;
    });

    const totalFrames = Math.ceil(duration * FPS);
    const stream = canvas.captureStream(FPS);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: resolution === "1080p" ? 8000000 : 4000000,
    });

    // Audio setup
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const videoStream = dest.stream;
    let audioEl: HTMLAudioElement | null = null;

    try {
      if (audioUrl) {
        audioEl = new Audio(audioUrl);
        audioEl.crossOrigin = "anonymous";
        audioEl.currentTime = songStart;
        const source = audioCtx.createMediaElementSource(audioEl);
        source.connect(dest);
        const tracks = videoStream.getAudioTracks();
        if (tracks.length > 0) {
          stream.addTrack(tracks[0]);
        }
      }
    } catch (e) {
      console.warn("Audio export setup failed:", e);
    }

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Initialize deterministic engine
    const integrator = new PhysicsIntegrator(spec);
    const rng = mulberry32(hashSeed(seed));
    const sortedBeats = [...beats].sort((a, b) => a.time - b.time);
    const effectivePalette = spec.palette || ["#ffffff", "#a855f7", "#ec4899"];

    // ── Cinematic direction interpreter ──────────────────────────────
    // Use new-schema compatible object
    const normalizedCinematicDirection = cinematicDirection
      ? cinematicDirection
      : null;

    // ── Particle engine ──────────────────────────────────────────────
    let particleEngine: ParticleEngine | null = null;
    if (baseManifest.particleConfig?.system !== "none") {
      particleEngine = new ParticleEngine(baseManifest);
      particleEngine.setBounds({ x: 0, y: 0, w: cw, h: ch });
      if (normalizedCinematicDirection?.visualWorld?.particleSystem) {
        particleEngine.setSystem(normalizedCinematicDirection.visualWorld.particleSystem);
      }
      particleEngine.init(baseManifest.particleConfig, baseManifest);
    }

    let interpreter: DirectionInterpreter | null = null;
    if (normalizedCinematicDirection) {
      interpreter = new DirectionInterpreter(normalizedCinematicDirection, duration);
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

    let beatIndex = 0;
    let prevTime = songStart;
    let frame = 0;
    let lightIntensity = 0.5;

    // AI background (if available) - simplified for exporter
    const bgImage = null; // To implement if needed

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
      // Use getRenderSection for drawing props (color, intensity, etc)
      const renderSection = interpreter?.getRenderSection(songProgress, effectivePalette) ?? {
        title: "default",
        emotionalIntensity: 0.5,
        dominantColor: effectivePalette[0],
        lightBehavior: "steady",
        particleDirective: "ambient",
        backgroundDirective: "default",
        typographyShift: null,
      };

      // Get actual section for layout/logic if needed
      const currentSection = interpreter?.getCurrentSection(songProgress);

      const tensionStage = interpreter?.getIntensity(songProgress) ?? 0.5; // Simplified tension
      const shot = normalizedCinematicDirection
        ? interpreter?.getLineDirection(activeLineIndex) // map to line direction
        : null;
      const isClimax = interpreter?.isClimaxMoment(songProgress) ?? false;
      // Symbol system removed - pass null
      const symbol = null;
      const activeWordPosition = { x: cw / 2, y: ch / 2 };

      // ── Draw frame ──

      // Background
      // Temporal ghosting: fade previous frame
      ctx.drawImage(ghostCanvas, 0, 0);
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(0, 0, cw, ch);

      // System background (procedural fallback)
      // (Simplified drawSystemBackground call for exporter - can be expanded)

      // Chapter background + lighting (cinematic direction)
      if (interpreter && renderSection) {
        renderSectionBackground(
          ctx,
          canvas,
          renderSection,
          songProgress,
          currentBeatIntensity,
          currentTime,
        );
        renderSectionLighting(
          ctx,
          canvas,
          renderSection,
          activeWordPosition,
          songProgress,
          currentBeatIntensity * lightIntensity,
          currentTime,
        );
      }

      if (symbol) {
        renderSymbol(ctx, symbol, songProgress, cw, ch);
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
            chapterDirective: renderSection,
            isClimax,
            climaxMaxParticleDensity: normalizedCinematicDirection?.climax?.maxParticleDensity ?? null,
            tensionParticleDensity: null, // tensionStage?.particleDensity ?? null,
            tensionLightBrightness: null, // tensionStage?.lightBrightness ?? null,
            hasLineAnim: !!activeLine,
            particleBehavior: lineDir?.particleBehavior ?? null,
            interpreter,
            activeLineIndex,
          },
          particleState,
        );
        lightIntensity = particleResult.lightIntensity;
      }

      // ── Text + word effects ─────────────────────────────────────
      if (activeLine) {
        const visibleLines = lines.filter(l => currentTime >= l.start && currentTime < l.end);

        const textResult = renderText(ctx, {
          lines,
          activeLine,
          activeLineIndex,
          visibleLines,
          currentTime,
          songProgress,
          beatIntensity: currentBeatIntensity,
          beatIndex,
          sortedBeats: sortedBeats.map(b => b.time),
          cw, ch,
          effectivePalette,
          effectiveSystem: activeSystem,
          resolvedManifest: baseManifest,
          textPalette: effectivePalette,
          spec,
          state: {
            scale: 1, shake: 0, offsetX: 0, offsetY: 0, rotation: 0,
            blur: 0, glow: 0, isFractured: false, position: 0,
            velocity: 0, heat: 0, safeOffset: 0, shatter: 0,
            wordOffsets: []
          },
          interpreter,
          shot: null, // ShotType deprecated
          tensionStage: null, // TensionStage deprecated
          chapterDirective: null, // Legacy Chapter deprecated
          cinematicDirection: normalizedCinematicDirection,
          isClimax,
          particleEngine: particleEngine ? { setDensityMultiplier: particleEngine.setDensityMultiplier.bind(particleEngine) } : null,
          rng,
          getWordWidth,
          isMobile: false,
          hardwareConcurrency: 4,
          devicePixelRatio: 1,
        }, textState);

        activeWordPosition.x = textResult.activeWordPosition.x;
        activeWordPosition.y = textResult.activeWordPosition.y;
      }

      // Draw ghost canvas for next frame
      ghostCtx.clearRect(0, 0, cw, ch);
      ghostCtx.drawImage(canvas, 0, 0);

      prevTime = currentTime;
      frame++;
      setProgress((frame / totalFrames) * 100);
      requestAnimationFrame(renderNextFrame);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lyric-dance-export-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setStage("done");
      if (onClose) onClose();
    };

    renderNextFrame();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Export Video</h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={stage === "rendering" || stage === "encoding"}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {stage === "idle" || stage === "done" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setAspectRatio(opt.key)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    aspectRatio === opt.key
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  <div className="font-bold text-sm mb-1">{opt.label}</div>
                  <div className="text-[10px] opacity-70">{opt.sub}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {Object.entries(RESOLUTION_PRESETS).map(([key, conf]) => (
                <button
                  key={key}
                  onClick={() => setResolution(key as any)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    resolution === key
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  <div className="font-bold text-sm mb-1">{conf.label}</div>
                  <div className="text-[10px] opacity-70">{conf.sub}</div>
                </button>
              ))}
            </div>

            <Button className="w-full h-12 text-lg font-bold" onClick={startExport}>
              Start Render
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-8 text-center">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div
                className="absolute inset-0 border-4 border-primary rounded-full transition-all duration-300"
                style={{ clipPath: `inset(0 0 ${100 - progress}% 0)` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-2xl">
                {Math.round(progress)}%
              </div>
            </div>
            <div>
              <div className="text-white font-medium mb-1">
                {stage === "rendering" ? "Rendering Frames..." : "Encoding Video..."}
              </div>
              <div className="text-sm text-zinc-500">
                Please keep this tab open
              </div>
            </div>
          </div>
        )}

        {/* Hidden canvases for rendering */}
        <div className="hidden">
          <canvas ref={canvasRef} />
          <canvas ref={particleCanvasRef} />
          <canvas ref={textCanvasRef} />
          <canvas ref={ghostCanvasRef} />
        </div>
      </div>
    </div>
  );
}
