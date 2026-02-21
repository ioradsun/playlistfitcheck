/**
 * ShareableHook — The artist's permanent home for a hook on the internet.
 * Route: /:artistSlug/:songSlug/:hookSlug
 *
 * Supports two modes:
 * 1. Single Hook — classic full-screen hook dance with comments
 * 2. Hook Battle — split-screen editorial poll where audiences vote
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize } from "@/engine/SystemStyles";
import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import { getSessionId } from "@/lib/sessionId";
import { useAuth } from "@/hooks/useAuth";

// ── Types ───────────────────────────────────────────────────────────────────

interface HookData {
  id: string;
  user_id: string;
  artist_slug: string;
  song_slug: string;
  hook_slug: string;
  artist_name: string;
  song_name: string;
  hook_phrase: string;
  artist_dna: ArtistDNA | null;
  physics_spec: PhysicsSpec;
  beat_grid: { bpm: number; beats: number[]; confidence: number };
  hook_start: number;
  hook_end: number;
  lyrics: LyricLine[];
  audio_url: string;
  fire_count: number;
  vote_count: number;
  system_type: string;
  palette: string[];
  signature_line: string | null;
  battle_id: string | null;
  battle_position: number | null;
  hook_label: string | null;
}

interface Comment {
  id: string;
  text: string;
  submitted_at: string;
}

interface ConstellationNode {
  id: string;
  text: string;
  submittedAt: number;
  // Permanent position seeded from PRNG (normalized 0-1)
  seedX: number;
  seedY: number;
  // Current position (normalized 0-1)
  x: number;
  y: number;
  // Permanent drift from PRNG
  driftSpeed: number;  // 0.015-0.04 px/frame
  driftAngle: number;  // radians
  // Lifecycle
  phase: "center" | "transitioning" | "river" | "constellation";
  phaseStartTime: number;
  riverRowIndex: number;
  currentSize: number;
  // Age-based opacity (6-12%)
  baseOpacity: number;
}

// Static river row configuration
const RIVER_ROWS = [
  { y: 0.25, speed: 0.4, opacity: 0.18, direction: -1 }, // left
  { y: 0.38, speed: 0.6, opacity: 0.14, direction: 1 },  // right
  { y: 0.62, speed: 0.8, opacity: 0.11, direction: -1 }, // left
  { y: 0.75, speed: 1.1, opacity: 0.08, direction: 1 },  // right
];

interface FireParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  emoji: string;
  scale: number;
}

// ── Fire streak animation ───────────────────────────────────────────────────

function FireStreakAnimation({ system, children }: { system: string; children: React.ReactNode }) {
  const [animating, setAnimating] = useState(false);
  return (
    <motion.div
      className="relative"
      animate={animating ? {
        scale: system === "pressure" ? [1, 0.85, 1.15, 1] :
               system === "orbit" ? [1, 1, 1] :
               system === "breath" ? [1, 0, 1] :
               [1, 1.1, 1],
        rotate: system === "orbit" ? [0, 360] : 0,
        opacity: system === "breath" ? [1, 0.3, 1] : 1,
      } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      onAnimationComplete={() => setAnimating(false)}
    >
      {children}
    </motion.div>
  );
}

// ── Canvas Hook Renderer (shared between single & battle) ───────────────────

function useHookCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  hookData: HookData | null,
  constellationRef: React.MutableRefObject<ConstellationNode[]>,
  riverOffsetsRef: React.MutableRefObject<number[]>,
  active: boolean = true,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<HookDanceEngine | null>(null);
  const [physicsState, setPhysicsState] = useState<PhysicsState | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [beatCount, setBeatCount] = useState(0);
  const prngRef = useRef<(() => number) | null>(null);

  // Setup audio + engine
  useEffect(() => {
    if (!hookData) return;
    const audio = new Audio();
    audio.muted = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.loop = true; // Ensure looping even when muted
    audioRef.current = audio;
    audio.src = hookData.audio_url;

    const spec = hookData.physics_spec as PhysicsSpec;
    const beats: BeatTick[] = hookData.beat_grid.beats.map((t: number, i: number) => ({
      time: t, isDownbeat: i % 4 === 0, strength: i % 4 === 0 ? 1 : 0.6,
    }));

    const lines = hookData.lyrics as LyricLine[];
    const lyricsStart = lines.length > 0 ? Math.min(hookData.hook_start, lines[0].start) : hookData.hook_start;
    const lyricsEnd = lines.length > 0 ? Math.min(hookData.hook_end, lines[lines.length - 1].end + 0.3) : hookData.hook_end;
    const effectiveStart = Math.max(hookData.hook_start, lyricsStart);
    const effectiveEnd = Math.max(effectiveStart + 1, lyricsEnd);

    const engine = new HookDanceEngine(
      { ...spec, system: hookData.system_type },
      beats, effectiveStart, effectiveEnd, audio,
      {
        onFrame: (state, time, bc) => { setPhysicsState(state); setCurrentTime(time); setBeatCount(bc); },
        onEnd: () => {},
      },
      `${hookData.song_name}-${hookData.hook_start.toFixed(3)}`,
    );

    engineRef.current = engine;
    prngRef.current = engine.prng;
    activeRef.current = active;

    // Always start engine so both battle sides render on load
    engine.start();

    return () => { engine.stop(); audio.pause(); };
  }, [hookData]);

  // Track active prop in a ref to avoid re-running setup effect
  const activeRef = useRef(active);

  // Track active prop — keep engine always running, just mute/unmute audio
  useEffect(() => {
    activeRef.current = active;
    const audio = audioRef.current;
    if (!audio) return;
    // In battle mode, mute inactive side's audio
    if (!active) {
      audio.muted = true;
    }
  }, [active]);

  // Restart from beginning and unmute
  const restart = useCallback(() => {
    const engine = engineRef.current;
    const audio = audioRef.current;
    if (!engine) return;
    // Unmute on user gesture
    if (audio) {
      audio.muted = false;
    }
    engine.stop();
    engine.start();
  }, []);
  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW; canvas.height = newH;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [hookData]);

  // Canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !physicsState || !hookData || !prngRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const palette = hookData.palette || ["#ffffff", "#a855f7", "#ec4899"];

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawSystemBackground(ctx, {
      system: hookData.system_type, physState: physicsState,
      w, h, time: currentTime, beatCount, rng: prngRef.current, palette,
      hookStart: hookData.hook_start, hookEnd: hookData.hook_end,
    });

    // ── Layer 1: Comment rendering (constellation → river → arrival) ──────
    const nodes = constellationRef.current;
    const now = Date.now();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Pass 1: Constellation nodes (lowest opacity, drawn first)
    for (const node of nodes) {
      if (node.phase !== "constellation") continue;
      // Linear drift
      node.x += Math.cos(node.driftAngle) * node.driftSpeed / w;
      node.y += Math.sin(node.driftAngle) * node.driftSpeed / h;
      // Wrap
      if (node.x < -0.1) node.x = 1.1;
      if (node.x > 1.1) node.x = -0.1;
      if (node.y < -0.1) node.y = 1.1;
      if (node.y > 1.1) node.y = -0.1;

      ctx.font = "13px system-ui, -apple-system, sans-serif";
      ctx.globalAlpha = node.baseOpacity;
      ctx.fillStyle = "#ffffff";
      const truncated = node.text.length > 30 ? node.text.slice(0, 30) + "…" : node.text;
      ctx.fillText(truncated, node.x * w, node.y * h);
    }

    // Pass 2: River rows (medium opacity)
    const riverNodes = nodes.filter(n => n.phase === "river");
    const offsets = riverOffsetsRef.current;
    for (let ri = 0; ri < RIVER_ROWS.length; ri++) {
      const row = RIVER_ROWS[ri];
      offsets[ri] += row.speed * row.direction;
      const rowComments = riverNodes.filter(n => n.riverRowIndex === ri);
      if (rowComments.length === 0) continue;

      ctx.font = "15px system-ui, -apple-system, sans-serif";
      ctx.globalAlpha = row.opacity;
      ctx.fillStyle = "#ffffff";

      const rowY = row.y * h;
      // Compute total spacing for wrapping
      const textWidths = rowComments.map(n => {
        const t = n.text.length > 30 ? n.text.slice(0, 30) + "…" : n.text;
        return ctx.measureText(t).width;
      });
      const totalWidth = textWidths.reduce((a, tw) => a + tw + 120, 0);
      const wrapWidth = Math.max(totalWidth, w + 200);

      let xBase = offsets[ri];
      for (let ci = 0; ci < rowComments.length; ci++) {
        const truncated = rowComments[ci].text.length > 30 ? rowComments[ci].text.slice(0, 30) + "…" : rowComments[ci].text;
        // Wrap position into visible range
        let drawX = ((xBase % wrapWidth) + wrapWidth) % wrapWidth;
        if (drawX > w + 100) drawX -= wrapWidth;
        ctx.fillText(truncated, drawX, rowY);
        xBase += textWidths[ci] + 120;
      }
    }

    // Pass 3: New submissions ("center" and "transitioning" — highest opacity, drawn last)
    for (const node of nodes) {
      if (node.phase === "center") {
        const elapsed = now - node.phaseStartTime;
        ctx.font = "15px system-ui, -apple-system, sans-serif";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        const truncated = node.text.length > 30 ? node.text.slice(0, 30) + "…" : node.text;
        ctx.fillText(truncated, w / 2, h / 2);
        // After 2000ms, transition
        if (elapsed >= 2000) {
          node.phase = "transitioning";
          node.phaseStartTime = now;
        }
      } else if (node.phase === "transitioning") {
        const elapsed = now - node.phaseStartTime;
        const t = Math.min(1, elapsed / 8000); // 0→1 over 8s
        // Interpolate position from center to river row position
        const targetRow = RIVER_ROWS[node.riverRowIndex];
        const targetY = targetRow ? targetRow.y : node.seedY;
        const cx = 0.5, cy = 0.5;
        const curX = cx + (node.seedX - cx) * t * 0.3; // drift partway
        const curY = cy + (targetY - cy) * t;
        // Interpolate size and opacity
        const size = 15 - (15 - 13) * t;
        const opacity = 1 - (1 - (targetRow?.opacity || 0.18)) * t;

        ctx.font = `${Math.round(size)}px system-ui, -apple-system, sans-serif`;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#ffffff";
        const truncated = node.text.length > 30 ? node.text.slice(0, 30) + "…" : node.text;
        ctx.fillText(truncated, curX * w, curY * h);

        node.x = curX;
        node.y = curY;
        node.currentSize = size;

        if (elapsed >= 8000) {
          node.phase = "river";
          node.phaseStartTime = now;
        }
      }
    }
    ctx.globalAlpha = 1;

    // Lyrics
    const lines = hookData.lyrics as LyricLine[];
    const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
    const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;
    const spec = hookData.physics_spec as PhysicsSpec;

    if (activeLine) {
      let effectKey = "STATIC_RESOLVE";
      if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
        const isLastHookLine = activeLine.end >= hookData.hook_end - 0.5;
        if (isLastHookLine) effectKey = "HOOK_FRACTURE";
        else {
          const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
          effectKey = spec.effect_pool[poolIdx];
        }
      }
      const drawFn = getEffect(effectKey);
      const age = (currentTime - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (currentTime - activeLine.start) / lineDur);
      const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, activeLine.text, w, hookData.system_type);
      drawFn(ctx, { text: activeLine.text, physState: physicsState, w, h, fs, age, progress, rng: prngRef.current, palette, system: hookData.system_type, effectiveLetterSpacing });
    }

    // Progress bar
    const hookProgress = (currentTime - hookData.hook_start) / (hookData.hook_end - hookData.hook_start);
    ctx.fillStyle = palette[1] || "#a855f7";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, h - 3, w * Math.max(0, Math.min(1, hookProgress)), 3);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [physicsState, currentTime, beatCount, hookData]);

  return { audioRef, currentTime, physicsState, restart };
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{
    artistSlug: string; songSlug: string; hookSlug: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [hookData, setHookData] = useState<HookData | null>(null);
  const [rivalHook, setRivalHook] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [fireCount, setFireCount] = useState(0);

  // Battle state
  const [votedHookId, setVotedHookId] = useState<string | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [fireParticles, setFireParticles] = useState<FireParticle[]>([]);
  const [activeHookSide, setActiveHookSide] = useState<"a" | "b">("a");
  const [tappedSides, setTappedSides] = useState<Set<"a" | "b">>(new Set());
  const particleIdRef = useRef(0);

  const isBattle = !!(hookData?.battle_id && rivalHook);

  // Canvas refs — primary
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Canvas refs — rival (battle mode)
  const canvasRefB = useRef<HTMLCanvasElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);

  // Audio
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const muteIconTimerRef = useRef<number | null>(null);

  // Comment input
  const [inputText, setInputText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Reset submission state when navigating to a different hook
  useEffect(() => {
    setHasSubmitted(false);
    setInputText("");
  }, [artistSlug, songSlug, hookSlug]);

  // Constellation for primary
  const constellationRef = useRef<ConstellationNode[]>([]);
  const riverOffsetsRef = useRef<number[]>([0, 0, 0, 0]);
  // Empty refs for rival (no comments on rival canvas)
  const constellationRefB = useRef<ConstellationNode[]>([]);
  const riverOffsetsRefB = useRef<number[]>([0, 0, 0, 0]);

  // Badge
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!artistSlug || !songSlug || !hookSlug) return;
    setLoading(true);

    supabase
      .from("shareable_hooks" as any)
      .select("*")
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .eq("hook_slug", hookSlug)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        const hook = data as any as HookData;
        setHookData(hook);
        setFireCount(hook.fire_count);
        setVoteCountA(hook.vote_count || 0);

        // Check for battle rival
        if (hook.battle_id) {
          const { data: rivalData } = await supabase
            .from("shareable_hooks" as any)
            .select("*")
            .eq("battle_id", hook.battle_id)
            .neq("id", hook.id)
            .maybeSingle();

          if (rivalData) {
            const rival = rivalData as any as HookData;
            setRivalHook(rival);
            setVoteCountB(rival.vote_count || 0);
          }

          // Check existing vote
          const sessionId = getSessionId();
          const { data: existingVote } = await supabase
            .from("hook_votes" as any)
            .select("hook_id")
            .eq("battle_id", hook.battle_id)
            .eq("session_id", sessionId)
            .maybeSingle();

          if (existingVote) {
            setVotedHookId((existingVote as any).hook_id);
          }
        }

        // Load comments
        const { data: commentsData } = await supabase
          .from("hook_comments" as any)
          .select("id, text, submitted_at")
          .eq("hook_id", hook.id)
          .order("submitted_at", { ascending: true })
          .limit(500);

        if (commentsData) setComments(commentsData as any as Comment[]);

        setLoading(false);
      });
  }, [artistSlug, songSlug, hookSlug]);

  // ── Build constellation from comments ─────────────────────────────────────

  useEffect(() => {
    if (!hookData || comments.length === 0) return;
    const now = Date.now();
    const timestamps = comments.map(c => new Date(c.submitted_at).getTime());
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);
    const timeSpan = Math.max(newest - oldest, 1);

    // Determine how many recent comments go to river vs constellation
    const riverCount = Math.min(comments.length, RIVER_ROWS.length * 5);
    const riverStartIdx = Math.max(0, comments.length - riverCount);

    const nodes: ConstellationNode[] = comments.map((c, idx) => {
      const ts = new Date(c.submitted_at).getTime();
      const rng = mulberry32(hashSeed(c.id));
      const ageRatio = timeSpan > 0 ? (newest - ts) / timeSpan : 0; // 0=newest, 1=oldest

      // Seed position: newest in center 40%, oldest in outer 60%
      const angle = rng() * Math.PI * 2;
      const maxRadius = 0.2 + ageRatio * 0.3; // 0.2 (center) to 0.5 (outer)
      const radius = rng() * maxRadius;
      const seedX = 0.5 + Math.cos(angle) * radius;
      const seedY = 0.5 + Math.sin(angle) * radius;

      // Permanent drift
      const driftSpeed = 0.015 + rng() * 0.025;
      const driftAngle = rng() * Math.PI * 2;

      // Age-based opacity: newest=12%, oldest=6%
      const baseOpacity = 0.12 - ageRatio * 0.06;

      // Assign to river if recent enough
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
        currentSize: isRiver ? 15 : 13,
        baseOpacity,
      };
    });
    constellationRef.current = nodes;
    riverOffsetsRef.current = [0, 0, 0, 0];
  }, [comments, hookData]);

  // ── Hook canvas engines ───────────────────────────────────────────────────

  const hookACanvas = useHookCanvas(canvasRef, containerRef, hookData, constellationRef, riverOffsetsRef, !isBattle || activeHookSide === "a");
  const hookBCanvas = useHookCanvas(canvasRefB, containerRefB, rivalHook, constellationRefB, riverOffsetsRefB, isBattle && activeHookSide === "b");

  // ── Handle canvas tap (unmute) ────────────────────────────────────────────

  const handleMuteToggle = useCallback(() => {
    const audioA = hookACanvas.audioRef.current;
    const audioB = hookBCanvas.audioRef.current;
    const newMuted = !muted;

    [audioA, audioB].forEach(a => {
      if (!a) return;
      a.muted = newMuted;
      if (!newMuted) a.play().catch(() => {});
    });
    setMuted(newMuted);
    setShowMuteIcon(true);
    if (muteIconTimerRef.current) clearTimeout(muteIconTimerRef.current);
    muteIconTimerRef.current = window.setTimeout(() => setShowMuteIcon(false), 2000);
  }, [muted, hookACanvas.audioRef, hookBCanvas.audioRef]);

  // ── Vote handler ──────────────────────────────────────────────────────────

  const handleVote = useCallback(async (hookId: string) => {
    if (!hookData?.battle_id) return;
    const sessionId = getSessionId();

    // Optimistic UI
    const isA = hookId === hookData.id;
    const wasSame = votedHookId === hookId;

    if (wasSame) return; // Already voted for this one

    // If switching vote, decrement old
    if (votedHookId) {
      if (votedHookId === hookData.id) setVoteCountA(v => Math.max(0, v - 1));
      else setVoteCountB(v => Math.max(0, v - 1));
    }

    // Increment new
    if (isA) setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setVotedHookId(hookId);

    // Spawn fire particles
    const newParticles: FireParticle[] = Array.from({ length: 10 }, () => ({
      id: particleIdRef.current++,
      x: isA ? 25 : 75, // percentage
      y: 50,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 4 - 2,
      alpha: 1,
      emoji: ["🔥", "💥", "⚡"][Math.floor(Math.random() * 3)],
      scale: 0.6 + Math.random() * 0.6,
    }));
    setFireParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => setFireParticles(prev => prev.filter(p => !newParticles.includes(p))), 1200);

    // Persist vote
    if (votedHookId) {
      // Update existing vote
      await supabase
        .from("hook_votes" as any)
        .update({ hook_id: hookId })
        .eq("battle_id", hookData.battle_id)
        .eq("session_id", sessionId);
    } else {
      // Insert new vote
      await supabase
        .from("hook_votes" as any)
        .insert({
          battle_id: hookData.battle_id,
          hook_id: hookId,
          user_id: user?.id || null,
          session_id: sessionId,
        });
    }
  }, [hookData, rivalHook, votedHookId, user]);

  // ── Badge timer ───────────────────────────────────────────────────────────
  useEffect(() => { setTimeout(() => setBadgeVisible(true), 1000); }, []);

  // Badge click handler
  const handleBadgeClick = useCallback(() => {
    if (!hookData) return;
    navigate(`/?from=hook&song=${encodeURIComponent(hookData.song_name)}`);
  }, [hookData, navigate]);

  // ── Submit comment ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || !hookData || hasSubmitted) return;
    const text = inputText.trim().slice(0, 200);
    const sessionId = getSessionId();

    const { data: inserted } = await supabase
      .from("hook_comments" as any)
      .insert({ hook_id: hookData.id, text, session_id: sessionId })
      .select("id, text, submitted_at")
      .single();

    if (inserted) {
      const newComment = inserted as any as Comment;
      setComments(prev => [...prev, newComment]);
      setFireCount(prev => prev + 1);
      setHasSubmitted(true);
      setInputText("");

      // New submission: start at center, full brightness
      const rng = mulberry32(hashSeed(newComment.id));
      const angle = rng() * Math.PI * 2;
      const radius = rng() * 0.2;
      const seedX = 0.5 + Math.cos(angle) * radius;
      const seedY = 0.5 + Math.sin(angle) * radius;
      const driftSpeed = 0.015 + rng() * 0.025;
      const driftAngle = rng() * Math.PI * 2;
      const riverRowIndex = Math.floor(rng() * RIVER_ROWS.length);

      constellationRef.current.push({
        id: newComment.id, text: newComment.text,
        submittedAt: Date.now(),
        seedX, seedY,
        x: 0.5, y: 0.5,
        driftSpeed, driftAngle,
        phase: "center",
        phaseStartTime: Date.now(),
        riverRowIndex,
        currentSize: 15,
        baseOpacity: 0.12,
      });
    }
  }, [inputText, hookData, hasSubmitted]);

  // ── Placeholder cycling ───────────────────────────────────────────────────

  useEffect(() => {
    if (comments.length === 0) return;
    const interval = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % Math.min(comments.length, 20));
    }, 4000);
    return () => clearInterval(interval);
  }, [comments.length]);

  // ── Copy share ────────────────────────────────────────────────────────────

  const shareUrl = `tools.fm/${artistSlug}/${songSlug}/${hookSlug}`;
  const shareCaption = hookData?.signature_line ? `${hookData.signature_line} — ${shareUrl}` : shareUrl;

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(shareCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shareCaption]);

  // ── Fingerprint helpers ───────────────────────────────────────────────────

  const fpFont = hookData?.artist_dna?.typography
    ? `${hookData.artist_dna.typography.font_weight} ${hookData.artist_dna.typography.font_style === "italic" ? "italic " : ""}1em "${hookData.artist_dna.typography.font_family}", sans-serif`
    : null;
  const fpPrimary = hookData?.artist_dna?.palette?.primary || "#ffffff";
  const fpTextTransform = hookData?.artist_dna?.typography?.text_transform || "none";
  const bgBase = hookData?.artist_dna?.palette?.background_base || "#0a0a0a";
  const bgAtmosphere = hookData?.artist_dna?.palette?.background_atmosphere || "rgba(255,255,255,0.2)";

  // Hide Lovable widget
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Vote percentages ─────────────────────────────────────────────────────

  const totalVotes = voteCountA + voteCountB;
  const pctA = totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const pctB = totalVotes > 0 ? 100 - pctA : 50;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-50">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !hookData) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/40 text-lg font-mono">Hook not found.</p>
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">tools.fm</button>
      </div>
    );
  }

  const recentForPlaceholder = comments.slice(-20);
  const placeholder = recentForPlaceholder.length > 0
    ? recentForPlaceholder[placeholderIndex % recentForPlaceholder.length]?.text || "what did this do to you?"
    : "what did this do to you?";

  const hookALabel = hookData.hook_label || "Hook A";
  const hookBLabel = rivalHook?.hook_label || "Hook B";
  const votedA = votedHookId === hookData.id;
  const votedB = votedHookId === rivalHook?.id;
  const hasVoted = !!votedHookId;

  // ── BATTLE MODE ───────────────────────────────────────────────────────────

  if (isBattle) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: bgBase }}>
        {/* Fit by toolsFM badge */}
        <AnimatePresence>
          {badgeVisible && (
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              onClick={handleBadgeClick}
              className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/80 transition-all group"
            >
              <span className="text-[10px] font-mono text-white/50 group-hover:text-white/80 tracking-wider transition-colors">
                Fit by toolsFM
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Fire particles overlay */}
        <div className="fixed inset-0 z-[55] pointer-events-none overflow-hidden">
          <AnimatePresence>
            {fireParticles.map(p => (
              <motion.span
                key={p.id}
                initial={{ opacity: 1, x: `${p.x}vw`, y: `${p.y}vh`, scale: p.scale }}
                animate={{
                  opacity: 0,
                  x: `${p.x + p.vx * 20}vw`,
                  y: `${p.y + p.vy * 15}vh`,
                  scale: p.scale * 0.3,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute text-2xl"
              >
                {p.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Editorial header */}
        <div className="px-5 pt-4 pb-2 text-center z-10">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
            {hookData.artist_name} × {hookData.song_name}
          </p>
        </div>

        {/* Split-screen canvases */}
        <div className="flex-1 flex flex-col sm:flex-row gap-1 px-1 min-h-0">
          {/* Hook A */}
          <motion.div
            className="relative flex-1 min-h-[35vh] sm:min-h-0 cursor-pointer rounded-lg overflow-hidden"
            animate={{
              opacity: activeHookSide !== "a" ? 0.4 : 1,
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => {
              setActiveHookSide("a");
              setTappedSides(prev => new Set(prev).add("a"));
              // Unmute this side, mute the other, restart from beginning
              if (hookACanvas.audioRef.current) { hookACanvas.audioRef.current.muted = false; }
              if (hookBCanvas.audioRef.current) { hookBCanvas.audioRef.current.muted = true; }
              hookACanvas.restart();
              setMuted(false);
            }}
          >
            <div ref={containerRef} className="absolute inset-0">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Label overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40 truncate max-w-[120px]">
                {hookALabel}
              </p>
            </div>

            {/* Vote pulse on selection */}
            {votedA && (
              <motion.div
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute inset-0 rounded-lg"
                style={{ border: `2px solid ${hookData.palette?.[1] || '#a855f7'}` }}
              />
            )}
          </motion.div>

          {/* Hook B */}
          <motion.div
            className="relative flex-1 min-h-[35vh] sm:min-h-0 cursor-pointer rounded-lg overflow-hidden"
            animate={{
              opacity: activeHookSide !== "b" ? 0.4 : 1,
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => {
              setActiveHookSide("b");
              setTappedSides(prev => new Set(prev).add("b"));
              if (hookBCanvas.audioRef.current) { hookBCanvas.audioRef.current.muted = false; }
              if (hookACanvas.audioRef.current) { hookACanvas.audioRef.current.muted = true; }
              hookBCanvas.restart();
              setMuted(false);
            }}
          >
            <div ref={containerRefB} className="absolute inset-0">
              <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Label overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40 truncate max-w-[120px]">
                {hookBLabel}
              </p>
            </div>

            {votedB && (
              <motion.div
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute inset-0 rounded-lg"
                style={{ border: `2px solid ${rivalHook?.palette?.[1] || '#a855f7'}` }}
              />
            )}
          </motion.div>
        </div>

        {/* Mute icon */}
        <AnimatePresence>
          {showMuteIcon && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed bottom-16 left-4 z-[55] text-white/50"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom panel — 3-state machine */}
        <div className="px-5 py-4 pb-[env(safe-area-inset-bottom,16px)]" style={{ background: bgBase, minHeight: '80px' }}>
          <AnimatePresence mode="wait">
            {/* State 1: Pre-Vote — tap to play, vote with button */}
            {!hasVoted && (
              <motion.div
                key="prevote"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-3 py-2"
              >
                {tappedSides.size === 0 ? (
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">
                    Tap each side to hear
                  </p>
                ) : (
                  <button
                    onClick={() => handleVote(activeHookSide === "a" ? hookData.id : rivalHook!.id)}
                    className="px-8 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors min-h-[44px]"
                  >
                    {"I'M HOOKED ON " + (activeHookSide === "a" ? hookALabel : hookBLabel)}
                  </button>
                )}
              </motion.div>
            )}

            {/* State 2: Post-Vote, Pre-Comment */}
            {hasVoted && !hasSubmitted && (
              <motion.div
                key="postVote"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40 truncate max-w-[120px]">
                      {votedA ? hookALabel : hookBLabel}
                    </p>
                    <motion.p
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-4xl font-bold tabular-nums text-white/90"
                    >
                      {votedA ? pctA : pctB}%
                    </motion.p>
                  </div>
                  <button
                    onClick={() => handleVote(votedA ? rivalHook!.id : hookData.id)}
                    className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors min-h-[44px] px-3"
                  >
                    Switch
                  </button>
                </div>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder={`what did ${votedA ? hookALabel.toLowerCase() : hookBLabel.toLowerCase()} do to you?`}
                  maxLength={200}
                  className="w-full bg-transparent border-0 border-b border-white/15 px-0 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors min-h-[44px]"
                />
              </motion.div>
            )}

            {/* State 3: Post-Comment */}
            {hasVoted && hasSubmitted && (
              <motion.div
                key="postComment"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3 text-center"
              >
                <p className="text-[10px] font-mono text-white/30">
                  your words are on the video
                </p>

                <div className="flex items-center justify-center gap-3">
                  {totalVotes > 0 && (
                    <span className="text-[10px] font-mono text-white/15">
                      {totalVotes} vote{totalVotes !== 1 ? "s" : ""} —
                    </span>
                  )}
                  <button
                    onClick={handleShare}
                    className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors min-h-[44px]"
                  >
                    {copied ? "Copied" : "SEND THIS"}
                  </button>
                </div>

                <p className="text-[10px] text-white/15">
                  Built on tools.fm — every artist's fingerprint is unique to them
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── SINGLE HOOK MODE (original experience) ────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: bgBase }}>
      {/* Fit by toolsFM badge */}
      <AnimatePresence>
        {badgeVisible && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={handleBadgeClick}
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
        onClick={handleMuteToggle}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <AnimatePresence>
          {showMuteIcon && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute bottom-4 left-4 z-10 text-white/50">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Below-canvas content */}
      <div className="w-full overflow-y-auto" style={{ background: bgBase }}>
        <div className="max-w-[480px] mx-auto px-5 py-6 space-y-6">
          <div className="space-y-1">
            <h1
              className="text-2xl font-bold leading-tight"
              style={{ fontFamily: fpFont || undefined, color: fpPrimary, textTransform: fpTextTransform as any }}
            >
              {hookData.artist_name}
            </h1>
            <p className="text-lg italic leading-snug" style={{ fontFamily: fpFont || undefined, color: "rgba(255,255,255,0.6)" }}>
              {hookData.song_name}
            </p>
          </div>

          {hookData.signature_line && (
            <p className="text-center text-sm" style={{ fontFamily: fpFont || undefined, color: bgAtmosphere }}>
              {hookData.signature_line}
            </p>
          )}

          <div className="flex items-center justify-center gap-2">
            <FireStreakAnimation system={hookData.system_type}>
              <span className="text-5xl flex items-center gap-2">
                <span>🔥</span>
                <span className="font-bold text-white tabular-nums">{fireCount}</span>
              </span>
            </FireStreakAnimation>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
              What did this do to you?
            </p>
            {hasSubmitted ? (
              <p className="text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                your words are on the video
              </p>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder={placeholder}
                  maxLength={200}
                  className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleShare}
            className="w-full py-3 text-sm font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            {copied ? "Copied" : "SEND THIS"}
          </button>

          <p className="text-center text-[10px] text-white/15 pb-4">
            Built on tools.fm — every artist's fingerprint is unique to them
          </p>
        </div>
      </div>
    </div>
  );
}
