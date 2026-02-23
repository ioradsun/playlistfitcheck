/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Ungated, lightweight — bypasses main provider tree like ShareableHook.
 * Renders the full song with the physics engine on a canvas.
 * Social features: artist header, canvas comments, signal buttons.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
// lucide icons removed — HUD uses no icons

import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { getSymbolStateForProgress } from "@/engine/BackgroundDirector";
import { renderBackground, renderParticles, type BackgroundState, type ParticleState } from "@/engine/renderFrame";
import { renderText, type TextState } from "@/engine/renderText";
import { ParticleEngine } from "@/engine/ParticleEngine";
import type { ParticleConfig, SceneManifest } from "@/engine/SceneManifest";
import { animationResolver } from "@/engine/AnimationResolver";
import { deriveCanvasManifest } from "@/engine/deriveCanvasManifest";
import BeatAnalyzerWorker from "@/workers/beatAnalyzer.worker?worker";
import * as WordClassifier from "@/engine/WordClassifier";
import { DirectionInterpreter, ensureFullTensionCurve, getActiveShot, getCurrentTensionStage } from "@/engine/DirectionInterpreter";
import type { CinematicDirection, TensionStage, WordDirective } from "@/types/CinematicDirection";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import { getSessionId } from "@/lib/sessionId";
import { LyricDanceDebugPanel } from "@/components/lyric/LyricDanceDebugPanel";
import { renderSymbol } from "@/engine/SymbolRenderer";

/** Live debug state updated every frame from the render loop */
interface LiveDebugState {
  // Beat
  beatIntensity: number;
  physGlow: number;
  // Physics Engine
  physicsActive: boolean;
  wordCount: number;
  heat: number;
  velocity: number;
  rotation: number;
  lastBeatForce: number;
  // Animation
  effectKey: string;
  entryProgress: number;
  exitProgress: number;
  activeMod: string | null;
  fontScale: number;
  scale: number;
  lineColor: string;
  isHookLine: boolean;
  repIndex: number;
  repTotal: number;
  // Particles
  particleSystem: string;
  particleDensity: number;
  particleSpeed: number;
  particleCount: number;
  songSection: string;
  // Position
  xOffset: number;
  yBase: number;
  xNudge: number;
  shake: number;
  // Background
  backgroundSystem: string;
  imageLoaded: boolean;
  zoom: number;
  vignetteIntensity: number;
  songProgress: number;
  // Direction
  dirThesis: string;
  dirChapter: string;
  dirChapterProgress: number;
  dirIntensity: number;
  dirBgDirective: string;
  dirLightBehavior: string;
  symbolPrimary: string;
  symbolSecondary: string;
  symbolState: string;
  cameraDistance: string;
  cameraMovement: string;
  tensionStage: string;
  tensionMotion: number;
  tensionParticles: number;
  tensionTypo: number;
  // Word Directive
  wordDirectiveWord: string;
  wordDirectiveKinetic: string;
  wordDirectiveElemental: string;
  wordDirectiveEmphasis: number;
  wordDirectiveEvolution: string;
  // Line Direction
  lineHeroWord: string;
  lineEntry: string;
  lineExit: string;
  lineIntent: string;
  shotType: string;
  shotDescription: string;
  // Evolution
  evolutionWord: string;
  evolutionCount: number;
  evolutionScale: number;
  evolutionGlow: number;
  evolutionBubbles: number;
  evolutionSinkPx: number;
  // Performance
  fps: number;
  drawCalls: number;
  cacheHits: number;
  // Meta
  time: number;
}

/** Compact engine debug HUD — toggled with D key */
function LiveDebugHUD({ stateRef }: { stateRef: React.MutableRefObject<LiveDebugState> }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<LiveDebugState>(stateRef.current);

  // Toggle with D key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Poll at 100ms
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setSnap({ ...stateRef.current }), 100);
    return () => clearInterval(id);
  }, [open, stateRef]);

  if (!open) return null;

  const f = (v: number, d = 2) => v.toFixed(d);
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#4ade80" }}>{label}:</span>
      <span style={{ color: "#d1fae5" }}>{value}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: "#22c55e", fontWeight: 700, marginBottom: 2, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{
      position: "fixed", top: 12, left: 12, zIndex: 200,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)",
      border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6,
      padding: 12, maxWidth: 280, minWidth: 240,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 11, lineHeight: "1.55", color: "#4ade80",
      pointerEvents: "auto", overflowY: "auto", maxHeight: "90vh",
    }}>
      <Section title="BEAT">
        <Row label="intensity" value={f(snap.beatIntensity)} />
        <Row label="physGlow" value={f(snap.physGlow)} />
      </Section>
      <Section title="PHYSICS ENGINE">
        <Row label="active" value={snap.physicsActive ? "true" : "false"} />
        <Row label="words" value={String(snap.wordCount)} />
        <Row label="heat" value={f(snap.heat)} />
        <Row label="avgVelocityY" value={f(snap.velocity)} />
        <Row label="avgRotation" value={f(snap.rotation, 3)} />
        <Row label="lastBeatForce" value={f(snap.lastBeatForce)} />
      </Section>
      <Section title="ANIMATION">
        <Row label="effect" value={snap.effectKey} />
        <Row label="entryProgress" value={f(snap.entryProgress)} />
        <Row label="exitProgress" value={f(snap.exitProgress)} />
        <Row label="activeMod" value={snap.activeMod ?? "none"} />
        <Row label="fontScale" value={f(snap.fontScale)} />
        <Row label="scale" value={f(snap.scale)} />
        <Row label="lineColor" value={snap.lineColor} />
        <Row label="isHookLine" value={snap.isHookLine ? "true" : "false"} />
        <Row label="repIndex" value={`${snap.repIndex}/${snap.repTotal}`} />
      </Section>
      <Section title="PARTICLES">
        <Row label="system" value={snap.particleSystem} />
        <Row label="density" value={f(snap.particleDensity)} />
        <Row label="speed" value={f(snap.particleSpeed)} />
        <Row label="count" value={String(snap.particleCount)} />
        <Row label="songSection" value={snap.songSection} />
      </Section>
      <Section title="POSITION">
        <Row label="xOffset" value={`${f(snap.xOffset, 1)}px`} />
        <Row label="yBase" value={f(snap.yBase)} />
        <Row label="xNudge" value={`${f(snap.xNudge, 1)}px`} />
        <Row label="shake" value={f(snap.shake)} />
      </Section>
      <Section title="BACKGROUND">
        <Row label="system" value={snap.backgroundSystem} />
        <Row label="imageLoaded" value={snap.imageLoaded ? "true" : "false"} />
        <Row label="zoom" value={f(snap.zoom)} />
        <Row label="vignetteIntensity" value={f(snap.vignetteIntensity)} />
        <Row label="songProgress" value={f(snap.songProgress)} />
      </Section>
      <Section title="DIRECTION">
        <Row label="thesis" value={snap.dirThesis.slice(0, 40) + (snap.dirThesis.length > 40 ? "…" : "")} />
        <Row label="chapter" value={`${snap.dirChapter} (${f(snap.dirChapterProgress)})`} />
        <Row label="chapterIntensity" value={f(snap.dirIntensity)} />
        <Row label="bgDirective" value={snap.dirBgDirective.slice(0, 30) + (snap.dirBgDirective.length > 30 ? "…" : "")} />
        <Row label="lightBehavior" value={snap.dirLightBehavior.slice(0, 30) + (snap.dirLightBehavior.length > 30 ? "…" : "")} />
      </Section>
      <Section title="SYMBOL">
        <Row label="primary" value={snap.symbolPrimary} />
        <Row label="secondary" value={snap.symbolSecondary} />
        <Row label="state" value={snap.symbolState.slice(0, 30) + (snap.symbolState.length > 30 ? "…" : "")} />
      </Section>
      <Section title="CAMERA">
        <Row label="distance" value={snap.cameraDistance} />
        <Row label="zoom" value={f(snap.zoom)} />
        <Row label="movement" value={snap.cameraMovement} />
      </Section>
      <Section title="TENSION">
        <Row label="stage" value={snap.tensionStage} />
        <Row label="motion" value={f(snap.tensionMotion)} />
        <Row label="particles" value={f(snap.tensionParticles)} />
        <Row label="typo" value={f(snap.tensionTypo)} />
      </Section>
      <Section title="WORD DIRECTIVE">
        <Row label="word" value={snap.wordDirectiveWord || "—"} />
        <Row label="kinetic" value={snap.wordDirectiveKinetic || "—"} />
        <Row label="elemental" value={snap.wordDirectiveElemental || "—"} />
        <Row label="emphasis" value={f(snap.wordDirectiveEmphasis)} />
        <Row label="evolution" value={snap.wordDirectiveEvolution || "—"} />
      </Section>
      <Section title="LINE DIRECTION">
        <Row label="heroWord" value={snap.lineHeroWord || "—"} />
        <Row label="entry" value={snap.lineEntry} />
        <Row label="exit" value={snap.lineExit} />
        <Row label="intent" value={snap.lineIntent || "—"} />
      </Section>
      <Section title="SHOT">
        <Row label="type" value={snap.shotType} />
        <Row label="description" value={snap.shotDescription.slice(0, 30) + (snap.shotDescription.length > 30 ? "…" : "")} />
      </Section>
      <Section title="EVOLUTION">
        <Row label="word" value={`${snap.evolutionWord} count:${snap.evolutionCount}`} />
        <Row label="scale" value={f(snap.evolutionScale)} />
        <Row label="glow" value={String(Math.round(snap.evolutionGlow))} />
        <Row label="bubbles" value={String(Math.round(snap.evolutionBubbles))} />
        <Row label="sink" value={`${Math.round(snap.evolutionSinkPx)}px`} />
      </Section>
      <Section title="PERFORMANCE">
        <Row label="fps" value={String(Math.round(snap.fps))} />
        <Row label="drawCalls" value={String(Math.round(snap.drawCalls))} />
        <Row label="particleCount" value={String(snap.particleCount)} />
        <Row label="cacheHits" value={`${Math.round(snap.cacheHits * 100)}%`} />
      </Section>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(74,222,128,0.4)", textAlign: "center" as const }}>
        {f(snap.time, 2)}s · press D to close
      </div>
    </div>
  );
}




const distanceToZoom: Record<string, number> = {
  ExtremeWide: 0.7,
  Wide: 0.85,
  MediumWide: 0.9,
  Medium: 1.0,
  MediumClose: 1.1,
  Close: 1.2,
  ExtremeClose: 1.5,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexToRgbString(hex: string): string {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  return `${r},${g},${b}`;
}


function getSongSection(progress: number): string {
  if (progress < 0.08) return "intro";
  if (progress < 0.33) return "verse";
  if (progress < 0.6) return "chorus";
  if (progress < 0.75) return "bridge";
  return "outro";
}

interface LyricDanceData {
  id: string;
  user_id: string;
  artist_slug: string;
  song_slug: string;
  artist_name: string;
  song_name: string;
  audio_url: string;
  lyrics: LyricLine[];
  physics_spec: PhysicsSpec;
  beat_grid: BeatGrid;
  palette: string[];
  system_type: string;
  artist_dna: ArtistDNA | null;
  seed: string;
  scene_manifest: any | null;
  song_dna: {
    cinematic_direction?: CinematicDirection | null;
  } | null;
  cinematic_direction: CinematicDirection | null;
}

interface ProfileInfo {
  display_name: string | null;
  avatar_url: string | null;
}

interface DanceComment {
  id: string;
  text: string;
  submitted_at: string;
}

interface BeatGrid {
  bpm: number;
  beats: number[];
  confidence: number;
}

interface LineBeatMap {
  lineIndex: number;
  beats: number[];
  strongBeats: number[];
  beatCount: number;
  beatsPerSecond: number;
  firstBeat: number;
  lastBeat: number;
}

function buildLineBeatMap(lines: LyricLine[], beatGrid: BeatGrid): LineBeatMap[] {
  return lines.map((line, i) => {
    const lineBeats = beatGrid.beats.filter(beat => beat >= line.start && beat <= line.end);
    return {
      lineIndex: i,
      beats: lineBeats,
      strongBeats: lineBeats.filter((_, beatIdx) => beatIdx % 2 === 0),
      beatCount: lineBeats.length,
      beatsPerSecond: lineBeats.length / Math.max(0.001, line.end - line.start),
      firstBeat: lineBeats[0] ?? line.start,
      lastBeat: lineBeats[lineBeats.length - 1] ?? line.end,
    };
  });
}

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,physics_spec,beat_grid,palette,system_type,artist_dna,seed,scene_manifest,cinematic_direction";

/** Draggable progress bar overlay at bottom of canvas */
function ProgressBar({ audioRef, data, progressBarRef, onMouseDown, onTouchStart, palette }: {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  data: LyricDanceData;
  progressBarRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  palette: string[];
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const duration = songEnd - songStart;

    const update = () => {
      const p = duration > 0 ? (audio.currentTime - songStart) / duration : 0;
      setProgress(Math.max(0, Math.min(1, p)));
    };
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [audioRef, data]);

  return (
    <div
      ref={progressBarRef}
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e); }}
      onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e); }}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-10 h-3 cursor-pointer group"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-white/5" />
      <div
        className="absolute left-0 top-0 h-full transition-none"
        style={{
          width: `${progress * 100}%`,
          background: palette[1] || "#a855f7",
          opacity: 0.6,
        }}
      />
      {/* Thumb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: `calc(${progress * 100}% - 6px)` }}
      />
    </div>
  );
}

/**
 * USE_WORKER toggle — flip to true once renderFrame.ts is fully extracted.
 * When true, the render loop runs on an OffscreenCanvas in a Web Worker.
 * When false (current), the existing rAF loop runs on the main thread.
 */
const USE_WORKER = false;

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [fireCount, setFireCount] = useState(0);

  // Live debug ref — written by render loop, read by HUD
  const liveDebugRef = useRef<LiveDebugState>({
    time: 0, beatIntensity: 0, physGlow: 0,
    physicsActive: false, wordCount: 0, heat: 0, velocity: 0, rotation: 0, lastBeatForce: 0,
    effectKey: "—", entryProgress: 0, exitProgress: 0, activeMod: null,
    fontScale: 1, scale: 1, lineColor: "#ffffff", isHookLine: false, repIndex: 0, repTotal: 0,
    particleSystem: "none", particleDensity: 0, particleSpeed: 0, particleCount: 0, songSection: "intro",
    xOffset: 0, yBase: 0.5, xNudge: 0, shake: 0,
    backgroundSystem: "—", imageLoaded: false, zoom: 1, vignetteIntensity: 0, songProgress: 0,
    dirThesis: "—", dirChapter: "—", dirChapterProgress: 0, dirIntensity: 0, dirBgDirective: "—", dirLightBehavior: "—",
    symbolPrimary: "—", symbolSecondary: "—", symbolState: "—",
    cameraDistance: "Wide", cameraMovement: "—", tensionStage: "—", tensionMotion: 0, tensionParticles: 0, tensionTypo: 0,
    wordDirectiveWord: "", wordDirectiveKinetic: "—", wordDirectiveElemental: "—", wordDirectiveEmphasis: 0, wordDirectiveEvolution: "—",
    lineHeroWord: "", lineEntry: "fades", lineExit: "fades", lineIntent: "—", shotType: "FloatingInWorld", shotDescription: "—",
    evolutionWord: "—", evolutionCount: 0, evolutionScale: 1, evolutionGlow: 0, evolutionBubbles: 0, evolutionSinkPx: 0,
    fps: 60, drawCalls: 0, cacheHits: 0,
  });
  const particleEngineRef = useRef<ParticleEngine | null>(null);
  const interpreterRef = useRef<DirectionInterpreter | null>(null);
  const interpreterRefStable = useRef<DirectionInterpreter | null>(null);
  const chapterTransitionRef = useRef<{ previous: string | null; current: string | null; progress: number }>({
    previous: null,
    current: null,
    progress: 1,
  });
  const textStateRef = useRef<TextState>({
    xOffset: 0,
    yBase: 0,
    beatScale: 1,
    wordCounts: new Map(),
    seenAppearances: new Set(),
    wordHistory: new Map(),
    directiveCache: new Map(),
    evolutionCache: new Map(),
  });
  const climaxActiveRef = useRef(false);
  const silenceOffsetYRef = useRef(0);
  const silenceZoomRef = useRef(1);
  const vignetteIntensityRef = useRef(0.55);
  const lightIntensityRef = useRef(1);
  const cameraZoomRef = useRef(1);
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef({ zoom: 1, x: 0, y: 0 });
  const cameraChapterRef = useRef(-1);
  const beatIntensityRef = useRef(0);
  // Comment input (ShareableHook-style)
  const [inputText, setInputText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [comments, setComments] = useState<DanceComment[]>([]);

  // Progress bar dragging
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const engineRef = useRef<HookDanceEngine | null>(null);
  const physicsSpec = data?.physics_spec;

  // Canvas
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const loadedFontFamiliesRef = useRef<Set<string>>(new Set());
  const rngRef = useRef<() => number>(() => 0);
  const lineBeatMapRef = useRef<LineBeatMap[]>([]);
  const wordMeasureCache = useRef<Map<string, number>>(new Map());
  const particleStateRef = useRef<ParticleState>({ configCache: { bucket: -1, config: null }, slowFrameCount: 0, adaptiveMaxParticles: 0, frameCount: 0 });
  const chapterBoundaryRef = useRef<{ key: number; chapter: ReturnType<DirectionInterpreter["getCurrentChapter"]> | null }>({ key: -1, chapter: null });
  const tensionBoundaryRef = useRef<{ key: number; stage: TensionStage | null }>({ key: -1, stage: null });
  const bgStateRef = useRef<BackgroundState>({ lastChapterTitle: "", lastBeatIntensity: 0, lastProgress: 0, lastDrawTime: 0 });
  // Perf: constellation offscreen canvas
  const constellationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    wordMeasureCache.current.clear();
    textStateRef.current.evolutionCache.clear();
    textStateRef.current.directiveCache.clear();
    interpreterRef.current?.invalidateEvolutionCache();
    interpreterRefStable.current?.invalidateEvolutionCache();
  }, [data?.lyrics?.length]);


  useEffect(() => {
    const rawCinematicDirection =
      data?.cinematic_direction ??
      data?.song_dna?.cinematic_direction ??
      null;
    const cinematicDirection = rawCinematicDirection
      ? {
          ...rawCinematicDirection,
          tensionCurve: ensureFullTensionCurve(rawCinematicDirection.tensionCurve ?? []),
        }
      : null;
    const lines = data?.lyrics ?? [];
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const totalDuration = Math.max(0.001, songEnd - songStart);

    if (cinematicDirection) {
      // interpreter created in render loop useEffect
      interpreterRef.current = new DirectionInterpreter(
        cinematicDirection,
        totalDuration
      );
      if (cinematicDirection?.visualWorld?.particleSystem) {
        particleEngineRef.current?.setSystem(cinematicDirection.visualWorld.particleSystem);
      }
    } else {
      interpreterRef.current = null;
    }
    WordClassifier.setCinematicDirection(cinematicDirection);
  }, [data?.cinematic_direction, data?.song_dna?.cinematic_direction, data?.lyrics]);

  useEffect(() => {
    interpreterRefStable.current = interpreterRef.current;
  }, [data?.cinematic_direction, data?.song_dna?.cinematic_direction]);

  useEffect(() => {
    const cinematicDirection = data?.cinematic_direction ?? data?.song_dna?.cinematic_direction ?? null;
    const fontFamily = cinematicDirection?.visualWorld?.typographyProfile?.fontFamily ?? "Montserrat";
    const trimmedFontFamily = fontFamily.trim();
    if (!trimmedFontFamily || loadedFontFamiliesRef.current.has(trimmedFontFamily)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(trimmedFontFamily.replace(/ /g, "+"))}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
    loadedFontFamiliesRef.current.add(trimmedFontFamily);
  }, [data?.cinematic_direction, data?.song_dna?.cinematic_direction]);

  // Comments / constellation
  const constellationRef = useRef<ConstellationNode[]>([]);
  const riverOffsetsRef = useRef<number[]>([0, 0, 0, 0]);

  // Badge
  const [badgeVisible, setBadgeVisible] = useState(false);
  // Cover overlay
  const [showCover, setShowCover] = useState(true);

  useEffect(() => {
    if (!physicsSpec) {
      engineRef.current = null;
      return;
    }
    engineRef.current = new HookDanceEngine(physicsSpec);
  }, [physicsSpec]);

  useEffect(() => {
    const lines = data?.lyrics;
    const beatGrid = data?.beat_grid;
    if (!lines || !beatGrid) {
      lineBeatMapRef.current = [];
      return;
    }

    const worker = new BeatAnalyzerWorker();
    worker.postMessage({ lines, beats: beatGrid.beats ?? [] });
    worker.onmessage = (e: MessageEvent<{ lineBeatMap: LineBeatMap[] }>) => {
      lineBeatMapRef.current = e.data.lineBeatMap ?? [];
    };
    worker.onerror = () => {
      lineBeatMapRef.current = buildLineBeatMap(lines, beatGrid);
    };

    return () => worker.terminate();
  }, [data?.lyrics, data?.beat_grid]);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (error || !row) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const d = row as any as LyricDanceData;
        const deferredDirection = d.cinematic_direction ?? null;
        setData({ ...d, cinematic_direction: null });
        setLoading(false);

        Promise.resolve().then(() => {
          if (deferredDirection) {
            setData(prev => prev ? { ...prev, cinematic_direction: deferredDirection } : prev);
          }
        });

        // Generate cinematic direction on-the-fly if missing from DB
        if (!d.cinematic_direction && d.lyrics?.length > 0) {
          const linesForDir = (d.lyrics as any[])
            .filter((l: any) => l.tag !== 'adlib')
            .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
          supabase.functions.invoke("cinematic-direction", {
            body: { title: d.song_name, artist: d.artist_name, lines: linesForDir, beatGrid: d.beat_grid ? { bpm: (d.beat_grid as any).bpm } : undefined, lyricId: d.id },
          }).then(({ data: dirResult }) => {
            if (dirResult?.cinematicDirection) {
              setData(prev => prev ? { ...prev, cinematic_direction: dirResult.cinematicDirection } : prev);
            }
          }).catch(e => console.warn('[ShareableLyricDance] cinematic direction generation failed:', e));
        }

        // Non-critical: load profile + comments in parallel
        const [profileResult, commentsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", d.user_id)
            .maybeSingle(),
          supabase
            .from("lyric_dance_comments" as any)
            .select("id, text, submitted_at")
            .eq("dance_id", d.id)
            .order("submitted_at", { ascending: true })
            .limit(100),
        ]);

        if (profileResult.data) setProfile(profileResult.data as ProfileInfo);
        if (commentsResult.data) {
          const c = commentsResult.data as any as DanceComment[];
          setComments(c);
          setFireCount(c.length);
          buildConstellation(c);
        }
      });
  }, [artistSlug, songSlug]);

  // ── Build constellation from comments ─────────────────────────────────────

  const buildConstellation = useCallback((comments: DanceComment[]) => {
    if (comments.length === 0) return;
    const now = Date.now();
    const timestamps = comments.map(c => new Date(c.submitted_at).getTime());
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);
    const timeSpan = Math.max(newest - oldest, 1);

    const riverCount = Math.min(comments.length, RIVER_ROWS.length * 5);
    const riverStartIdx = Math.max(0, comments.length - riverCount);

    const nodes: ConstellationNode[] = comments.map((c, idx) => {
      const ts = new Date(c.submitted_at).getTime();
      const rng = mulberry32(hashSeed(c.id));
      const ageRatio = timeSpan > 0 ? (newest - ts) / timeSpan : 0;

      const angle = rng() * Math.PI * 2;
      const maxRadius = 0.2 + ageRatio * 0.3;
      const radius = rng() * maxRadius;
      const seedX = 0.5 + Math.cos(angle) * radius;
      const seedY = 0.5 + Math.sin(angle) * radius;

      const driftSpeed = 0.008 + rng() * 0.012;
      const driftAngle = rng() * Math.PI * 2;
      const baseOpacity = 0.06 - ageRatio * 0.03;

      const isRiver = idx >= riverStartIdx;
      const riverRowIndex = isRiver ? (idx - riverStartIdx) % RIVER_ROWS.length : 0;

      return {
        id: c.id, text: c.text,
        submittedAt: ts,
        seedX, seedY,
        x: seedX, y: seedY,
        driftSpeed, driftAngle,
        phase: (isRiver ? "river" : "constellation") as ConstellationNode["phase"],
        phaseStartTime: now,
        riverRowIndex,
        currentSize: isRiver ? 12 : 11,
        baseOpacity,
      };
    });
    constellationRef.current = nodes;
    riverOffsetsRef.current = [0, 0, 0, 0];
  }, []);

  // ── Canvas render loop ────────────────────────────────────────────────────

  useEffect(() => {
    if (!data || !bgCanvasRef.current || !textCanvasRef.current || !containerRef.current) return;
    
    let audio: HTMLAudioElement | null = null;
    let constellationInterval: ReturnType<typeof setInterval> | null = null;
    let resizeHandler: (() => void) | null = null;
    try {
    const bgCanvas = bgCanvasRef.current;
    const textCanvas = textCanvasRef.current;
    const container = containerRef.current;
    const bgCtx = bgCanvas.getContext("2d", { alpha: false })!;
    const textCtx = textCanvas.getContext("2d", { alpha: true })!;

    const spec = data.physics_spec;
    const lines = data.lyrics;

    // ── Derive SceneManifest via shared pipeline ─────────────────────────────
    const { manifest: resolvedManifest, textPalette, textColor, contrastRatio } = deriveCanvasManifest({
      physicsSpec: spec,
      storedManifest: data.scene_manifest as Record<string, unknown> | null,
      fallbackPalette: data.palette,
      systemType: data.system_type,
    });
    const effectivePalette = resolvedManifest.palette;
    const effectiveSystem = resolvedManifest.backgroundSystem || spec.system;

    const rawCinematicDirection = data.cinematic_direction ?? data.song_dna?.cinematic_direction ?? null;
    const cinematicDirection = rawCinematicDirection
      ? {
          ...rawCinematicDirection,
          tensionCurve: ensureFullTensionCurve(rawCinematicDirection.tensionCurve ?? []),
        }
      : null;

    // Create interpreter directly in render loop closure so it's always available
    const loopInterpreter = cinematicDirection
      ? new DirectionInterpreter(cinematicDirection, Math.max(0.001, (lines.length > 0 ? lines[lines.length - 1].end + 1 : 0) - (lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0)))
      : null;
    interpreterRef.current = loopInterpreter;
    interpreterRefStable.current = loopInterpreter;

    let particleEngine: ParticleEngine | null = null;
    if (resolvedManifest.particleConfig?.system !== "none") {
      particleEngine = new ParticleEngine(resolvedManifest);
    }
    particleEngineRef.current = particleEngine;
    if (cinematicDirection?.visualWorld?.particleSystem) {
      particleEngine?.setSystem(cinematicDirection.visualWorld.particleSystem);
    }

    // Load AnimationResolver with song DNA
    animationResolver.loadFromDna(
      { physics_spec: spec, physicsSpec: spec } as any,
      lines.map(l => ({ text: l.text, start: l.start })),
    );

    const particleSystemName = resolvedManifest.particleConfig?.system ?? "none";
    const baseParticleConfig = resolvedManifest.particleConfig;
    const timelineManifest = resolvedManifest;
    const baseAtmosphere = Math.max(0, Math.min(1, resolvedManifest.backgroundIntensity ?? 1));
    const warmLightSource = (resolvedManifest.lightSource || "").toLowerCase();
    const warmEmotion = (resolvedManifest.coreEmotion || "").toLowerCase();
    const isFireWorld = ["flickering left", "flickering right", "ember glow", "flame"].some(k => warmLightSource.includes(k))
      || warmEmotion.includes("fire")
      || warmEmotion.includes("burn")
      || warmEmotion.includes("ember");

    const rng = mulberry32(hashSeed(data.seed || data.id));
    rngRef.current = rng;

    const safeBeats = data.beat_grid?.beats ?? [];
    const sortedBeats = [...safeBeats].sort((a, b) => a - b);
    const beats: BeatTick[] = sortedBeats.map((time, index) => ({
      time,
      isDownbeat: index % 4 === 0,
      strength: index % 4 === 0 ? 1 : 0.5,
    }));
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const totalDuration = Math.max(0.001, songEnd - songStart);
    const hookStartTimes = lines
      .filter((line, index) => animationResolver.resolveLine(index, line.start, line.end, line.start, 0, effectivePalette).isHookLine)
      .map(line => line.start)
      .sort((a, b) => a - b);
    const lineBeatMap = lineBeatMapRef.current;
    const climaxLine = lines.find(line => line.text.toLowerCase().includes("drown"));
    const climaxBeat = sortedBeats.find(beat => (
      beat >= (climaxLine?.start ?? 0) && beat <= (climaxLine?.start ?? 0) + 1.0
    ));
    const chapters = cinematicDirection?.chapters ?? [];

    // Perf: init adaptive max particles
    particleStateRef.current.adaptiveMaxParticles = window.devicePixelRatio > 1 ? 150 : 80;
    particleStateRef.current.slowFrameCount = 0;

    // Perf: create offscreen canvas for constellation rendering
    const constellationCanvas = document.createElement("canvas");
    constellationCanvasRef.current = constellationCanvas;
    let constellationDirty = true;
    constellationInterval = setInterval(() => { constellationDirty = true; }, 100); // 10fps

    // Set up audio
    audio = new Audio(data.audio_url);
    audio.loop = true;
    audio.muted = true;
    audio.preload = "auto";
    audioRef.current = audio;


    audio.currentTime = songStart;
    audio.play().catch(() => {});

    engineRef.current = new HookDanceEngine(
      { ...spec, system: effectiveSystem },
      beats,
      songStart,
      songEnd,
      audio,
      { onFrame: () => {}, onEnd: () => {} },
      `${data.seed || data.id}-shareable-dance`,
    );

    let beatIndex = 0;
    let prevTime = songStart;
    let lastFrameTime = performance.now();
    let smoothBeatIntensity = 0; // exponential-decay beat intensity

    // Perf: word width cache with fast integer key (avoids template literal allocation)
    const wordWidthIntCache = new Map<number, number>();
    const hashWordKey = (word: string, fSize: number, fontFamily: string): number => {
      let h = fSize * 31;
      for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) | 0;
      for (let i = 0; i < fontFamily.length; i++) h = (h * 31 + fontFamily.charCodeAt(i)) | 0;
      return h;
    };

    resizeHandler = () => {
      const isMobile = window.innerWidth < 768;
      const pixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const rect = container.getBoundingClientRect();
      [bgCanvas, textCanvas].forEach((layerCanvas) => {
        layerCanvas.width = rect.width * pixelRatio;
        layerCanvas.height = rect.height * pixelRatio;
        layerCanvas.style.width = `${rect.width}px`;
        layerCanvas.style.height = `${rect.height}px`;
      });
      bgCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      textCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      wordMeasureCache.current.clear();
      wordWidthIntCache.clear();
      textStateRef.current.evolutionCache.clear();
      interpreterRef.current?.invalidateEvolutionCache();
      constellationDirty = true;
      if (particleEngine) {
        particleEngine.setBounds({ x: 0, y: 0, w: rect.width, h: rect.height });
        particleEngine.init(resolvedManifest.particleConfig, resolvedManifest);
      }
    };
    resizeHandler();
    window.addEventListener("resize", resizeHandler);

    const FRAME_BUDGET_MS = 14;

    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const frameStart = performance.now();
      const now = frameStart;
      const deltaMs = now - lastFrameTime;
      lastFrameTime = now;

      const cw = textCanvas.clientWidth || textCanvas.width / (window.devicePixelRatio || 1);
      const ch = textCanvas.clientHeight || textCanvas.height / (window.devicePixelRatio || 1);
      const ctx = textCtx;
      ctx.clearRect(0, 0, cw, ch);
      let drawCalls = 0;
      let cacheHits = 0;
      let cacheLookups = 0;
      const getWordWidth = (word: string, fSize: number, fontFamily: string): number => {
        const intKey = hashWordKey(word, fSize, fontFamily);
        cacheLookups += 1;
        const cached = wordWidthIntCache.get(intKey);
        if (cached !== undefined) {
          cacheHits += 1;
          return cached;
        }
        const previousFont = textCtx.font;
        textCtx.font = `${fSize}px ${fontFamily}`;
        const width = textCtx.measureText(word).width;
        textCtx.font = previousFont;
        wordWidthIntCache.set(intKey, width);
        return width;
      };
      const currentTime = audio.currentTime;
      const interpreterNow = loopInterpreter;


      if (textStateRef.current.yBase === 0) textStateRef.current.yBase = ch * 0.5;

      if (currentTime >= songEnd) {
        audio.currentTime = songStart;
        beatIndex = 0;
        prevTime = songStart;
        smoothBeatIntensity = 0;
        engineRef.current?.resetPhysics();
        return;
      }

      // Decay beat intensity smoothly between beats (~85% per frame at 60fps)
      const decayRate = Math.exp(-deltaMs / 120); // ~120ms half-life
      smoothBeatIntensity *= decayRate;

      let frameHadDownbeat = false;
      while (beatIndex < sortedBeats.length && sortedBeats[beatIndex] <= currentTime) {
        if (sortedBeats[beatIndex] > prevTime) {
          const isDownbeat = beatIndex % 4 === 0;
          const strength = isDownbeat ? 1 : 0.5;
          smoothBeatIntensity = Math.max(smoothBeatIntensity, strength); // spike on beat
          if (isDownbeat) frameHadDownbeat = true;
        }
        beatIndex++;
      }
      const currentBeatIntensity = smoothBeatIntensity;
      beatIntensityRef.current = currentBeatIntensity;

      engineRef.current?.setViewportBounds(cw, ch);
      engineRef.current?.update(currentBeatIntensity, deltaMs / 1000, frameHadDownbeat);
      const physicsState = engineRef.current?.getState();
      const state = physicsState ?? {
        scale: 1, blur: 0, glow: 0, shake: 0, isFractured: false,
        position: 0, velocity: 0, heat: 0, safeOffset: 0,
        offsetX: 0, offsetY: 0, rotation: 0, shatter: 0, wordOffsets: [],
      };
      const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;
      const activeLineBeatMap = activeLineIndex >= 0 ? lineBeatMap[activeLineIndex] : undefined;
      const isOnBeat = activeLineBeatMap?.beats.some(beat => Math.abs(currentTime - beat) < 0.05) ?? false;
      const isOnStrongBeat = activeLineBeatMap?.strongBeats.some(beat => Math.abs(currentTime - beat) < 0.05) ?? false;
      const beatDensity = activeLineBeatMap?.beatsPerSecond ?? 0;
      const songProgress = Math.max(0, Math.min(1, (currentTime - songStart) / totalDuration));
      const symbol = cinematicDirection?.symbolSystem;
      const camera = cinematicDirection?.cameraLanguage;
      const chapterBoundaryKey = Math.floor(songProgress * 100 / 5);
      if (chapterBoundaryRef.current.key !== chapterBoundaryKey) {
        chapterBoundaryRef.current = { key: chapterBoundaryKey, chapter: interpreterNow?.getCurrentChapter(songProgress) ?? null };
      }
      const chapterDirective = chapterBoundaryRef.current.chapter;

      const tensionBoundary = songProgress < 0.25 ? 0 : songProgress < 0.6 ? 1 : songProgress < 0.85 ? 2 : 3;
      if (tensionBoundaryRef.current.key !== tensionBoundary) {
        tensionBoundaryRef.current = { key: tensionBoundary, stage: getCurrentTensionStage(songProgress, cinematicDirection?.tensionCurve as TensionStage[] | undefined) ?? null };
      }
      const tensionStage = tensionBoundaryRef.current.stage;
      const shot = activeLineIndex >= 0
        ? getActiveShot(activeLineIndex, cinematicDirection?.shotProgression)
        : null;
      const chapterIndex = chapters.findIndex((ch) => songProgress >= ch.startRatio && songProgress <= ch.endRatio);
      const resolvedChapterIndex = chapterIndex >= 0 ? chapterIndex : 0;
      const chapterCamera = camera?.distanceByChapter
        ?.find((d: any) => d.chapterIndex === resolvedChapterIndex) ?? null;

      const movement = String(chapterCamera?.movement ?? "").toLowerCase();
      let targetOffsetX = 0;
      let targetOffsetY = 0;
      let targetZoom = distanceToZoom[chapterCamera?.distance ?? "Wide"] ?? 1.0;

      if (movement.includes("upwards")) {
        targetOffsetY = -0.2 * ch;
      } else if (movement.includes("downwards")) {
        targetOffsetY = 0.2 * ch;
      } else if (movement.includes("static")) {
        targetOffsetX = 0;
        targetOffsetY = 0;
      }

      if (movement.includes("pull back")) {
        targetZoom = 0.8;
      }

      if (cameraChapterRef.current !== resolvedChapterIndex) {
        cameraChapterRef.current = resolvedChapterIndex;
        cameraTargetRef.current = { zoom: targetZoom, x: targetOffsetX, y: targetOffsetY };
      }

      const cameraLerp = Math.min(1, deltaMs / 2000);
      cameraZoomRef.current += (cameraTargetRef.current.zoom - cameraZoomRef.current) * cameraLerp;
      cameraOffsetRef.current.x += (cameraTargetRef.current.x - cameraOffsetRef.current.x) * cameraLerp;
      cameraOffsetRef.current.y += (cameraTargetRef.current.y - cameraOffsetRef.current.y) * cameraLerp;
      const nextLine = lines.find(l => l.start > currentTime) ?? null;
      const isInSilence = interpreterNow?.isInSilence(activeLine ?? null, nextLine ? { start: nextLine.start } : null, currentTime)
        ?? (!activeLine || Boolean(nextLine && currentTime < nextLine.start - 0.5));
      if (isInSilence && cinematicDirection?.silenceDirective) {
        const silence = cinematicDirection.silenceDirective;
        // Target-based — no accumulation, smooth lerp toward fixed target
        const targetOffsetY = silence.cameraMovement.includes("downward") ? 12 : 0;
        const targetZoom = silence.cameraMovement.includes("push") ? 1.03 : 1;
        silenceOffsetYRef.current += (targetOffsetY - silenceOffsetYRef.current) * 0.02;
        silenceZoomRef.current += (targetZoom - silenceZoomRef.current) * 0.02;
        if (silence.tensionDirection === "building") vignetteIntensityRef.current = Math.min(0.8, vignetteIntensityRef.current + 0.001);
        else if (silence.tensionDirection === "releasing") vignetteIntensityRef.current = Math.max(0.3, vignetteIntensityRef.current - 0.001);
      } else {
        // Lerp back to neutral
        silenceOffsetYRef.current += (0 - silenceOffsetYRef.current) * 0.05;
        silenceZoomRef.current += (1 - silenceZoomRef.current) * 0.05;
        if (Math.abs(silenceOffsetYRef.current) < 0.1) silenceOffsetYRef.current = 0;
        if (Math.abs(silenceZoomRef.current - 1) < 0.001) silenceZoomRef.current = 1;
      }
      const baselineY = textStateRef.current.yBase === 0 ? ch * 0.5 : textStateRef.current.yBase;
      let activeWordPosition = {
        x: cw / 2 + textStateRef.current.xOffset + state.offsetX,
        y: baselineY + state.offsetY,
      };

      const lineAnim = activeLine
        ? animationResolver.resolveLine(activeLineIndex, activeLine.start, activeLine.end, currentTime, currentBeatIntensity, effectivePalette)
        : null;
      const isInHook = lineAnim?.isHookLine ?? false;
      const hookProgress = lineAnim
        ? Math.max(0, Math.min(1, (currentTime - activeLine!.start) / Math.max(0.001, activeLine!.end - activeLine!.start)))
        : 0;
      const hookOffsetX = 0; // No background oscillation — Ken Burns zoom only
      const hookOffsetY = 0;

      const nextHookStart = hookStartTimes.find(t => t > currentTime) ?? Number.POSITIVE_INFINITY;
      const timeToNextHook = nextHookStart - currentTime;
      const isPreHook = Number.isFinite(nextHookStart) && timeToNextHook > 0 && timeToNextHook < 2.0;

      if (chapterDirective?.title !== chapterTransitionRef.current.current) {
        chapterTransitionRef.current = {
          previous: chapterTransitionRef.current.current,
          current: chapterDirective?.title ?? null,
          progress: 0,
        };
      }
      chapterTransitionRef.current.progress = Math.min(1, chapterTransitionRef.current.progress + 1 / 120);

      const isClimax = interpreterNow?.isClimaxMoment(songProgress) ?? false;
      climaxActiveRef.current = isClimax;

      // Camera shake — only on very strong downbeats, subtle and deterministic
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      const zoom = cameraZoomRef.current * silenceZoomRef.current;
      ctx.scale(zoom, zoom);
      ctx.translate(-cw / 2, -ch / 2);
      ctx.translate(cameraOffsetRef.current.x, cameraOffsetRef.current.y + silenceOffsetYRef.current);
      if (currentBeatIntensity > 0.92) {
        const shakePhase = currentTime * 37.7;
        const shakeX = Math.sin(shakePhase) * (currentBeatIntensity - 0.92) * 15;
        const shakeY = Math.cos(shakePhase * 1.3) * (currentBeatIntensity - 0.92) * 5;
        ctx.translate(shakeX, shakeY);
      }

      // Background — draw on bgCanvas only when dirty; text canvas stays transparent
      const chapterForRender = chapterDirective ?? {
        startRatio: 0,
        endRatio: 1,
        title: "default",
        emotionalArc: "ambient",
        dominantColor: timelineManifest.palette[1] ?? "#0a0a0a",
        lightBehavior: timelineManifest.lightSource,
        particleDirective: timelineManifest.particleConfig.system,
        backgroundDirective: timelineManifest.backgroundSystem,
        emotionalIntensity: 0.5,
        typographyShift: null,
      };

      const budgetElapsed = () => performance.now() - frameStart;
      const canRenderBackground = budgetElapsed() < 8;
      const canRenderParticles = budgetElapsed() < 11;
      const canRenderEffects = budgetElapsed() < FRAME_BUDGET_MS - 1;

      drawCalls += renderBackground(
        bgCtx, bgCanvas, ctx, textCanvas,
        {
          chapter: chapterForRender,
          songProgress,
          beatIntensity: currentBeatIntensity,
          currentTime,
          now,
          lightIntensity: lightIntensityRef.current,
          activeWordPosition,
          symbol,
        },
        bgStateRef.current,
      );

      // Particle engine: update via extracted function, then draw far layer on textCtx
      const lineDir = lineAnim ? (interpreterNow?.getLineDirection(activeLineIndex) ?? null) : null;
      const { drawCalls: particleDrawCalls, lightIntensity } = renderParticles(
        ctx, ctx,
        {
          particleEngine,
          baseParticleConfig,
          timelineManifest,
          physicsSpec: spec,
          songProgress,
          beatIntensity: currentBeatIntensity,
          deltaMs,
          cw, ch,
          chapterDirective: chapterDirective ?? null,
          isClimax,
          climaxMaxParticleDensity: cinematicDirection?.climax?.maxParticleDensity ?? null,
          tensionParticleDensity: tensionStage?.particleDensity ?? null,
          tensionLightBrightness: tensionStage?.lightBrightness ?? null,
          hasLineAnim: !!lineAnim,
          particleBehavior: lineDir?.particleBehavior ?? null,
          interpreter: interpreterNow ?? null,
          activeLineIndex,
        },
        particleStateRef.current,
      );
      lightIntensityRef.current = lightIntensity;
      drawCalls += particleDrawCalls;

      if (symbol) {
        renderSymbol(ctx, symbol, songProgress, cw, ch);
      }

      // PASS 1 — Far-layer particles (behind text, atmospheric)
      if (particleEngine) {
        particleEngine.draw(ctx, "far");
        drawCalls += 1;
      }

      // Pre-hook darkness build (skipped during hook itself).
      if (canRenderEffects && isPreHook && !isInHook) {
        const buildIntensity = (1 - (timeToNextHook / 2.0)) * 0.3 * baseAtmosphere;
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, buildIntensity)})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // Fire-world warm flicker bloom on strong beats.
      if (canRenderEffects && isFireWorld && currentBeatIntensity > 0.6) {
        const flickerAlpha = currentBeatIntensity * 0.06 * baseAtmosphere;
        ctx.fillStyle = `rgba(255,140,0,${flickerAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // Beat scale baseline decay — now handled inside renderText via textState.beatScale

      // ── Comment rendering (constellation + river + center) ──
      // Perf opt 2: render constellation/river to offscreen canvas at 10fps, blit in rAF
      const nodes = constellationRef.current;
      const commentNow = Date.now();

      if (constellationDirty && nodes.length > 0) {
        constellationDirty = false;
        const offCanvas = constellationCanvasRef.current!;
        if (offCanvas.width !== cw || offCanvas.height !== ch) {
          offCanvas.width = cw;
          offCanvas.height = ch;
        }
        const offCtx = offCanvas.getContext("2d")!;
        offCtx.clearRect(0, 0, cw, ch);
        offCtx.textBaseline = "middle";
        offCtx.textAlign = "center";

        // Pass 1: Constellation nodes
        for (const node of nodes) {
          if (node.phase !== "constellation") continue;
          node.x += Math.cos(node.driftAngle) * node.driftSpeed / cw;
          node.y += Math.sin(node.driftAngle) * node.driftSpeed / ch;
          if (node.x < -0.1) node.x = 1.1;
          if (node.x > 1.1) node.x = -0.1;
          if (node.y < -0.1) node.y = 1.1;
          if (node.y > 1.1) node.y = -0.1;

          offCtx.font = "300 10px system-ui, -apple-system, sans-serif";
          offCtx.globalAlpha = node.baseOpacity;
          offCtx.fillStyle = "#ffffff";
          const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
          offCtx.fillText(truncated, node.x * cw, node.y * ch);
        }

        // Pass 2: River rows
        const riverNodes = nodes.filter(n => n.phase === "river");
        const offsets = riverOffsetsRef.current;
        for (let ri = 0; ri < RIVER_ROWS.length; ri++) {
          const row = RIVER_ROWS[ri];
          offsets[ri] += row.speed * row.direction;
          const rowComments = riverNodes.filter(n => n.riverRowIndex === ri);
          if (rowComments.length === 0) continue;

          offCtx.font = "300 11px system-ui, -apple-system, sans-serif";
          offCtx.globalAlpha = row.opacity;
          offCtx.fillStyle = "#ffffff";

          const rowY = row.y * ch;
          const textWidths = rowComments.map(n => {
            const t = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
            return offCtx.measureText(t).width;
          });
          const totalWidth = textWidths.reduce((a, tw) => a + tw + 120, 0);
          const wrapWidth = Math.max(totalWidth, cw + 200);

          let xBase = offsets[ri];
          for (let ci = 0; ci < rowComments.length; ci++) {
            const truncated = rowComments[ci].text.length > 40 ? rowComments[ci].text.slice(0, 40) + "…" : rowComments[ci].text;
            let drawX = ((xBase % wrapWidth) + wrapWidth) % wrapWidth;
            if (drawX > cw + 100) drawX -= wrapWidth;
            offCtx.fillText(truncated, drawX, rowY);
            xBase += textWidths[ci] + 120;
          }
        }
      }

      // Blit offscreen constellation layer
      if (nodes.length > 0 && constellationCanvasRef.current) {
        ctx.drawImage(constellationCanvasRef.current, 0, 0);
      }

      // Pass 3: New submissions (center → transitioning → river) — always drawn live
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      for (const node of nodes) {
        if (node.phase === "center") {
          const elapsed = commentNow - node.phaseStartTime;
          ctx.font = "400 14px system-ui, -apple-system, sans-serif";
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
          ctx.fillText(truncated, cw / 2, ch / 2);
          ctx.textAlign = "start";
          if (elapsed >= 800) { node.phase = "transitioning"; node.phaseStartTime = commentNow; }
        } else if (node.phase === "transitioning") {
          const elapsed = commentNow - node.phaseStartTime;
          const t = Math.min(1, elapsed / 4000);
          const targetRow = RIVER_ROWS[node.riverRowIndex];
          const targetY = targetRow ? targetRow.y : node.seedY;
          const cx2 = 0.5, cy2 = 0.5;
          const curX = cx2 + (node.seedX - cx2) * t * 0.3;
          const curY = cy2 + (targetY - cy2) * t;
          const size = 14 - (14 - 11) * t;
          const targetOpacity = targetRow?.opacity || 0.09;
          const opacity = 0.45 - (0.45 - targetOpacity) * t;

          ctx.font = `300 ${Math.round(size)}px system-ui, -apple-system, sans-serif`;
          ctx.globalAlpha = opacity;
          ctx.fillStyle = "#ffffff";
          const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
          ctx.fillText(truncated, curX * cw, curY * ch);
          node.x = curX; node.y = curY; node.currentSize = size;
          if (elapsed >= 4000) { node.phase = "river"; node.phaseStartTime = commentNow; }
        }
      }
      ctx.globalAlpha = 1;

      // Active line — delegated to renderText engine
      const visibleLines = lines.filter(l => currentTime >= l.start && currentTime < l.end);
      const isMobile = window.innerWidth < 768;
      const textResult = renderText(ctx, {
        lines,
        activeLine: activeLine ?? null,
        activeLineIndex,
        visibleLines,
        currentTime,
        songProgress,
        beatIntensity: currentBeatIntensity,
        beatIndex,
        sortedBeats,
        cw, ch,
        effectivePalette,
        effectiveSystem,
        resolvedManifest,
        textPalette,
        spec,
        state,
        interpreter: interpreterNow ?? null,
        shot,
        tensionStage,
        chapterDirective: chapterDirective ?? null,
        cinematicDirection: cinematicDirection ?? null,
        isClimax,
        particleEngine,
        rng,
        getWordWidth,
        isMobile,
        hardwareConcurrency: navigator.hardwareConcurrency ?? 4,
        devicePixelRatio: window.devicePixelRatio ?? 1,
      }, textStateRef.current);
      activeWordPosition = textResult.activeWordPosition;
      drawCalls += textResult.drawCalls;
      const frameEffectKey = textResult.effectKey;
      const frameFontSize = textResult.fontSize;
      const frameActiveMod = textResult.activeMod;
      const frameIsHook = textResult.isHook;
      const frameBeatMult = textResult.beatMult;
      const frameEntry = textResult.entry;
      const frameExit = textResult.exit;
      const frameFontScale = textResult.fontScale;
      const frameScale = textResult.scale;
      const frameLineColor = textResult.lineColor;
      const frameRepIndex = textResult.repIndex;
      const frameRepTotal = textResult.repTotal;
      const frameXNudge = textResult.xNudge;
      const frameSectionZone = textResult.sectionZone;

      if (chapterTransitionRef.current.progress < 1 && chapterDirective) {
        const chapterTransitionProgress = chapterTransitionRef.current.progress;
        const transitionRgb = hexToRgbString(chapterDirective.dominantColor);
        ctx.fillStyle = `rgba(${transitionRgb}, ${(1 - chapterTransitionProgress) * 0.3})`;
        ctx.fillRect(0, 0, cw, ch);
      }
      // Single composite overlay pass
      const overlayR = isClimax ? 255 : 0;
      const overlayG = isClimax ? 255 : 0;
      const overlayB = isClimax ? 255 : 0;
      const chapterOverlay = (chapterForRender.emotionalIntensity ?? 0.5) * 0.2;
      const vignetteOverlay = (vignetteIntensityRef.current + currentBeatIntensity * 0.15) * baseAtmosphere * 0.35;
      const climaxOverlay = isClimax ? currentBeatIntensity * 0.15 : 0;
      const overlayA = Math.max(0, Math.min(0.9, chapterOverlay + vignetteOverlay + climaxOverlay));
      ctx.fillStyle = `rgba(${overlayR},${overlayG},${overlayB},${overlayA})`;
      ctx.fillRect(0, 0, cw, ch);

      if (songProgress > 0.95 && cinematicDirection) {
        const ending = cinematicDirection.ending;
        const endProgress = (songProgress - 0.95) / 0.05;
        switch (ending.style) {
          case "dissolve":
            ctx.fillStyle = `rgba(${hexToRgbString(chapterDirective?.dominantColor ?? timelineManifest.palette[1])}, ${endProgress * 0.8})`;
            ctx.fillRect(0, 0, cw, ch);
            break;
          case "fade":
            ctx.fillStyle = `rgba(0,0,0,${endProgress})`;
            ctx.fillRect(0, 0, cw, ch);
            break;
          case "linger":
            particleEngine?.setSpeedMultiplier(1 - endProgress * 0.8);
            break;
          case "snap":
            if (endProgress > 0.8) {
              ctx.fillStyle = "#000000";
              ctx.fillRect(0, 0, cw, ch);
            }
            break;
          default:
            break;
        }
      } else {
        particleEngine?.setSpeedMultiplier(1);
      }

      if (particleEngine) {
        particleEngine.draw(ctx, "near");
        drawCalls += 1;
      }

      ctx.restore();

      // ── Update live debug ref (no React setState — zero GC pressure) ──
      const dbg = liveDebugRef.current;
      dbg.time = currentTime;
      // Beat
      dbg.beatIntensity = beatIntensityRef.current;
      dbg.physGlow = state.glow;
      // Physics Engine
      dbg.physicsActive = true;
      dbg.wordCount = activeLine ? activeLine.text.split(/\s+/).length : 0;
      dbg.heat = state.heat;
      dbg.velocity = state.velocity;
      dbg.rotation = state.rotation;
      dbg.lastBeatForce = beatIntensityRef.current;
      // Animation
      dbg.effectKey = frameEffectKey;
      dbg.entryProgress = frameEntry;
      dbg.exitProgress = frameExit;
      dbg.activeMod = frameActiveMod;
      dbg.fontScale = frameFontScale;
      dbg.scale = frameScale;
      dbg.lineColor = frameLineColor;
      dbg.isHookLine = frameIsHook;
      dbg.repIndex = frameRepIndex;
      dbg.repTotal = frameRepTotal;
      // Particles
      dbg.particleSystem = particleEngine?.getConfig().system ?? "none";
      dbg.particleDensity = particleEngine?.getConfig().density ?? 0;
      dbg.particleSpeed = particleEngine?.getConfig().speed ?? 0;
      dbg.particleCount = particleEngineRef.current?.getActiveCount() ?? 0;
      dbg.songSection = `${frameSectionZone || getSongSection(songProgress)} · ${beatDensity.toFixed(1)}bps`;
      // Position
      dbg.xOffset = textStateRef.current.xOffset;
      dbg.yBase = textStateRef.current.yBase / ch;
      dbg.xNudge = frameXNudge;
      dbg.shake = state.shake;
      // Background
      dbg.backgroundSystem = data?.system_type ?? "unknown";
      dbg.imageLoaded = false;
      dbg.zoom = 1;
      dbg.vignetteIntensity = (0.55 + currentBeatIntensity * 0.15) * baseAtmosphere;
      dbg.songProgress = songProgress;
      // Direction
      const chapter = chapterDirective;
      dbg.dirThesis = interpreterNow?.direction?.thesis ?? "—";
      dbg.dirChapter = chapter?.title ?? "—";
      dbg.dirChapterProgress = chapter ? Math.max(0, Math.min(1, (songProgress - chapter.startRatio) / Math.max(0.001, chapter.endRatio - chapter.startRatio))) : 0;
      dbg.dirIntensity = chapter?.emotionalIntensity ?? 0;
      dbg.dirBgDirective = chapter?.backgroundDirective ?? timelineManifest.backgroundSystem ?? "—";
      dbg.dirLightBehavior = chapter?.lightBehavior ?? timelineManifest.lightSource ?? "—";
      const symbolState = getSymbolStateForProgress(songProgress, symbol);
      dbg.symbolPrimary = symbol?.primary ?? '—';
      dbg.symbolSecondary = symbol?.secondary ?? '—';
      dbg.symbolState = symbolState ?? '—';
      dbg.cameraDistance = chapterCamera?.distance ?? camera?.openingDistance ?? 'Wide';
      dbg.cameraMovement = chapterCamera?.movement ?? camera?.movementType ?? '—';
      dbg.tensionStage = tensionStage ? `${tensionStage.stage} (${songProgress.toFixed(2)})` : '—';
      dbg.tensionMotion = tensionStage?.motionIntensity ?? 0;
      dbg.tensionParticles = tensionStage?.particleDensity ?? 0;
      dbg.tensionTypo = tensionStage?.typographyAggression ?? 0;
      // Word Directive (current hero word)
      const dbgLineDir = interpreterNow?.getLineDirection(activeLineIndex) ?? null;
      const dbgWords = activeLine ? activeLine.text.split(/\s+/) : [];
      const dbgHeroWord = dbgLineDir?.heroWord ?? dbgWords.find(w => WordClassifier.classifyWord(w) !== "FILLER") ?? dbgWords[0] ?? "";
      const dbgWordDir = interpreterNow?.getWordDirective(dbgHeroWord) ?? null;
      dbg.wordDirectiveWord = dbgHeroWord;
      dbg.wordDirectiveKinetic = dbgWordDir?.kineticClass ?? WordClassifier.classifyWord(dbgHeroWord);
      dbg.wordDirectiveElemental = dbgWordDir?.elementalClass ?? WordClassifier.getElementalClass(dbgHeroWord);
      dbg.wordDirectiveEmphasis = dbgWordDir?.emphasisLevel ?? 0;
      dbg.wordDirectiveEvolution = dbgWordDir?.evolutionRule ?? "—";
      // Line Direction
      dbg.lineHeroWord = dbgLineDir?.heroWord ?? dbgHeroWord;
      dbg.lineEntry = dbgLineDir?.entryStyle ?? resolvedManifest.lyricEntrance ?? "fades";
      dbg.lineExit = dbgLineDir?.exitStyle ?? "fades";
      dbg.lineIntent = dbgLineDir?.emotionalIntent ?? "—";
      dbg.shotType = shot?.shotType ?? 'FloatingInWorld';
      dbg.shotDescription = shot?.description ?? '—';
      const normalizedHeroWord = (dbgHeroWord || "").toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
      const trackedEvolution = dbgWordDir?.evolutionRule ? textStateRef.current.wordHistory.get(normalizedHeroWord) : null;
      const evolutionCount = trackedEvolution?.count ?? 0;
      dbg.evolutionWord = dbgHeroWord || "—";
      dbg.evolutionCount = evolutionCount;
      dbg.evolutionScale = 1 + evolutionCount * 0.06;
      dbg.evolutionGlow = evolutionCount * 4;
      dbg.evolutionBubbles = dbg.evolutionWord.toLowerCase() === "drown" ? Math.min(20, 3 + evolutionCount * 2) : 0;
      dbg.evolutionSinkPx = dbg.evolutionWord.toLowerCase() === "down" ? evolutionCount * 3 : 0;
      dbg.fps = deltaMs > 0 ? 1000 / deltaMs : 60;
      dbg.drawCalls = drawCalls;
      dbg.cacheHits = cacheLookups > 0 ? cacheHits / cacheLookups : 1;


      prevTime = currentTime;
    };

    animRef.current = requestAnimationFrame(render);

    } catch (err: any) {
      console.error('SETUP CRASH:', err);
      console.error('Stack:', err?.stack);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      if (constellationInterval) clearInterval(constellationInterval);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      engineRef.current?.stop();
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, [data]);

  // ── Mute toggle ───────────────────────────────────────────────────────────

  const handleMuteToggle = useCallback(() => {
    if (!audioRef.current) return;
    const newMuted = !muted;
    audioRef.current.muted = newMuted;
    if (!newMuted) audioRef.current.play().catch(() => {});
    setMuted(newMuted);
  }, [muted]);

  // ── Submit comment (ShareableHook-style) ──────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || !data || hasSubmitted) return;
    const text = inputText.trim().slice(0, 200);
    const sessionId = getSessionId();

    const { data: inserted } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({ dance_id: data.id, text, session_id: sessionId })
      .select("id, text, submitted_at")
      .single();

    if (inserted) {
      const newComment = inserted as any as DanceComment;
      setComments(prev => [...prev, newComment]);
      setFireCount(prev => prev + 1);
      setHasSubmitted(true);
      setInputText("");

      // Push to constellation as center phase node
      const rng = mulberry32(hashSeed(newComment.id));
      const angle = rng() * Math.PI * 2;
      const radius = rng() * 0.2;
      const seedX = 0.5 + Math.cos(angle) * radius;
      const seedY = 0.5 + Math.sin(angle) * radius;
      constellationRef.current.push({
        id: newComment.id, text: newComment.text,
        submittedAt: Date.now(),
        seedX, seedY,
        x: 0.5, y: 0.5,
        driftSpeed: 0.008 + rng() * 0.012,
        driftAngle: rng() * Math.PI * 2,
        phase: "center",
        phaseStartTime: Date.now(),
        riverRowIndex: Math.floor(rng() * RIVER_ROWS.length),
        currentSize: 16,
        baseOpacity: 0.06,
      });
    }
  }, [inputText, data, hasSubmitted]);

  // ── Progress bar seek ──────────────────────────────────────────────────────

  // Track whether audio was playing before drag started
  const wasPlayingBeforeDrag = useRef(false);

  const seekToPosition = useCallback((clientX: number) => {
    if (!progressBarRef.current || !audioRef.current || !data) return;
    const audio = audioRef.current;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    audio.currentTime = songStart + ratio * (songEnd - songStart);
  }, [data]);

  const handleProgressDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const audio = audioRef.current;
    if (!audio) return;
    // Remember play state and pause during drag to avoid hammering play()
    wasPlayingBeforeDrag.current = !audio.paused;
    audio.pause();
    setIsDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    seekToPosition(clientX);
  }, [seekToPosition]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      seekToPosition(clientX);
    };
    const onUp = () => {
      setIsDragging(false);
      // Resume playback once, cleanly, after the user lifts their finger/mouse
      const audio = audioRef.current;
      if (audio && wasPlayingBeforeDrag.current) {
        audio.play().catch(() => {});
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isDragging, seekToPosition]);

  // Badge timer
  useEffect(() => { setTimeout(() => setBadgeVisible(true), 1000); }, []);

  // Hide Lovable widget
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-50">
        <div className="text-center space-y-3">
          <div className="h-4 w-48 rounded bg-white/[0.06] animate-pulse mx-auto" />
          <div className="h-3 w-32 rounded bg-white/[0.04] animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/40 text-lg font-mono">Lyric Dance not found.</p>
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">
          tools.fm
        </button>
      </div>
    );
  }

  const placeholder = "DROP YOUR TAKE LIVE";
  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      {/* Fit by toolsFM badge */}
      <AnimatePresence>
        {badgeVisible && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate(`/?from=lyric-dance&song=${encodeURIComponent(data.song_name)}`)}
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/80 transition-all group"
          >
            <span className="text-[10px] font-mono text-white/50 group-hover:text-white/80 tracking-wider transition-colors">
              Fit by toolsFM
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[60vh] md:min-h-[70vh] cursor-pointer"
        onClick={() => { if (!showCover) handleMuteToggle(); }}
      >
        <canvas id="bg-canvas" ref={bgCanvasRef} className="absolute inset-0 w-full h-full" />
        <canvas id="text-canvas" ref={textCanvasRef} className="absolute inset-0 w-full h-full" />

        {/* Dark cover overlay */}
        <AnimatePresence>
          {showCover && data && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
            >
              {/* Profile pic */}
              <div className="mb-5">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || data.artist_name}
                    className="w-20 h-20 rounded-full object-cover border border-white/10"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-2xl font-mono text-white/40">
                      {(data.artist_name || "?")[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Song title — editorial headline */}
              <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[80%] mb-1">
                {data.song_name}
              </h2>

              {/* Artist name */}
              <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/40 mb-8">
                {profile?.display_name || data.artist_name}
              </p>

              {/* Listen Now */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCover(false);
                  if (audioRef.current) {
                    audioRef.current.muted = false;
                    audioRef.current.play().catch(() => {});
                    setMuted(false);
                  }
                }}
                className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
              >
                Listen Now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top-left identity label (visible after cover dismissed) */}
        {!showCover && data && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || data.artist_name}
                className="w-8 h-8 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-xs font-mono text-white/40">
                  {(data.artist_name || "?")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white/70 leading-tight truncate max-w-[180px]">
                {data.song_name}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 leading-tight">
                {profile?.display_name || data.artist_name}
              </span>
            </div>
          </div>
        )}

        {/* Draggable progress bar */}
        {!showCover && data && (
          <ProgressBar
            audioRef={audioRef}
            data={data}
            progressBarRef={progressBarRef}
            onMouseDown={handleProgressDown}
            onTouchStart={handleProgressDown}
            palette={data.palette}
          />
        )}

      </div>

      {/* Below-canvas content */}
      <div className="w-full" style={{ background: "#0a0a0a" }}>
        <div className="max-w-[480px] mx-auto px-5 py-4 space-y-3">

          {/* Comment input */}
          <AnimatePresence mode="wait">
            {hasSubmitted ? (
              <motion.p
                key="notified"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                onAnimationComplete={() => {
                  setTimeout(() => setHasSubmitted(false), 2500);
                }}
                className="text-center text-sm text-white/30"
              >
                FMLY Notified
              </motion.p>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="relative"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder={placeholder}
                  maxLength={200}
                  className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 pr-20 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/20 pointer-events-none">
                  Press Enter
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Live Debug HUD — real-time engine values */}
      <LiveDebugHUD stateRef={liveDebugRef} />

      {/* Static Debug Panel — song DNA, beat grid, manifest */}
      <LyricDanceDebugPanel
        data={{
          songDna: {
            mood: (data.physics_spec as any)?.mood,
            description: (data.physics_spec as any)?.description,
            meaning: (data.physics_spec as any)?.meaning,
            hook: (data.physics_spec as any)?.hook,
            secondHook: (data.physics_spec as any)?.secondHook,
            hookLabel: (data.physics_spec as any)?.hookLabel,
            secondHookLabel: (data.physics_spec as any)?.secondHookLabel,
            hookJustification: (data.physics_spec as any)?.hookJustification,
            secondHookJustification: (data.physics_spec as any)?.secondHookJustification,
            physicsSpec: data.physics_spec as any,
            scene_manifest: data.scene_manifest,
          },
          beatGrid: data.beat_grid,
          lines: data.lyrics,
          title: data.song_name,
          artist: data.artist_name,
          overrides: {},
          fingerprint: data.artist_dna,
        }}
      />
    </div>
  );
}
