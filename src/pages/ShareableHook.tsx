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
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  age: number;
  // Fly-in animation fields
  phase: "flying" | "settling" | "drifting";
  targetX: number;
  targetY: number;
  flySpeed: number;
  settleTimer: number;
  maxAlpha: number;
  scale: number;
}

interface RiverRow {
  comments: { id: string; text: string; alpha: number }[];
  speed: number;
  y: number;
  offset: number;
}

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
  riverRowsRef: React.MutableRefObject<RiverRow[]>,
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

    if (active) {
      engine.start();
    }

    return () => { engine.stop(); audio.pause(); };
  }, [hookData]);

  // Track active prop in a ref to avoid re-running setup effect
  const activeRef = useRef(active);

  // Handle active state changes — start/stop engine accordingly
  useEffect(() => {
    // Skip if this is the initial mount (engine already started/stopped above)
    if (activeRef.current === active) return;
    activeRef.current = active;
    const engine = engineRef.current;
    if (!engine) return;
    if (active) {
      engine.stop();
      engine.start();
    } else {
      engine.stop();
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

    // Constellation with fly-in animation + continuous orbit
    const nodes = constellationRef.current;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const node of nodes) {
      node.age += 1; // frame counter
      if (node.phase === "flying") {
        const dx = node.targetX - node.x;
        const dy = node.targetY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.02) {
          node.x = node.targetX; node.y = node.targetY;
          node.phase = "settling"; node.settleTimer = 0;
        } else {
          node.x += dx * node.flySpeed * 3;
          node.y += dy * node.flySpeed * 3;
        }
        node.scale = Math.max(1, node.scale - 0.01);
      } else if (node.phase === "settling") {
        node.settleTimer += 1;
        if (node.settleTimer > 90) {
          node.phase = "drifting";
        }
        node.alpha = Math.max(node.maxAlpha, node.alpha - 0.003);
        node.scale = Math.max(1, node.scale - 0.005);
      } else {
        // Drifting — continuous slow orbit around center
        // Use a deterministic angle based on id seed + age for smooth looping
        const rng2 = mulberry32(hashSeed(node.id));
        const baseAngle = rng2() * Math.PI * 2;
        const orbitRadius = 0.12 + rng2() * 0.32;
        const orbitSpeed = (0.0003 + rng2() * 0.0004) * (rng2() > 0.5 ? 1 : -1);
        const angle = baseAngle + node.age * orbitSpeed;
        node.x = 0.5 + Math.cos(angle) * orbitRadius;
        node.y = 0.5 + Math.sin(angle) * orbitRadius;
        // Gentle alpha pulsing so they feel alive
        node.alpha = node.maxAlpha + Math.sin(node.age * 0.008) * 0.02;
        node.scale = 1;
      }
      ctx.globalAlpha = Math.max(0, node.alpha);
      ctx.fillStyle = "#ffffff";
      const fontSize = Math.round(11 * node.scale);
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      const maxChars = 40;
      ctx.fillText(node.text.length > maxChars ? node.text.slice(0, maxChars) + "…" : node.text, node.x * w, node.y * h);
    }

    // River
    const rows = riverRowsRef.current;
    ctx.font = "13px system-ui, sans-serif";
    for (const row of rows) {
      row.offset -= row.speed;
      let xPos = row.offset;
      for (const comment of row.comments) {
        ctx.globalAlpha = comment.alpha;
        ctx.fillStyle = "#ffffff";
        const measured = ctx.measureText(comment.text).width;
        ctx.fillText(comment.text, xPos % (w + 400), row.y * h);
        xPos += measured + 60;
      }
      if (row.offset < -(w + 400) * 2) row.offset = 0;
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
      const fs = computeFitFontSize(ctx, activeLine.text, w, hookData.system_type);
      drawFn(ctx, { text: activeLine.text, physState: physicsState, w, h, fs, age, progress, rng: prngRef.current, palette, system: hookData.system_type });
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

  // Constellation + river for primary
  const constellationRef = useRef<ConstellationNode[]>([]);
  const riverRowsRef = useRef<RiverRow[]>([]);
  // Empty refs for rival (no comments on rival canvas)
  const constellationRefB = useRef<ConstellationNode[]>([]);
  const riverRowsRefB = useRef<RiverRow[]>([]);

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
    const nodes: ConstellationNode[] = comments.map((c) => {
      const ts = new Date(c.submitted_at).getTime();
      const rng = mulberry32(hashSeed(c.id));
      const ageSec = (now - ts) / 1000;
      const maxAge = 30 * 24 * 3600;
      const normalizedAge = Math.min(ageSec / maxAge, 1);
      const dist = 0.1 + normalizedAge * 0.4;
      const angle = rng() * Math.PI * 2;
      const finalX = 0.5 + Math.cos(angle) * dist;
      const finalY = 0.5 + Math.sin(angle) * dist;
      return {
        id: c.id, text: c.text,
        x: finalX, y: finalY,
        vx: (rng() - 0.5) * 0.00002, vy: (rng() - 0.5) * 0.00002,
        alpha: 0.06 + (1 - normalizedAge) * 0.06, age: ageSec,
        phase: "drifting" as const, targetX: finalX, targetY: finalY,
        flySpeed: 0, settleTimer: 0, maxAlpha: 0.06 + (1 - normalizedAge) * 0.06, scale: 1,
      };
    });
    constellationRef.current = nodes;

    const recent = comments.slice(-100);
    const rows: RiverRow[] = [0.2, 0.4, 0.6, 0.8].map((y, i) => ({
      comments: recent.slice(i * 5, i * 5 + 5).map((c, j) => ({
        id: c.id, text: c.text, alpha: 0.15 - j * 0.02,
      })),
      speed: 0.3 + i * 0.1, y, offset: 0,
    }));
    riverRowsRef.current = rows;
  }, [comments, hookData]);

  // ── Hook canvas engines ───────────────────────────────────────────────────

  const hookACanvas = useHookCanvas(canvasRef, containerRef, hookData, constellationRef, riverRowsRef, !isBattle || activeHookSide === "a");
  const hookBCanvas = useHookCanvas(canvasRefB, containerRefB, rivalHook, constellationRefB, riverRowsRefB, isBattle && activeHookSide === "b");

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

      // Spawn from a random edge, fly bright to center, then drift into constellation
      const edge = Math.random();
      let spawnX: number, spawnY: number;
      if (edge < 0.25) { spawnX = -0.15; spawnY = Math.random(); }
      else if (edge < 0.5) { spawnX = 1.15; spawnY = Math.random(); }
      else if (edge < 0.75) { spawnX = Math.random(); spawnY = -0.15; }
      else { spawnX = Math.random(); spawnY = 1.15; }

      const rng = mulberry32(hashSeed(newComment.id));
      const settledAngle = rng() * Math.PI * 2;
      const settledDist = 0.1 + rng() * 0.15;
      constellationRef.current.push({
        id: newComment.id, text: newComment.text,
        x: spawnX, y: spawnY,
        vx: (rng() - 0.5) * 0.00002, vy: (rng() - 0.5) * 0.00002,
        alpha: 1, age: 0,
        phase: "flying", targetX: 0.5, targetY: 0.5,
        flySpeed: 0.008 + Math.random() * 0.006,
        settleTimer: 0,
        maxAlpha: 0.12,
        scale: 1.8,
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
            className={`relative flex-1 min-h-[35vh] sm:min-h-0 cursor-pointer rounded-lg overflow-hidden ${activeHookSide !== "a" ? "opacity-40" : ""}`}
            animate={{
              opacity: activeHookSide !== "a" ? 0.4 : hasVoted && !votedA ? 0.7 : 1,
              scale: hasVoted && votedA ? 1.01 : 1,
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => {
              setActiveHookSide("a");
              hookACanvas.restart();
              setMuted(false);
              if (!hasVoted) handleVote(hookData.id);
            }}
          >
            <div ref={containerRef} className="absolute inset-0">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Label overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40">
                {hookALabel}
              </p>
            </div>

            {/* Vote pulse on selection */}
            {votedA && (
              <motion.div
                initial={{ opacity: 0.4, scale: 0.8 }}
                animate={{ opacity: 0, scale: 2 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute inset-0 rounded-lg"
                style={{ border: `2px solid ${hookData.palette?.[1] || '#a855f7'}` }}
              />
            )}
          </motion.div>

          {/* Hook B */}
          <motion.div
            className={`relative flex-1 min-h-[35vh] sm:min-h-0 cursor-pointer rounded-lg overflow-hidden ${activeHookSide !== "b" ? "opacity-40" : ""}`}
            animate={{
              opacity: activeHookSide !== "b" ? 0.4 : hasVoted && !votedB ? 0.7 : 1,
              scale: hasVoted && votedB ? 1.01 : 1,
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={() => {
              setActiveHookSide("b");
              hookBCanvas.restart();
              setMuted(false);
              if (!hasVoted) handleVote(rivalHook!.id);
            }}
          >
            <div ref={containerRefB} className="absolute inset-0">
              <canvas ref={canvasRefB} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Label overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40">
                {hookBLabel}
              </p>
            </div>

            {votedB && (
              <motion.div
                initial={{ opacity: 0.4, scale: 0.8 }}
                animate={{ opacity: 0, scale: 2 }}
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

        {/* Vote results + CTA */}
        <div className="px-5 py-4 space-y-3" style={{ background: bgBase }}>
          {/* Vote bars */}
          <div className="flex items-center gap-3">
            {/* A bar */}
            <div className="flex-1 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">{hookALabel}</span>
                <motion.span
                  key={pctA}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-bold tabular-nums text-white/90"
                >
                  {hasVoted ? `${pctA}%` : ""}
                </motion.span>
              </div>
              <div className="h-[2px] rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: hookData.palette?.[1] || '#a855f7' }}
                  initial={{ width: "0%" }}
                  animate={{ width: hasVoted ? `${pctA}%` : "0%" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>

            <span className="text-white/10 text-xs font-mono">vs</span>

            {/* B bar */}
            <div className="flex-1 space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">{hookBLabel}</span>
                <motion.span
                  key={pctB}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-bold tabular-nums text-white/90"
                >
                  {hasVoted ? `${pctB}%` : ""}
                </motion.span>
              </div>
              <div className="h-[2px] rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: rivalHook?.palette?.[1] || '#ec4899' }}
                  initial={{ width: "0%" }}
                  animate={{ width: hasVoted ? `${pctB}%` : "0%" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>

          {/* CTA / comment input */}
          {!hasVoted ? (
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-center text-white/20">
              Tap each side to hear it. Vote for the one that hits harder.
            </p>
          ) : hasSubmitted ? (
            <p className="text-center text-sm text-white/30">
              your words are on the video
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-center text-white/20">
                What did {votedA ? hookALabel : hookBLabel} do to you?
              </p>
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
            </div>
          )}

          {/* Total votes */}
          {totalVotes > 0 && (
            <p className="text-[10px] font-mono text-center text-white/15">
              {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
            </p>
          )}

          {/* Share button */}
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
