/**
 * ShareableHook — The artist's permanent home for a hook on the internet.
 * Route: /:artistSlug/:songSlug/:hookSlug
 *
 * Three-layer canvas (comments constellation/river, Hook Dance, tools.fm badge)
 * + below-canvas content (artist identity, signature, fire streak, response input, share).
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground, type BackgroundState } from "@/engine/SystemBackgrounds";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { getSystemStyle, buildFont, applyTransform, computeFitFontSize } from "@/engine/SystemStyles";
import { HookDanceEngine, type BeatTick } from "@/engine/HookDanceEngine";
import type { PhysicsState, PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";

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
  system_type: string;
  palette: string[];
  signature_line: string | null;
}

interface Comment {
  id: string;
  text: string;
  submitted_at: string;
}

// ── Constellation node (deterministic position from timestamp) ───────────

interface ConstellationNode {
  id: string;
  text: string;
  x: number;  // 0–1 normalized
  y: number;
  vx: number; // drift per frame
  vy: number;
  alpha: number;
  age: number; // seconds since submission
}

// ── River row ───────────────────────────────────────────────────────────────

interface RiverRow {
  comments: { id: string; text: string; alpha: number }[];
  speed: number;
  y: number; // 0–1 normalized height
  offset: number;
}

// (Badge is now a DOM element — drawBadgeMicro removed)

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

// ── Main Component ──────────────────────────────────────────────────────────

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{
    artistSlug: string;
    songSlug: string;
    hookSlug: string;
  }>();
  const navigate = useNavigate();

  const [hookData, setHookData] = useState<HookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [fireCount, setFireCount] = useState(0);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const muteIconTimerRef = useRef<number | null>(null);

  // Engine state
  const engineRef = useRef<HookDanceEngine | null>(null);
  const [physicsState, setPhysicsState] = useState<PhysicsState | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [beatCount, setBeatCount] = useState(0);
  const prngRef = useRef<(() => number) | null>(null);

  // Comment input
  const [inputText, setInputText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Constellation + river
  const constellationRef = useRef<ConstellationNode[]>([]);
  const riverRowsRef = useRef<RiverRow[]>([]);

  // Badge
  const [badgeVisible, setBadgeVisible] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Share
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
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const hook = data as any as HookData;
        setHookData(hook);
        setFireCount(hook.fire_count);

        // Load comments
        const { data: commentsData } = await supabase
          .from("hook_comments" as any)
          .select("id, text, submitted_at")
          .eq("hook_id", hook.id)
          .order("submitted_at", { ascending: true })
          .limit(500);

        if (commentsData) {
          setComments(commentsData as any as Comment[]);
        }

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
      const maxAge = 30 * 24 * 3600; // 30 days
      const normalizedAge = Math.min(ageSec / maxAge, 1);

      // Newer comments near center, older toward edges
      const dist = 0.1 + normalizedAge * 0.4;
      const angle = rng() * Math.PI * 2;

      return {
        id: c.id,
        text: c.text,
        x: 0.5 + Math.cos(angle) * dist,
        y: 0.5 + Math.sin(angle) * dist,
        vx: (rng() - 0.5) * 0.00002,
        vy: (rng() - 0.5) * 0.00002,
        alpha: 0.06 + (1 - normalizedAge) * 0.06, // 6% to 12%
        age: ageSec,
      };
    });
    constellationRef.current = nodes;

    // Build river rows from recent comments
    const recent = comments.slice(-100);
    const rows: RiverRow[] = [0.2, 0.4, 0.6, 0.8].map((y, i) => ({
      comments: recent.slice(i * 5, i * 5 + 5).map((c, j) => ({
        id: c.id,
        text: c.text,
        alpha: 0.15 - j * 0.02,
      })),
      speed: 0.3 + i * 0.1,
      y,
      offset: 0,
    }));
    riverRowsRef.current = rows;
  }, [comments, hookData]);

  // ── Setup audio + engine ──────────────────────────────────────────────────

  useEffect(() => {
    if (!hookData) return;

    const audio = new Audio();
    audio.muted = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audio.addEventListener("error", (e) => {
      console.warn("[ShareableHook] audio error:", (e.target as HTMLAudioElement)?.error?.message);
    });

    audio.src = hookData.audio_url;

    const spec = hookData.physics_spec as PhysicsSpec;
    const beats: BeatTick[] = hookData.beat_grid.beats.map((t: number, i: number) => ({
      time: t,
      isDownbeat: i % 4 === 0,
      strength: i % 4 === 0 ? 1 : 0.6,
    }));

    // Constrain loop to actual lyric coverage so audio doesn't play past visible lyrics
    const lines = hookData.lyrics as LyricLine[];
    const lyricsStart = lines.length > 0 ? Math.min(hookData.hook_start, lines[0].start) : hookData.hook_start;
    const lyricsEnd = lines.length > 0 ? Math.min(hookData.hook_end, lines[lines.length - 1].end + 0.3) : hookData.hook_end;
    const effectiveStart = Math.max(hookData.hook_start, lyricsStart);
    const effectiveEnd = Math.max(effectiveStart + 1, lyricsEnd);

    const engine = new HookDanceEngine(
      { ...spec, system: hookData.system_type },
      beats,
      effectiveStart,
      effectiveEnd,
      audio,
      {
        onFrame: (state, time, bc) => {
          setPhysicsState(state);
          setCurrentTime(time);
          setBeatCount(bc);
        },
        onEnd: () => {},
      },
      `${hookData.song_name}-${hookData.hook_start.toFixed(3)}`,
    );

    engineRef.current = engine;
    prngRef.current = engine.prng;
    engine.start();

    // Show badge after 1 second
    setTimeout(() => setBadgeVisible(true), 1000);

    return () => {
      engine.stop();
      audio.pause();
    };
  }, [hookData]);

  // ── Canvas resize ─────────────────────────────────────────────────────────

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
        canvas.width = newW;
        canvas.height = newH;
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [hookData]);

  // ── Canvas draw loop ──────────────────────────────────────────────────────

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

    // === LAYER 1: Comment field (constellation + river) ===
    // Draw system background first as base
    drawSystemBackground(ctx, {
      system: hookData.system_type,
      physState: physicsState,
      w, h,
      time: currentTime,
      beatCount,
      rng: prngRef.current,
      palette,
      hookStart: hookData.hook_start,
      hookEnd: hookData.hook_end,
    });

    // Constellation: floating comment nodes
    const nodes = constellationRef.current;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
      // Wrap
      if (node.x < -0.1) node.x = 1.1;
      if (node.x > 1.1) node.x = -0.1;
      if (node.y < -0.1) node.y = 1.1;
      if (node.y > 1.1) node.y = -0.1;

      ctx.globalAlpha = node.alpha;
      ctx.fillStyle = "#ffffff";
      const maxChars = 40;
      const displayText = node.text.length > maxChars ? node.text.slice(0, maxChars) + "…" : node.text;
      ctx.fillText(displayText, node.x * w, node.y * h);
    }

    // River: scrolling horizontal rows
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
      // Reset when scrolled too far
      if (row.offset < -(w + 400) * 2) row.offset = 0;
    }
    ctx.globalAlpha = 1;

    // === LAYER 2: Hook Dance video (physics-driven lyrics) ===
    const lines = hookData.lyrics as LyricLine[];
    const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
    const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;
    const spec = hookData.physics_spec as PhysicsSpec;

    if (activeLine) {
      let effectKey = "STATIC_RESOLVE";
      if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
        const isLastHookLine = activeLine.end >= hookData.hook_end - 0.5;
        if (isLastHookLine) {
          effectKey = "HOOK_FRACTURE";
        } else {
          const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
          effectKey = spec.effect_pool[poolIdx];
        }
      } else if (spec.effect_sequence) {
        const seqEntry = spec.effect_sequence.find(e => e.line_index === activeLineIndex);
        effectKey = seqEntry?.effect_key ?? "STATIC_RESOLVE";
      }

      const drawFn = getEffect(effectKey);
      const age = (currentTime - activeLine.start) * 1000;
      const lineDur = activeLine.end - activeLine.start;
      const progress = Math.min(1, (currentTime - activeLine.start) / lineDur);

      const fs = computeFitFontSize(ctx, activeLine.text, w, hookData.system_type);

      const effectState: EffectState = {
        text: activeLine.text,
        physState: physicsState,
        w, h, fs, age, progress,
        rng: prngRef.current,
        palette,
        system: hookData.system_type,
      };
      drawFn(ctx, effectState);
    }

    // Badge is now a DOM element (see below)

    // Progress bar
    const hookProgress = (currentTime - hookData.hook_start) / (hookData.hook_end - hookData.hook_start);
    ctx.fillStyle = palette[1] || "#a855f7";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, h - 3, w * Math.max(0, Math.min(1, hookProgress)), 3);
    ctx.globalAlpha = 1;

    ctx.restore();
  }, [physicsState, currentTime, beatCount, hookData]);

  // ── Handle canvas tap (unmute) ────────────────────────────────────────────

  const handleCanvasTap = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !muted;
    audio.muted = newMuted;
    setMuted(newMuted);

    // Ensure audio is actually playing when user interacts (user gesture context)
    if (!newMuted) {
      audio.play().catch((e) => console.warn("[ShareableHook] play on unmute failed:", e));
    }

    setShowMuteIcon(true);
    if (muteIconTimerRef.current) clearTimeout(muteIconTimerRef.current);
    muteIconTimerRef.current = window.setTimeout(() => setShowMuteIcon(false), 2000);
  }, [muted]);

  // Badge click handler
  const handleBadgeClick = useCallback(() => {
    if (!hookData) return;
    navigate(`/?from=hook&song=${encodeURIComponent(hookData.song_name)}`);
  }, [hookData, navigate]);

  // ── Submit comment ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || !hookData || hasSubmitted) return;
    const text = inputText.trim().slice(0, 200);

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

      // Add to constellation at center, bright
      constellationRef.current.push({
        id: newComment.id,
        text: newComment.text,
        x: 0.5,
        y: 0.5,
        vx: (Math.random() - 0.5) * 0.0001,
        vy: (Math.random() - 0.5) * 0.0001,
        alpha: 1,
        age: 0,
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
  const shareCaption = hookData?.signature_line
    ? `${hookData.signature_line} — ${shareUrl}`
    : shareUrl;

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

  // Hide Lovable widget on share page
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

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
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">
          tools.fm
        </button>
      </div>
    );
  }

  const recentForPlaceholder = comments.slice(-20);
  const placeholder = recentForPlaceholder.length > 0
    ? recentForPlaceholder[placeholderIndex % recentForPlaceholder.length]?.text || "what did this do to you?"
    : "what did this do to you?";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: bgBase }}>
      {/* Fit by toolsFM badge — fixed bottom-right like Lovable's badge */}
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
      {/* ── Canvas area — full viewport height on mobile ── */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[60vh] md:min-h-[70vh] cursor-pointer"
        onClick={handleCanvasTap}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Mute icon */}
        <AnimatePresence>
          {showMuteIcon && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 left-4 z-10 text-white/50"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── Below-canvas content ── */}
      <div
        className="w-full overflow-y-auto"
        style={{ background: bgBase }}
      >
        <div className="max-w-[480px] mx-auto px-5 py-6 space-y-6">

          {/* Artist identity block */}
          <div className="space-y-1">
            <h1
              className="text-2xl font-bold leading-tight"
              style={{
                fontFamily: fpFont || undefined,
                color: fpPrimary,
                textTransform: fpTextTransform as any,
              }}
            >
              {hookData.artist_name}
            </h1>
            <p
              className="text-lg italic leading-snug"
              style={{
                fontFamily: fpFont || undefined,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {hookData.song_name}
            </p>
          </div>

          {/* Signature line */}
          {hookData.signature_line && (
            <p
              className="text-center text-sm"
              style={{
                fontFamily: fpFont || undefined,
                color: bgAtmosphere,
              }}
            >
              {hookData.signature_line}
            </p>
          )}

          {/* Fire streak */}
          <div className="flex items-center justify-center gap-2">
            <FireStreakAnimation system={hookData.system_type}>
              <span className="text-5xl flex items-center gap-2">
                <span>🔥</span>
                <span className="font-bold text-white tabular-nums">{fireCount}</span>
              </span>
            </FireStreakAnimation>
          </div>

          {/* Response input */}
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

          {/* Share button */}
          <button
            onClick={handleShare}
            className="w-full py-3 text-sm font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            {copied ? "Copied" : "SEND THIS"}
          </button>

          {/* Bottom line */}
          <p className="text-center text-[10px] text-white/15 pb-4">
            Built on tools.fm — every artist's fingerprint is unique to them
          </p>
        </div>
      </div>
    </div>
  );
}
