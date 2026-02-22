/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Ungated, lightweight — bypasses main provider tree like ShareableHook.
 * Renders the full song with the physics engine on a canvas.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { mulberry32, hashSeed, PhysicsIntegrator } from "@/engine/PhysicsIntegrator";
import type { PhysicsSpec, PhysicsState } from "@/engine/PhysicsIntegrator";
import { drawSystemBackground } from "@/engine/SystemBackgrounds";
import { getEffect, type EffectState } from "@/engine/EffectRegistry";
import { computeFitFontSize } from "@/engine/SystemStyles";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";

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

const COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,physics_spec,beat_grid,palette,system_type,artist_dna,seed";

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const muteIconTimerRef = useRef<number | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const integratorRef = useRef<PhysicsIntegrator | null>(null);
  const rngRef = useRef<() => number>(() => 0);

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
      .then(({ data: row, error }) => {
        if (error || !row) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setData(row as any as LyricDanceData);
        setLoading(false);
      });
  }, [artistSlug, songSlug]);

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
    integratorRef.current = integrator;
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

    // Start playback silently
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

      // Loop audio back when past song end
      if (currentTime >= songEnd) {
        audio.currentTime = songStart;
        beatIndex = 0;
        prevTime = songStart;
        return;
      }

      // Scan beats
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
      {/* Header */}
      <div className="px-5 pt-4 pb-2 text-center z-10 shrink-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
          {data.artist_name} × {data.song_name}
        </p>
        <p className="text-[8px] font-mono uppercase tracking-[0.4em] text-white/15 mt-0.5">
          lyric dance
        </p>
      </div>

      {/* Full-screen canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 cursor-pointer relative"
        onClick={handleMuteToggle}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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

      {/* Bottom bar — tap to unmute hint */}
      <div className="px-5 py-3 pb-[env(safe-area-inset-bottom,12px)] shrink-0 text-center">
        {muted && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/20"
          >
            Tap to unmute
          </motion.p>
        )}
      </div>

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
