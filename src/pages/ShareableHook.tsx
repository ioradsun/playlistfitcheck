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
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import { getSessionId } from "@/lib/sessionId";
import {
  useHookCanvas,
  HOOK_COLUMNS,
  RIVER_ROWS,
  type HookData,
  type HookComment as Comment,
  type ConstellationNode,
} from "@/hooks/useHookCanvas";

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

// useHookCanvas is now imported from @/hooks/useHookCanvas

// ── Main Component ──────────────────────────────────────────────────────────

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{
    artistSlug: string; songSlug: string; hookSlug: string;
  }>();
  const navigate = useNavigate();
  // Embed mode: hide badge, share bar, reduce padding for iframe embedding
  const isEmbed = new URLSearchParams(window.location.search).get("embed") === "true";
  // Lazy user ref — fetched once on first vote, not on mount
  const userIdRef = useRef<string | null | undefined>(undefined);

  const [hookData, setHookData] = useState<HookData | null>(null);
  const [rivalHook, setRivalHook] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsB, setCommentsB] = useState<Comment[]>([]);
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

    // HOOK_COLUMNS imported from shared hook

    supabase
      .from("shareable_hooks" as any)
      .select(HOOK_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .eq("hook_slug", hookSlug)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        const hook = data as any as HookData;

        // Preload audio immediately — browser starts fetching while we process
        const audioPreload = new Audio();
        audioPreload.preload = "auto";
        audioPreload.src = hook.audio_url;

        setHookData(hook);
        setFireCount(hook.fire_count);
        setVoteCountA(hook.vote_count || 0);

        // ── CRITICAL PATH: set loading=false NOW so canvases render immediately ──
        // Comments & votes are non-critical — they load in background
        if (hook.battle_id) {
          // Fire rival query — this IS critical for battle render
          const rivalPromise = supabase
            .from("shareable_hooks" as any)
            .select(HOOK_COLUMNS)
            .eq("battle_id", hook.battle_id)
            .neq("id", hook.id)
            .maybeSingle();

          const { data: rivalData } = await rivalPromise;
          if (rivalData) {
            const rival = rivalData as any as HookData;
            setRivalHook(rival);
            setVoteCountB(rival.vote_count || 0);
          }

          // Canvas can render now — stop blocking
          setLoading(false);

          // ── NON-CRITICAL: fire all remaining queries in parallel ──
          const sessionId = getSessionId();
          const [voteResult, commentsAResult, commentsBResult] = await Promise.all([
            // Check existing vote
            supabase
              .from("hook_votes" as any)
              .select("hook_id")
              .eq("battle_id", hook.battle_id)
              .eq("session_id", sessionId)
              .maybeSingle(),
            // Primary hook comments
            supabase
              .from("hook_comments" as any)
              .select("id, text, submitted_at")
              .eq("hook_id", hook.id)
              .order("submitted_at", { ascending: true })
              .limit(100),
            // Rival hook comments (use already-known rival ID)
            rivalData
              ? supabase
                  .from("hook_comments" as any)
                  .select("id, text, submitted_at")
                  .eq("hook_id", (rivalData as any).id)
                  .order("submitted_at", { ascending: true })
                  .limit(100)
              : Promise.resolve({ data: null }),
          ]);

          if (voteResult.data) setVotedHookId((voteResult.data as any).hook_id);
          if (commentsAResult.data) setComments(commentsAResult.data as any as Comment[]);
          if (commentsBResult.data) setCommentsB(commentsBResult.data as any as Comment[]);
        } else {
          // Single hook mode — set loading false immediately, load comments in background
          setLoading(false);

          const { data: commentsData } = await supabase
            .from("hook_comments" as any)
            .select("id, text, submitted_at")
            .eq("hook_id", hook.id)
            .order("submitted_at", { ascending: true })
            .limit(100);
          if (commentsData) setComments(commentsData as any as Comment[]);
        }
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

      // Permanent drift (halved)
      const driftSpeed = 0.008 + rng() * 0.012;
      const driftAngle = rng() * Math.PI * 2;

      // Age-based opacity: newest=6%, oldest=3%
      const baseOpacity = 0.06 - ageRatio * 0.03;

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
        currentSize: isRiver ? 12 : 11,
        baseOpacity,
      };
    });
    constellationRef.current = nodes;
    riverOffsetsRef.current = [0, 0, 0, 0];
  }, [comments, hookData]);

  // ── Build constellation for rival hook (B) ────────────────────────────────

  useEffect(() => {
    if (!rivalHook || commentsB.length === 0) return;
    const now = Date.now();
    const timestamps = commentsB.map(c => new Date(c.submitted_at).getTime());
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);
    const timeSpan = Math.max(newest - oldest, 1);

    const riverCount = Math.min(commentsB.length, RIVER_ROWS.length * 5);
    const riverStartIdx = Math.max(0, commentsB.length - riverCount);

    const nodes: ConstellationNode[] = commentsB.map((c, idx) => {
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
    constellationRefB.current = nodes;
    riverOffsetsRefB.current = [0, 0, 0, 0];
  }, [commentsB, rivalHook]);

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
      // Insert new vote — lazily resolve user ID
      if (userIdRef.current === undefined) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        userIdRef.current = authUser?.id ?? null;
      }
      await supabase
        .from("hook_votes" as any)
        .insert({
          battle_id: hookData.battle_id,
          hook_id: hookId,
          user_id: userIdRef.current || null,
          session_id: sessionId,
        });
    }
  }, [hookData, rivalHook, votedHookId]);

  // ── Badge timer ───────────────────────────────────────────────────────────
  useEffect(() => { setTimeout(() => setBadgeVisible(true), 1000); }, []);

  // Listen for pause messages from parent (embed mode scroll-out)
  useEffect(() => {
    if (!isEmbed) return;
    const handler = (e: MessageEvent) => {
      if (e.data === "hookfit:pause") {
        if (hookACanvas.audioRef.current) { hookACanvas.audioRef.current.muted = true; }
        if (hookBCanvas.audioRef.current) { hookBCanvas.audioRef.current.muted = true; }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEmbed]);

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

    // Save comment against the voted hook (or primary hook if no vote)
    const targetHookId = (isBattle && votedHookId) ? votedHookId : hookData.id;

    const { data: inserted } = await supabase
      .from("hook_comments" as any)
      .insert({ hook_id: targetHookId, text, session_id: sessionId })
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
      const driftSpeed = 0.008 + rng() * 0.012;
      const driftAngle = rng() * Math.PI * 2;
      const riverRowIndex = Math.floor(rng() * RIVER_ROWS.length);

      // Push to the active side's constellation
      const targetRef = (isBattle && activeHookSide === "b") ? constellationRefB : constellationRef;
      targetRef.current.push({
        id: newComment.id, text: newComment.text,
        submittedAt: Date.now(),
        seedX, seedY,
        x: 0.5, y: 0.5,
        driftSpeed, driftAngle,
        phase: "center",
        phaseStartTime: Date.now(),
        riverRowIndex,
        currentSize: 16,
        baseOpacity: 0.06,
      });
    }
  }, [inputText, hookData, hasSubmitted, isBattle, activeHookSide, votedHookId]);

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
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col z-50">
        <div className="px-5 pt-4 pb-2 flex justify-center">
          <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse" />
        </div>
        <div className="flex-1 flex flex-col sm:flex-row gap-1 px-1 min-h-0">
          <div className="relative flex-1 min-h-[35vh] sm:min-h-0 rounded-lg bg-white/[0.03] animate-pulse">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="h-3 w-16 rounded bg-white/[0.08] animate-pulse" />
            </div>
          </div>
          <div className="relative flex-1 min-h-[35vh] sm:min-h-0 rounded-lg bg-white/[0.03] animate-pulse">
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="h-3 w-16 rounded bg-white/[0.08] animate-pulse" />
            </div>
          </div>
        </div>
        <div className="h-[120px] px-4 flex items-center justify-center">
          <div className="h-10 w-64 rounded-lg bg-white/[0.05] animate-pulse" />
        </div>
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
    ? recentForPlaceholder[placeholderIndex % recentForPlaceholder.length]?.text || "COMMENT LIVE TO THE VIDEO FMLY STYLE"
    : "COMMENT LIVE TO THE VIDEO FMLY STYLE";

  const hookALabel = hookData.hook_label || "Hook A";
  const hookBLabel = rivalHook?.hook_label || "Hook B";
  const votedA = votedHookId === hookData.id;
  const votedB = votedHookId === rivalHook?.id;
  const hasVoted = !!votedHookId;

  // ── BATTLE MODE ───────────────────────────────────────────────────────────

  if (isBattle) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: bgBase }}>
        {/* Fit by toolsFM badge — hidden in embed mode */}
        {!isEmbed && (
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
        )}

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

        {/* Editorial header — reduced padding in embed */}
        <div className={isEmbed ? "px-3 pt-2 pb-1 text-center z-10" : "px-5 pt-4 pb-2 text-center z-10"}>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
            {hookData.artist_name} × {hookData.song_name}
          </p>
        </div>

        {/* Hooked badge — editorial, overlaid on video top-left */}
        <AnimatePresence>
          {hasVoted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute top-12 left-3 z-[60] pointer-events-none"
            >
              <p className="text-[9px] font-mono uppercase tracking-[0.3em]" style={{ color: 'rgba(57,255,20,0.45)' }}>
                {totalVotes <= 1
                  ? "Hooked"
                  : `You + ${totalVotes - 1} fmly`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Split-screen canvases */}
        <div className="flex-1 flex flex-col sm:flex-row gap-1 px-1 min-h-0 shrink-0">
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
        <div className="px-5 py-4 pb-[env(safe-area-inset-bottom,16px)] shrink-0 overflow-hidden" style={{ background: bgBase, height: '120px' }}>
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

            {/* State 2: Post-Vote — show "I'm Hooked" again if on different side, or comment input */}
            {hasVoted && !hasSubmitted && (
              <motion.div
                key="postVote"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* If active side differs from voted side, offer to switch */}
                {((activeHookSide === "a" && !votedA) || (activeHookSide === "b" && !votedB)) ? (
                  <div className="text-center py-2">
                    <button
                      onClick={() => handleVote(activeHookSide === "a" ? hookData.id : rivalHook!.id)}
                      className="px-8 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors min-h-[44px]"
                    >
                      {"I'M HOOKED ON " + (activeHookSide === "a" ? hookALabel : hookBLabel)}
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    placeholder="COMMENT LIVE TO THE VIDEO FMLY STYLE"
                    maxLength={200}
                    className="w-full bg-transparent border-0 border-b border-white/15 px-0 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors min-h-[44px]"
                  />
                )}
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
      {/* Fit by toolsFM badge — hidden in embed mode */}
      {!isEmbed && (
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
      )}

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
              COMMENT LIVE TO THE VIDEO FMLY STYLE
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
