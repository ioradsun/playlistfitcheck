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
import { Bug, ChevronDown, ChevronRight } from "lucide-react";

import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect, resolveEffectKey, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import { ParticleEngine } from "@/engine/ParticleEngine";
import type { ParticleConfig, SceneManifest } from "@/engine/SceneManifest";
import { animationResolver } from "@/engine/AnimationResolver";
import { applyEntrance, applyExit, applyModEffect } from "@/engine/LyricAnimations";
import { deriveCanvasManifest, logManifestDiagnostics } from "@/engine/deriveCanvasManifest";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import { getSessionId } from "@/lib/sessionId";
import { LyricDanceDebugPanel } from "@/components/lyric/LyricDanceDebugPanel";

/** Live debug state updated every frame from the render loop */


function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function getParticleConfigForTime(
  baseConfig: ParticleConfig,
  manifest: SceneManifest,
  physicsSpec: PhysicsSpec | undefined,
  songProgress: number,
  beatIntensity: number,
): ParticleConfig {
  const progress = clamp01(songProgress);
  const beat = clamp01(beatIntensity);
  const heat = Number(physicsSpec?.params?.heat ?? 0);
  const isBurnWorld = manifest.backgroundSystem === "burn" || heat > 0.7;

  if (isBurnWorld) {
    if (progress < 0.15) {
      return {
        ...baseConfig,
        system: "smoke",
        density: 0.2,
        speed: 0.2,
        opacity: 0.4,
        color: "#4a3a2a",
      };
    }

    if (progress < 0.35) {
      const mix = clamp01((progress - 0.15) / 0.2);
      return {
        ...baseConfig,
        system: mix > 0.7 ? "embers" : "smoke",
        density: lerp(0.35, 0.5, mix),
        speed: lerp(0.35, 0.5, mix),
        opacity: lerp(0.45, 0.7, mix),
        color: mix > 0.5 ? baseConfig.color : "#4a3a2a",
      };
    }

    if (progress < 0.55) {
      return {
        ...baseConfig,
        system: "embers",
        density: Math.min(0.9, 0.8 + beat * 0.2),
        speed: Math.min(1, 0.7 + beat * 0.3),
        opacity: 0.9,
      };
    }

    if (progress < 0.7) {
      const mix = clamp01((progress - 0.55) / 0.15);
      return {
        ...baseConfig,
        system: mix > 0.6 ? "smoke" : "embers",
        density: lerp(0.4, 0.3, mix),
        speed: lerp(0.4, 0.3, mix),
        opacity: lerp(0.75, 0.55, mix),
        color: mix > 0.6 ? "#4a3a2a" : baseConfig.color,
      };
    }

    if (progress < 0.85) {
      return {
        ...baseConfig,
        system: "ash",
        density: 0.5,
        speed: 0.15,
        opacity: 0.6,
        color: "#7f7f7f",
      };
    }

    return {
      ...baseConfig,
      system: "embers",
      density: 0.2,
      speed: 0.2,
      opacity: 0.4,
    };
  }

  if (baseConfig.system === "rain") {
    const intensity = progress < 0.5 ? progress * 2 : 2 - progress * 2;
    return {
      ...baseConfig,
      density: 0.4 + intensity * 0.4,
      speed: 0.5 + intensity * 0.3,
    };
  }

  return baseConfig;
}
interface LiveDebugState {
  time: number;
  beatIntensity: number;
  beatIndex: number;
  totalBeats: number;
  bpm: number;
  physHeat: number;
  physDrift: number;
  physGlow: number;
  activeLine: string | null;
  activeLineIndex: number;
  effectKey: string;
  effectSystem: string;
  particleSystem: string;
  palette: string[];
  activeMod: string | null;
  isHookLine: boolean;
  beatMultiplier: number;
  entryProgress: number;
  exitProgress: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  contrastRatio: number;
  lyricEntrance: string;
  lyricExit: string;
}

/** Tiny live HUD overlay — polls a ref at 10 fps */
function LiveDebugHUD({ stateRef }: { stateRef: React.MutableRefObject<LiveDebugState> }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<LiveDebugState>(stateRef.current);
  const [sections, setSections] = useState<Record<string, boolean>>({
    beat: true, physics: true, line: true, engine: true, manifest: false,
  });

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setSnap({ ...stateRef.current }), 100);
    return () => clearInterval(id);
  }, [open, stateRef]);

  const toggle = (key: string) => setSections(s => ({ ...s, [key]: !s[key] }));

  const Row = ({ label, value, highlight }: { label: string; value: string | number | null; highlight?: boolean }) => (
    <div className="flex justify-between gap-3 text-[10px] font-mono leading-relaxed">
      <span className="text-white/40 shrink-0">{label}</span>
      <span className={highlight ? "text-amber-400" : "text-white/80"}>{value ?? "—"}</span>
    </div>
  );

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-t border-white/10 first:border-t-0">
      <button onClick={() => toggle(id)} className="w-full flex items-center gap-1 py-1.5 text-[9px] font-mono uppercase tracking-wider text-white/30 hover:text-white/60">
        {sections[id] ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {sections[id] && <div className="pb-2 space-y-0.5">{children}</div>}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 right-4 z-[100] flex items-center gap-1.5 rounded-full bg-black/80 backdrop-blur border border-white/10 px-3 py-1.5 text-[10px] font-mono text-white/50 hover:text-white/80 shadow-lg transition-colors"
      >
        <Bug size={12} />
        Live
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-14 right-4 z-[100] w-[280px] max-h-[70vh] overflow-y-auto rounded-lg bg-black/90 backdrop-blur-md border border-white/10 shadow-2xl p-3 space-y-0"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/60">Live Engine State</span>
              <span className="text-[9px] font-mono text-white/30">{snap.time.toFixed(2)}s</span>
            </div>

            <Section id="beat" title="Beat Grid">
              <Row label="beatIntensity" value={snap.beatIntensity.toFixed(2)} highlight={snap.beatIntensity > 0} />
              <Row label="beatIndex" value={`${snap.beatIndex} / ${snap.totalBeats}`} />
              <Row label="BPM" value={snap.bpm.toFixed(1)} />
            </Section>

            <Section id="physics" title="Physics State">
              <Row label="heat" value={snap.physHeat.toFixed(3)} highlight={snap.physHeat > 0.5} />
              <Row label="drift" value={snap.physDrift.toFixed(3)} />
              <Row label="glow" value={snap.physGlow.toFixed(3)} highlight={snap.physGlow > 0.3} />
            </Section>

            <Section id="line" title="Active Line">
              <Row label="index" value={snap.activeLineIndex >= 0 ? snap.activeLineIndex : "none"} />
              <Row label="text" value={snap.activeLine ? (snap.activeLine.length > 30 ? snap.activeLine.slice(0, 30) + "…" : snap.activeLine) : "—"} />
              <Row label="activeMod" value={snap.activeMod} highlight={snap.activeMod !== null} />
              <Row label="isHookLine" value={snap.isHookLine ? "YES" : "no"} highlight={snap.isHookLine} />
              <Row label="beatMultiplier" value={snap.beatMultiplier.toFixed(2)} />
              <Row label="entry" value={snap.entryProgress.toFixed(2)} />
              <Row label="exit" value={snap.exitProgress.toFixed(2)} />
            </Section>

            <Section id="engine" title="Engine Config">
              <Row label="effectKey" value={snap.effectKey} />
              <Row label="effectSystem" value={snap.effectSystem} />
              <Row label="particleSystem" value={snap.particleSystem} highlight={snap.particleSystem !== "none"} />
              <Row label="fontFamily" value={snap.fontFamily} />
              <Row label="fontSize" value={`${snap.fontSize}px`} />
              <Row label="entrance" value={snap.lyricEntrance} />
              <Row label="exit" value={snap.lyricExit} />
            </Section>

            <Section id="manifest" title="Palette & Contrast">
              <Row label="textColor" value={snap.textColor} highlight />
              <Row label="contrast" value={`${snap.contrastRatio.toFixed(1)}:1`} highlight={snap.contrastRatio < 4.5} />
              <div className="flex gap-1 mt-1">
                {snap.palette.map((c, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm border border-white/20" style={{ background: c }} />
                    <span className="text-[9px] font-mono text-white/50">{c}</span>
                  </div>
                ))}
              </div>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
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
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  palette: string[];
  system_type: string;
  artist_dna: ArtistDNA | null;
  seed: string;
  scene_manifest: any | null;
  background_url: string | null;
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

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,physics_spec,beat_grid,palette,system_type,artist_dna,seed,scene_manifest,background_url";

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

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LyricDanceData | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [fireCount, setFireCount] = useState(0);

  // Live debug ref — written by render loop, read by HUD
  const liveDebugRef = useRef<LiveDebugState>({
    time: 0, beatIntensity: 0, beatIndex: 0, totalBeats: 0, bpm: 0,
    physHeat: 0, physDrift: 0, physGlow: 0,
    activeLine: null, activeLineIndex: -1,
    effectKey: "—", effectSystem: "—", particleSystem: "none",
    palette: [], activeMod: null, isHookLine: false, beatMultiplier: 1,
    entryProgress: 0, exitProgress: 0, fontFamily: "—", fontSize: 0,
    textColor: "#ffffff", contrastRatio: 0, lyricEntrance: "fades", lyricExit: "fades",
  });
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
  

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const rngRef = useRef<() => number>(() => 0);
  const xOffsetRef = useRef(0);
  const yBaseRef = useRef(0);

  // Comments / constellation
  const constellationRef = useRef<ConstellationNode[]>([]);
  const riverOffsetsRef = useRef<number[]>([0, 0, 0, 0]);

  // Badge
  const [badgeVisible, setBadgeVisible] = useState(false);
  // Cover overlay
  const [showCover, setShowCover] = useState(true);

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
        setData(d);
        setLoading(false);

        // Preload AI background image if available
        if (d.background_url) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = d.background_url;
          img.onload = () => { bgImageRef.current = img; };
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
    if (!data || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext("2d", { alpha: false })!;

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

    // Initialise particle engine
    let particleEngine: ParticleEngine | null = null;
    if (resolvedManifest.particleConfig?.system !== "none") {
      particleEngine = new ParticleEngine(resolvedManifest);
    }

    // Load AnimationResolver with song DNA
    animationResolver.loadFromDna(
      { physics_spec: spec, physicsSpec: spec } as any,
      lines.map(l => ({ text: l.text, start: l.start })),
    );

    const particleSystemName = resolvedManifest.particleConfig?.system ?? "none";
    const baseParticleConfig = resolvedManifest.particleConfig;
    const timelineManifest = resolvedManifest;
    const typeFontFamily = resolvedManifest.typographyProfile?.fontFamily ?? "system-ui";
    const baseAtmosphere = Math.max(0, Math.min(1, resolvedManifest.backgroundIntensity ?? 1));
    const warmLightSource = (resolvedManifest.lightSource || "").toLowerCase();
    const warmEmotion = (resolvedManifest.coreEmotion || "").toLowerCase();
    const isFireWorld = ["flickering left", "flickering right", "ember glow", "flame"].some(k => warmLightSource.includes(k))
      || warmEmotion.includes("fire")
      || warmEmotion.includes("burn")
      || warmEmotion.includes("ember");

    const rng = mulberry32(hashSeed(data.seed || data.id));
    rngRef.current = rng;

    const sortedBeats = [...data.beat_grid.beats].sort((a, b) => a - b);
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

    // Set up audio
    const audio = new Audio(data.audio_url);
    audio.loop = true;
    audio.muted = true;
    audio.preload = "auto";
    audioRef.current = audio;

    const physicsEngine = new HookDanceEngine(
      { ...spec, system: effectiveSystem },
      beats,
      songStart,
      songEnd,
      audio,
      { onFrame: () => {}, onEnd: () => {} },
      `${data.seed || data.id}-shareable-dance`,
    );

    audio.currentTime = songStart;
    audio.play().catch(() => {});

    let beatIndex = 0;
    let prevTime = songStart;
    let lastFrameTime = performance.now();
    let smoothBeatIntensity = 0; // exponential-decay beat intensity

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particleEngine) {
        particleEngine.setBounds({ x: 0, y: 0, w: rect.width, h: rect.height });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const now = performance.now();
      const deltaMs = now - lastFrameTime;
      lastFrameTime = now;

      const cw = canvas.width / (window.devicePixelRatio || 1);
      const ch = canvas.height / (window.devicePixelRatio || 1);
      const currentTime = audio.currentTime;

      if (yBaseRef.current === 0) yBaseRef.current = ch * 0.5;

      if (currentTime >= songEnd) {
        audio.currentTime = songStart;
        beatIndex = 0;
        prevTime = songStart;
        smoothBeatIntensity = 0;
        physicsEngine.resetPhysics();
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

      physicsEngine.setViewportBounds(cw, ch);
      const state = physicsEngine.update(currentBeatIntensity, frameHadDownbeat);
      const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;
      const songProgress = Math.max(0, Math.min(1, (currentTime - songStart) / totalDuration));

      const lineAnim = activeLine
        ? animationResolver.resolveLine(activeLineIndex, activeLine.start, activeLine.end, currentTime, currentBeatIntensity, effectivePalette)
        : null;
      const isInHook = lineAnim?.isHookLine ?? false;
      const hookProgress = lineAnim
        ? Math.max(0, Math.min(1, (currentTime - activeLine!.start) / Math.max(0.001, activeLine!.end - activeLine!.start)))
        : 0;
      const hookOffsetX = isInHook ? Math.sin(hookProgress * Math.PI) * 0.03 * baseAtmosphere : 0;
      const hookOffsetY = isInHook ? Math.cos(hookProgress * Math.PI) * 0.02 * baseAtmosphere : 0;

      const nextHookStart = hookStartTimes.find(t => t > currentTime) ?? Number.POSITIVE_INFINITY;
      const timeToNextHook = nextHookStart - currentTime;
      const isPreHook = Number.isFinite(nextHookStart) && timeToNextHook > 0 && timeToNextHook < 2.0;

      // Camera shake on strong downbeats only (horizontal shake 3x vertical).
      ctx.save();
      if (currentBeatIntensity > 0.75) {
        const shakeX = (Math.random() - 0.5) * currentBeatIntensity * 6;
        const shakeY = (Math.random() - 0.5) * currentBeatIntensity * 2;
        ctx.translate(shakeX, shakeY);
      }

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, cw, ch);

      // AI-generated background image with slow cinematic push and hook reframe.
      const bgImg = bgImageRef.current;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        const zoom = 1.0 + songProgress * (0.08 * baseAtmosphere);
        const offsetX = (cw * (zoom - 1)) / 2;
        const offsetY = (ch * (zoom - 1)) / 2;
        const reframeX = hookOffsetX * cw;
        const reframeY = hookOffsetY * ch;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(
          bgImg,
          -offsetX + reframeX,
          -offsetY + reframeY,
          cw * zoom,
          ch * zoom,
        );
        ctx.globalAlpha = 1;
      }

      // Procedural background system — uses manifest's backgroundSystem
      drawSystemBackground(ctx, {
        system: effectiveSystem,
        physState: state,
        w: cw, h: ch,
        time: currentTime,
        beatCount: beatIndex,
        rng,
        palette: effectivePalette,
        hookStart: songStart,
        hookEnd: songEnd,
      });

      // Particle engine: update then draw parallax split layers.
      if (particleEngine) {
        const timedParticleConfig = getParticleConfigForTime(
          baseParticleConfig,
          timelineManifest,
          spec,
          songProgress,
          currentBeatIntensity,
        );
        particleEngine.setConfig(timedParticleConfig);
        particleEngine.update(deltaMs, currentBeatIntensity);
        particleEngine.draw(ctx, "far");
      }

      // Pre-hook darkness build (skipped during hook itself).
      if (isPreHook && !isInHook) {
        const buildIntensity = (1 - (timeToNextHook / 2.0)) * 0.3 * baseAtmosphere;
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, buildIntensity)})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // Fire-world warm flicker bloom on strong beats.
      if (isFireWorld && currentBeatIntensity > 0.6) {
        const flickerAlpha = currentBeatIntensity * 0.06 * baseAtmosphere;
        ctx.fillStyle = `rgba(255,140,0,${flickerAlpha})`;
        ctx.fillRect(0, 0, cw, ch);
      }

      // Near particles after overlays for cinematic depth.
      if (particleEngine) {
        particleEngine.draw(ctx, "near");
      }

      // ── Comment rendering (constellation + river + center) ──
      const nodes = constellationRef.current;
      const commentNow = Date.now();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      // Pass 1: Constellation nodes
      for (const node of nodes) {
        if (node.phase !== "constellation") continue;
        node.x += Math.cos(node.driftAngle) * node.driftSpeed / cw;
        node.y += Math.sin(node.driftAngle) * node.driftSpeed / ch;
        if (node.x < -0.1) node.x = 1.1;
        if (node.x > 1.1) node.x = -0.1;
        if (node.y < -0.1) node.y = 1.1;
        if (node.y > 1.1) node.y = -0.1;

        ctx.font = "300 10px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = node.baseOpacity;
        ctx.fillStyle = "#ffffff";
        const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
        ctx.fillText(truncated, node.x * cw, node.y * ch);
      }

      // Pass 2: River rows
      const riverNodes = nodes.filter(n => n.phase === "river");
      const offsets = riverOffsetsRef.current;
      for (let ri = 0; ri < RIVER_ROWS.length; ri++) {
        const row = RIVER_ROWS[ri];
        offsets[ri] += row.speed * row.direction;
        const rowComments = riverNodes.filter(n => n.riverRowIndex === ri);
        if (rowComments.length === 0) continue;

        ctx.font = "300 11px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = row.opacity;
        ctx.fillStyle = "#ffffff";

        const rowY = row.y * ch;
        const textWidths = rowComments.map(n => {
          const t = n.text.length > 40 ? n.text.slice(0, 40) + "…" : n.text;
          return ctx.measureText(t).width;
        });
        const totalWidth = textWidths.reduce((a, tw) => a + tw + 120, 0);
        const wrapWidth = Math.max(totalWidth, cw + 200);

        let xBase = offsets[ri];
        for (let ci = 0; ci < rowComments.length; ci++) {
          const truncated = rowComments[ci].text.length > 40 ? rowComments[ci].text.slice(0, 40) + "…" : rowComments[ci].text;
          let drawX = ((xBase % wrapWidth) + wrapWidth) % wrapWidth;
          if (drawX > cw + 100) drawX -= wrapWidth;
          ctx.fillText(truncated, drawX, rowY);
          xBase += textWidths[ci] + 120;
        }
      }

      // Pass 3: New submissions (center → transitioning → river)
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
          const cx = 0.5, cy = 0.5;
          const curX = cx + (node.seedX - cx) * t * 0.3;
          const curY = cy + (targetY - cy) * t;
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

      // Breathing vignette pulse
      const vignetteIntensity = (0.55 + currentBeatIntensity * 0.15) * baseAtmosphere;
      const vignetteCx = cw / 2;
      const vignetteCy = ch / 2;
      const vignette = ctx.createRadialGradient(
        vignetteCx,
        vignetteCy,
        ch * 0.3,
        vignetteCx,
        vignetteCy,
        ch * 0.85,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, `rgba(0,0,0,${Math.max(0, Math.min(1, vignetteIntensity))})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);

      // Active line
      let frameEffectKey = "—";
      let frameFontSize = 0;
      let frameActiveMod: string | null = null;
      let frameIsHook = false;
      let frameBeatMult = 1;
      let frameEntry = 0;
      let frameExit = 0;

      const visibleLines = lines.filter(l => currentTime >= l.start && currentTime < l.end);

      if (activeLine) {
        // Map mod-style keys to actual effect registry keys for variety
        let effectKey = "STATIC_RESOLVE";
        if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
          const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
          effectKey = resolveEffectKey(spec.effect_pool[poolIdx]);
        }
        frameEffectKey = effectKey;
        const drawFn = getEffect(effectKey);

        // Resolve animation mods via AnimationResolver
        const activeLineAnim = animationResolver.resolveLine(
          activeLineIndex, activeLine.start, activeLine.end, currentTime, currentBeatIntensity, effectivePalette,
        );
        frameActiveMod = activeLineAnim.activeMod;
        frameIsHook = activeLineAnim.isHookLine;
        frameBeatMult = activeLineAnim.beatMultiplier;
        frameEntry = activeLineAnim.entryProgress;
        frameExit = activeLineAnim.exitProgress;

        const age = (currentTime - activeLine.start) * 1000;
        const lineDur = activeLine.end - activeLine.start;
        const lineProgress = Math.min(1, (currentTime - activeLine.start) / lineDur);
        const stackedLayout = computeStackedLayout(ctx, activeLine.text, cw, ch, effectiveSystem);
        const { fs, effectiveLetterSpacing } = stackedLayout.isStacked
          ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
          : computeFitFontSize(ctx, activeLine.text, cw, effectiveSystem);
        const fontSize = fs * activeLineAnim.fontScale;
        frameFontSize = fontSize;

        const sectionProgress = songProgress;
        let targetXOffset = 0;
        let sectionZone: "verse" | "chorus" | "bridge" | "hook" | "outro" = "chorus";
        if (sectionProgress < 0.33) {
          targetXOffset = cw * -0.06;
          sectionZone = "verse";
        } else if (sectionProgress < 0.45) {
          const t = (sectionProgress - 0.33) / 0.12;
          targetXOffset = cw * (-0.06 + 0.06 * t);
          sectionZone = "verse";
        } else if (sectionProgress < 0.6) {
          targetXOffset = 0;
          sectionZone = "chorus";
        } else if (sectionProgress < 0.75) {
          targetXOffset = cw * 0.06;
          sectionZone = "bridge";
        } else {
          const t = (sectionProgress - 0.75) / 0.25;
          targetXOffset = cw * (0.06 * (1 - Math.max(0, Math.min(1, t))));
          sectionZone = "outro";
        }

        if (activeLineAnim.isHookLine) {
          targetXOffset = 0;
          sectionZone = "hook";
        }

        const strongMods = new Set(["PULSE_STRONG", "HEAT_SPIKE", "ERUPT", "FLAME_BURST", "EXPLODE"]);
        const softMods = new Set(["BLUR_OUT", "ECHO_FADE", "DISSOLVE", "FADE_OUT", "FADE_OUT_FAST"]);
        let targetYBase = ch * 0.5;
        if (activeLineAnim.isHookLine) {
          targetYBase = ch * 0.44;
        } else if (activeLineAnim.activeMod && strongMods.has(activeLineAnim.activeMod)) {
          targetYBase = ch * 0.46;
        } else if (activeLineAnim.activeMod && softMods.has(activeLineAnim.activeMod)) {
          targetYBase = ch * 0.54;
        }

        const lineSpacing = visibleLines.length <= 1
          ? ch * 0.12
          : visibleLines.length <= 2
            ? ch * 0.09
            : ch * 0.07;

        const visibleIndex = Math.max(0, visibleLines.findIndex(l => l.start === activeLine.start && l.end === activeLine.end && l.text === activeLine.text));
        const yLineOffset = (visibleIndex - (visibleLines.length - 1) / 2) * lineSpacing;
        targetYBase += yLineOffset;

        if (activeLineAnim.isHookLine) {
          targetYBase -= ch * 0.03;
        }

        xOffsetRef.current += (targetXOffset - xOffsetRef.current) * 0.05;
        yBaseRef.current += (targetYBase - yBaseRef.current) * 0.05;

        const nudge = currentBeatIntensity * 3;
        let xNudge = 0;
        let yNudge = 0;
        switch (resolvedManifest.lightSource) {
          case "flickering left":
          case "left":
            xNudge = -nudge;
            break;
          case "right":
          case "flickering right":
            xNudge = nudge;
            break;
          case "golden hour":
          case "warm overhead":
            yNudge = -nudge * 0.5;
            break;
          case "winter daylight":
          case "dead of night":
            yNudge = nudge * 0.3;
            break;
          default:
            xNudge = 0;
            yNudge = 0;
            break;
        }

        // Physics-driven shake: deterministic angle from beat index + time
        const physShakeAngle = (beatIndex * 2.3 + currentTime * 7.1) % (Math.PI * 2);
        const physShakeX = Math.cos(physShakeAngle) * state.shake;
        const physShakeY = Math.sin(physShakeAngle) * state.shake;
        const lineX = cw / 2 + xOffsetRef.current + xNudge + state.offsetX + physShakeX;
        const lineY = yBaseRef.current + yNudge + state.offsetY + physShakeY;

        ctx.save();

        // Compute entrance/exit alpha (these also apply ctx transforms for entrance/exit motion)
        const lyricEntrance = resolvedManifest?.lyricEntrance ?? "fades";
        const lyricExit = resolvedManifest?.lyricExit ?? "fades";
        const entryAlpha = applyEntrance(ctx, activeLineAnim.entryProgress, lyricEntrance, { spatialZone: sectionZone });
        const exitAlpha = activeLineAnim.exitProgress > 0
          ? applyExit(ctx, activeLineAnim.exitProgress, lyricExit)
          : 1.0;
        const compositeAlpha = Math.min(entryAlpha, exitAlpha);

        ctx.translate(lineX, lineY);
        ctx.rotate(state.rotation);
        ctx.scale(activeLineAnim.scale * state.scale, activeLineAnim.scale * state.scale);
        ctx.translate(-lineX, -lineY);

        if (activeLineAnim.activeMod) {
          applyModEffect(ctx, activeLineAnim.activeMod, currentTime, currentBeatIntensity);
        }
        const effectState: EffectState = {
          text: activeLine.text,
          physState: state,
          w: cw,
          h: ch,
          fs: fontSize,
          age,
          progress: lineProgress,
          rng,
          palette: [activeLineAnim.lineColor, textPalette[1], textPalette[2]],
          system: effectiveSystem,
          effectiveLetterSpacing,
          stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
          alphaMultiplier: compositeAlpha
        };
        drawFn(ctx, effectState);
        ctx.restore();
      }

      ctx.restore();

      // ── Update live debug ref (no React setState — zero GC pressure) ──
      const dbg = liveDebugRef.current;
      dbg.time = currentTime;
      dbg.beatIntensity = currentBeatIntensity;
      dbg.beatIndex = beatIndex;
      dbg.totalBeats = sortedBeats.length;
      dbg.bpm = data.beat_grid.bpm;
      dbg.physHeat = state.heat;
      dbg.physDrift = state.position;
      dbg.physGlow = state.glow;
      dbg.activeLine = activeLine?.text ?? null;
      dbg.activeLineIndex = activeLineIndex;
      dbg.effectKey = frameEffectKey;
      dbg.effectSystem = effectiveSystem;
      dbg.particleSystem = particleSystemName;
      dbg.palette = effectivePalette as string[];
      dbg.activeMod = frameActiveMod;
      dbg.isHookLine = frameIsHook;
      dbg.beatMultiplier = frameBeatMult;
      dbg.entryProgress = frameEntry;
      dbg.exitProgress = frameExit;
      dbg.fontFamily = typeFontFamily;
      dbg.fontSize = frameFontSize;
      dbg.textColor = textColor;
      dbg.contrastRatio = contrastRatio;
      dbg.lyricEntrance = resolvedManifest.lyricEntrance ?? "fades";
      dbg.lyricExit = resolvedManifest.lyricExit ?? "fades";

      // 1Hz diagnostic log
      logManifestDiagnostics("LyricDance", {
        palette: effectivePalette as string[],
        fontFamily: typeFontFamily,
        particleSystem: particleSystemName,
        beatIntensity: currentBeatIntensity,
        activeMod: frameActiveMod,
        entryProgress: frameEntry,
        exitProgress: frameExit,
        textColor,
        contrastRatio,
        effectKey: frameEffectKey,
      });

      prevTime = currentTime;
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      physicsEngine.stop();
      audio.pause();
      audio.src = "";
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
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

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
