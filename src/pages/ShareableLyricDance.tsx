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
import { Volume2, VolumeX } from "lucide-react";
import { mulberry32, hashSeed, PhysicsIntegrator } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize } from "@/engine/SystemStyles";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import LyricDanceBottomPanel from "@/components/lyricdance/LyricDanceBottomPanel";

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

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [fireCount, setFireCount] = useState(0);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const muteIconTimerRef = useRef<number | null>(null);

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
        if (commentsResult.data) buildConstellation(commentsResult.data as any as DanceComment[]);
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
        const { fs, effectiveLetterSpacing } = computeFitFontSize(ctx, activeLine.text, cw, spec.system);

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
        };
        drawFn(ctx, effectState);
        ctx.restore();
      }

      // Progress bar
      const songProgress = (currentTime - songStart) / (songEnd - songStart);
      ctx.save();
      ctx.fillStyle = palette[1] || "#a855f7";
      ctx.globalAlpha = 0.4;
      ctx.fillRect(0, ch - 3, cw * Math.max(0, Math.min(1, songProgress)), 3);
      ctx.restore();

      // System label
      ctx.save();
      ctx.font = `${Math.max(9, Math.round(cw * 0.012))}px "Geist Mono", monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${spec.system} · lyric dance`, 12, ch - 10);
      ctx.restore();

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
    setShowMuteIcon(true);
    if (muteIconTimerRef.current) clearTimeout(muteIconTimerRef.current);
    muteIconTimerRef.current = window.setTimeout(() => setShowMuteIcon(false), 2000);
  }, [muted]);

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      {/* Header with artist profile */}
      <div className="px-5 pt-4 pb-2 text-center z-10 shrink-0 flex flex-col items-center gap-1.5">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name || data.artist_name}
            className="w-7 h-7 rounded-full object-cover border border-white/10"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <span className="text-[9px] font-mono text-white/40">
              {(data.artist_name || "?")[0].toUpperCase()}
            </span>
          </div>
        )}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
            {profile?.display_name || data.artist_name}
          </p>
          <p className="text-[8px] font-mono uppercase tracking-[0.4em] text-white/15 mt-0.5">
            {data.song_name} · lyric dance
          </p>
        </div>
      </div>

      {/* Full-screen canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 cursor-pointer relative overflow-hidden"
        onClick={handleMuteToggle}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* Mute icon */}
      <AnimatePresence>
        {showMuteIcon && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed bottom-28 left-4 z-[55] text-white/50"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom panel — signal/comment state machine */}
      {muted ? (
        <div className="px-5 py-3 pb-[env(safe-area-inset-bottom,12px)] shrink-0 text-center relative z-20" style={{ background: "#0a0a0a" }}>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/20"
          >
            Tap to unmute
          </motion.p>
        </div>
      ) : (
        <LyricDanceBottomPanel
          danceId={data.id}
          constellationRef={constellationRef}
          onCommentAdded={() => setFireCount(c => c + 1)}
        />
      )}

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
    </div>
  );
}
