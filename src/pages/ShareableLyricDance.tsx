/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Thin React shell — all rendering is delegated to LyricDancePlayer.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { RIVER_ROWS, type ConstellationNode } from "@/hooks/useHookCanvas";
import { getSessionId } from "@/lib/sessionId";
import { LyricDanceDebugPanel } from "@/components/lyric/LyricDanceDebugPanel";
import { LyricDancePlayer, DEFAULT_DEBUG_STATE, type LyricDanceData, type LiveDebugState } from "@/engine/LyricDancePlayer";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import type { CinematicDirection } from "@/types/CinematicDirection";

// ─── Types ──────────────────────────────────────────────────────────

interface ProfileInfo { display_name: string | null; avatar_url: string | null; }
interface DanceComment { id: string; text: string; submitted_at: string; }

const PHASE1_COLUMNS = "id,user_id,artist_slug,song_slug,artist_name,song_name,audio_url,lyrics,physics_spec,beat_grid,palette,system_type,artist_dna,seed,scene_manifest";
const DIRECTION_COLUMNS = "cinematic_direction";

// ─── Progress Bar ───────────────────────────────────────────────────

function ProgressBar({ player, data, onSeekStart, onSeekEnd, palette }: {
  player: LyricDancePlayer | null;
  data: LyricDanceData;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  palette: string[];
}) {
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const wasPlaying = useRef(false);

  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const duration = songEnd - songStart;
    let rafId = 0;
    const update = () => {
      const p = duration > 0 ? (audio.currentTime - songStart) / duration : 0;
      setProgress(Math.max(0, Math.min(1, p)));
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [player, data]);

  const seekTo = useCallback((clientX: number) => {
    if (!barRef.current || !player) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    player.seek(songStart + ratio * (songEnd - songStart));
  }, [player, data]);

  const handleDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!player) return;
    e.stopPropagation();
    dragging.current = true;
    wasPlaying.current = !player.audio.paused;
    player.pause();
    onSeekStart();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    seekTo(clientX);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const cx = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      seekTo(cx);
    };
    const onUp = () => {
      dragging.current = false;
      onSeekEnd();
      if (wasPlaying.current) player.play();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }, [player, seekTo, onSeekStart, onSeekEnd]);

  return (
    <div
      ref={barRef}
      onMouseDown={handleDown}
      onTouchStart={handleDown}
      onClick={e => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-10 h-3 cursor-pointer group"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-white/5" />
      <div className="absolute left-0 top-0 h-full transition-none" style={{ width: `${progress * 100}%`, background: palette[1] || "#a855f7", opacity: 0.6 }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress * 100}% - 6px)` }} />
    </div>
  );
}

// ─── Live Debug HUD ─────────────────────────────────────────────────

function LiveDebugHUD({ player }: { player: LyricDancePlayer | null }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<LiveDebugState>(DEFAULT_DEBUG_STATE);

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

  useEffect(() => {
    if (!open || !player) return;
    const id = setInterval(() => setSnap({ ...player.debugState }), 100);
    return () => clearInterval(id);
  }, [open, player]);

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
      <Section title="BEAT"><Row label="intensity" value={f(snap.beatIntensity)} /><Row label="physGlow" value={f(snap.physGlow)} /></Section>
      <Section title="PHYSICS"><Row label="heat" value={f(snap.heat)} /><Row label="velocity" value={f(snap.velocity)} /><Row label="words" value={String(snap.wordCount)} /></Section>
      <Section title="ANIMATION"><Row label="effect" value={snap.effectKey} /><Row label="entry" value={f(snap.entryProgress)} /><Row label="exit" value={f(snap.exitProgress)} /><Row label="mod" value={snap.activeMod ?? "none"} /></Section>
      <Section title="PARTICLES"><Row label="system" value={snap.particleSystem} /><Row label="count" value={String(snap.particleCount)} /></Section>
      <Section title="DIRECTION"><Row label="chapter" value={snap.dirChapter} /><Row label="tension" value={snap.tensionStage} /></Section>
      <Section title="PERFORMANCE"><Row label="fps" value={String(Math.round(snap.fps))} /><Row label="total" value={snap.perfTotal.toFixed(2)} /><Row label="text" value={snap.perfText.toFixed(2)} /><Row label="bg" value={snap.perfBg.toFixed(2)} /></Section>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(74,222,128,0.4)", textAlign: "center" as const }}>{f(snap.time, 2)}s · press D to close</div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<LyricDancePlayer | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(PHASE1_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (error || !row) { setNotFound(true); setLoading(false); return; }
        const d = row as any as LyricDanceData;
        setData({ ...d, cinematic_direction: null });
        setLoading(false);

        // Phase 2: cinematic direction
        Promise.resolve(
          supabase.from("shareable_lyric_dances" as any).select(DIRECTION_COLUMNS).eq("id", d.id).maybeSingle()
        ).then(({ data: dirRow }) => {
          const dir = (dirRow as any)?.cinematic_direction ?? null;
          if (dir) setData(prev => prev ? { ...prev, cinematic_direction: dir } : prev);
        }).catch(() => {}).finally(() => {
          if (d.cinematic_direction) return;
          if (d.lyrics?.length > 0) {
            const linesForDir = (d.lyrics as any[]).filter((l: any) => l.tag !== "adlib").map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            supabase.functions.invoke("cinematic-direction", {
              body: { title: d.song_name, artist: d.artist_name, lines: linesForDir, beatGrid: d.beat_grid ? { bpm: (d.beat_grid as any).bpm } : undefined, lyricId: d.id },
            }).then(({ data: dirResult }) => {
              if (dirResult?.cinematicDirection) setData(prev => prev ? { ...prev, cinematic_direction: dirResult.cinematicDirection } : prev);
            }).catch(() => {});
          }
        });

        // Profile + comments
        const [profileResult, commentsResult] = await Promise.all([
          supabase.from("profiles").select("display_name, avatar_url").eq("id", d.user_id).maybeSingle(),
          supabase.from("lyric_dance_comments" as any).select("id, text, submitted_at").eq("dance_id", d.id).order("submitted_at", { ascending: true }).limit(100),
        ]);
        if (profileResult.data) setProfile(profileResult.data as ProfileInfo);
      });
  }, [artistSlug, songSlug]);

  // ── Player lifecycle ────────────────────────────────────────────────

  useEffect(() => {
    if (!data || !bgCanvasRef.current || !textCanvasRef.current || !containerRef.current) return;

    const player = new LyricDancePlayer(data, bgCanvasRef.current, textCanvasRef.current, containerRef.current);
    playerRef.current = player;

    (async () => {
      try {
        await player.init();
      } catch (err) {
        console.error("LyricDancePlayer init failed:", err);
      }
    })();

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [data]);

  // Update cinematic direction on late arrival
  useEffect(() => {
    if (!data?.cinematic_direction || !playerRef.current) return;
    playerRef.current.updateCinematicDirection(data.cinematic_direction);
  }, [data?.cinematic_direction]);

  // ── Mute toggle ─────────────────────────────────────────────────────

  const handleMuteToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const newMuted = !muted;
    player.setMuted(newMuted);
    setMuted(newMuted);
  }, [muted]);

  // ── Comment submit ──────────────────────────────────────────────────

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
      setHasSubmitted(true);
      setInputText("");

      // Push to player constellation
      const player = playerRef.current;
      if (player) {
        const rng = mulberry32(hashSeed(newComment.id));
        const angle = rng() * Math.PI * 2;
        const radius = rng() * 0.2;
        player.constellationNodes.push({
          id: newComment.id, text: newComment.text,
          submittedAt: Date.now(),
          seedX: 0.5 + Math.cos(angle) * radius,
          seedY: 0.5 + Math.sin(angle) * radius,
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
    }
  }, [inputText, data, hasSubmitted]);

  // Badge timer + hide Lovable widget
  useEffect(() => { const t = setTimeout(() => setBadgeVisible(true), 1000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Loading / Not Found ─────────────────────────────────────────────

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
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">tools.fm</button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 right-4 z-[70] w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/70 transition-all text-white/60 hover:text-white/90"
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      </button>

      {/* Badge */}
      <AnimatePresence>
        {badgeVisible && (
          <motion.button
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate(`/?from=lyric-dance&song=${encodeURIComponent(data.song_name)}`)}
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/10 hover:border-white/25 hover:bg-black/80 transition-all group"
          >
            <span className="text-[10px] font-mono text-white/50 group-hover:text-white/80 tracking-wider transition-colors">Fit by toolsFM</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[60vh] md:min-h-[70vh] cursor-pointer overflow-hidden"
        onClick={() => { if (!showCover) handleMuteToggle(); }}
      >
        <canvas id="bg-canvas" ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas id="text-canvas" ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Cover overlay */}
        <AnimatePresence>
          {showCover && (
            <motion.div
              initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
            >
              <div className="mb-5">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name || data.artist_name} className="w-20 h-20 rounded-full object-cover border border-white/10" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-2xl font-mono text-white/40">{(data.artist_name || "?")[0].toUpperCase()}</span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[80%] mb-1">{data.song_name}</h2>
              <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/40 mb-8">{profile?.display_name || data.artist_name}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCover(false);
                  playerRef.current?.setMuted(false);
                  playerRef.current?.play();
                  setMuted(false);
                }}
                className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
              >
                Listen Now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Identity label */}
        {!showCover && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name || data.artist_name} className="w-8 h-8 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-xs font-mono text-white/40">{(data.artist_name || "?")[0].toUpperCase()}</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white/70 leading-tight truncate max-w-[180px]">{data.song_name}</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 leading-tight">{profile?.display_name || data.artist_name}</span>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {!showCover && (
          <ProgressBar
            player={playerRef.current}
            data={data}
            onSeekStart={() => {}}
            onSeekEnd={() => {}}
            palette={data.palette}
          />
        )}
      </div>

      {/* Comment input */}
      <div className="w-full" style={{ background: "#0a0a0a" }}>
        <div className="max-w-[480px] mx-auto px-5 py-4 space-y-3">
          <AnimatePresence mode="wait">
            {hasSubmitted ? (
              <motion.p key="notified" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}
                onAnimationComplete={() => { setTimeout(() => setHasSubmitted(false), 2500); }}
                className="text-center text-sm text-white/30">FMLY Notified</motion.p>
            ) : (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative">
                <input
                  type="text" value={inputText} onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="DROP YOUR TAKE LIVE" maxLength={200}
                  className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 pr-20 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/20 pointer-events-none">Press Enter</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Debug */}
      <LiveDebugHUD player={playerRef.current} />
      <LyricDanceDebugPanel
        data={{
          songDna: {
            mood: (data.physics_spec as any)?.mood, description: (data.physics_spec as any)?.description,
            meaning: (data.physics_spec as any)?.meaning, hook: (data.physics_spec as any)?.hook,
            secondHook: (data.physics_spec as any)?.secondHook, hookLabel: (data.physics_spec as any)?.hookLabel,
            secondHookLabel: (data.physics_spec as any)?.secondHookLabel,
            hookJustification: (data.physics_spec as any)?.hookJustification,
            secondHookJustification: (data.physics_spec as any)?.secondHookJustification,
            physicsSpec: data.physics_spec as any, scene_manifest: data.scene_manifest,
          },
          beatGrid: data.beat_grid, lines: data.lyrics,
          title: data.song_name, artist: data.artist_name,
          overrides: {}, fingerprint: data.artist_dna,
        }}
      />
    </div>
  );
}
