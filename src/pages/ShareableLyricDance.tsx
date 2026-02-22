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

import { mulberry32, hashSeed, PhysicsIntegrator } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize, computeStackedLayout } from "@/engine/SystemStyles";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import { getSessionId } from "@/lib/sessionId";

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

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,physics_spec,beat_grid,palette,system_type,artist_dna,seed";

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
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [fireCount, setFireCount] = useState(0);

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
    const palette = data.palette || ["#ffffff", "#a855f7", "#ec4899"];

    const integrator = new PhysicsIntegrator(spec);
    const rng = mulberry32(hashSeed(data.seed || data.id));
    rngRef.current = rng;

    const sortedBeats = [...data.beat_grid.beats].sort((a, b) => a - b);
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;

    // Set up audio
    const audio = new Audio(data.audio_url);
    audio.loop = true;
    audio.muted = true;
    audio.preload = "auto";
    audioRef.current = audio;

    audio.currentTime = songStart;
    audio.play().catch(() => {});

    let beatIndex = 0;
    let prevTime = songStart;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      animRef.current = requestAnimationFrame(render);
      const cw = canvas.width / (window.devicePixelRatio || 1);
      const ch = canvas.height / (window.devicePixelRatio || 1);
      const currentTime = audio.currentTime;

      if (currentTime >= songEnd) {
        audio.currentTime = songStart;
        beatIndex = 0;
        prevTime = songStart;
        return;
      }

      while (beatIndex < sortedBeats.length && sortedBeats[beatIndex] <= currentTime) {
        if (sortedBeats[beatIndex] > prevTime) {
          const isDownbeat = beatIndex % 4 === 0;
          integrator.onBeat(isDownbeat ? 1 : 0.5, isDownbeat);
        }
        beatIndex++;
      }

      const state = integrator.tick();
      const activeLine = lines.find(l => currentTime >= l.start && currentTime < l.end);
      const activeLineIndex = activeLine ? lines.indexOf(activeLine) : -1;

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, cw, ch);

      drawSystemBackground(ctx, {
        system: spec.system,
        physState: state,
        w: cw, h: ch,
        time: currentTime,
        beatCount: beatIndex,
        rng,
        palette,
        hookStart: songStart,
        hookEnd: songEnd,
      });

      // ── Comment rendering (constellation + river + center) ──
      const nodes = constellationRef.current;
      const now = Date.now();
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
          const elapsed = now - node.phaseStartTime;
          ctx.font = "400 14px system-ui, -apple-system, sans-serif";
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          const truncated = node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text;
          ctx.fillText(truncated, cw / 2, ch / 2);
          ctx.textAlign = "start";
          if (elapsed >= 800) { node.phase = "transitioning"; node.phaseStartTime = now; }
        } else if (node.phase === "transitioning") {
          const elapsed = now - node.phaseStartTime;
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
          if (elapsed >= 4000) { node.phase = "river"; node.phaseStartTime = now; }
        }
      }
      ctx.globalAlpha = 1;

      // Active line
      if (activeLine) {
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
          physState: state,
          w: cw, h: ch,
          fs, age,
          progress: lineProgress,
          rng,
          palette,
          system: spec.system,
          effectiveLetterSpacing,
          stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
        };
        drawFn(ctx, effectState);
        ctx.restore();
      }

      // Progress bar — rendered via HTML overlay now, skip canvas bar

      prevTime = currentTime;
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
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
    </div>
  );
}
