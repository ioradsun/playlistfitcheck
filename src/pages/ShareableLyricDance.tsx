/* cache-bust: 2026-03-04-V4 */
/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Thin React shell — all rendering is delegated to LyricDancePlayer.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { LyricDanceDebugPanel } from "@/components/lyric/LyricDanceDebugPanel";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { HotSectionPill } from "@/components/lyric/HotSectionPill";
import { LyricDancePlayer, DEFAULT_DEBUG_STATE, type LyricDanceData, type LiveDebugState } from "@/engine/LyricDancePlayer";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import type { CinematicDirection } from "@/types/CinematicDirection";

// ─── Helpers ────────────────────────────────────────────────────────

/** Reconstruct audioSections from existing cinematic direction for regeneration calls */
function extractAudioSectionsFromDirection(
  cinematicDirection: any,
  lyrics: any[],
): any[] | undefined {
  const sections = cinematicDirection?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return undefined;
  const lastLine = lyrics[lyrics.length - 1];
  const totalDur = lastLine?.end ?? lastLine?.start ?? 1;
  return sections.map((s: any, i: number) => ({
    index: s.sectionIndex ?? i,
    startSec: (s.startRatio ?? i / sections.length) * totalDur,
    endSec: (s.endRatio ?? (i + 1) / sections.length) * totalDur,
    role: s.mood ?? "verse",
    avgEnergy: 0.5,
    beatDensity: 1,
    lyrics: lyrics
      .filter((l: any) => {
        const secStart = (s.startRatio ?? i / sections.length) * totalDur;
        const secEnd = (s.endRatio ?? (i + 1) / sections.length) * totalDur;
        return (l.start ?? 0) >= secStart && (l.start ?? 0) < secEnd;
      })
      .map((l: any, li: number) => ({ text: l.text, lineIndex: li })),
  }));
}

// ─── Types ──────────────────────────────────────────────────────────

interface ProfileInfo { display_name: string | null; avatar_url: string | null; }
const DIRECTION_COLUMNS = "cinematic_direction";

// ─── Progress Bar ───────────────────────────────────────────────────

const ProgressBar = React.forwardRef<HTMLDivElement, {
  player: LyricDancePlayer | null;
  data: LyricDanceData;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  palette: string[];
}>(function ProgressBar({ player, data, onSeekStart, onSeekEnd, palette }, _ref) {
  const [progress, setProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const wasPlaying = useRef(false);
  const lastProgressRef = useRef(0);

  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    const lines = data.lyrics;
    const songStart = lines.length > 0 ? Math.max(0, lines[0].start - 0.5) : 0;
    const songEnd = lines.length > 0 ? lines[lines.length - 1].end + 1 : 0;
    const duration = songEnd - songStart;
    let rafId = 0;
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    const update = () => {
      const p = duration > 0 ? (audio.currentTime - songStart) / duration : 0;
      const clamped = Math.max(0, Math.min(1, p));
      if (Math.abs(clamped - lastProgressRef.current) > 0.005) {
        lastProgressRef.current = clamped;
        setProgress(clamped);
      }
      if (audio.paused || document.hidden) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(update);
    };

    const start = () => {
      if (!rafId && !audio.paused && !document.hidden) {
        rafId = requestAnimationFrame(update);
      }
    };

    if (!audio.paused && !document.hidden) start();

    const handlePlay = () => start();
    const handlePause = () => stop();
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
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
      className="relative w-full z-10 h-3 cursor-pointer group"
      style={{ touchAction: "none" }}
    >
      <div className="absolute inset-0 bg-white/5" />
      <div className="absolute left-0 top-0 h-full transition-none" style={{ width: `${progress * 100}%`, background: palette?.[1] ?? "#a855f7", opacity: 0.6 }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress * 100}% - 6px)` }} />
    </div>
  );
});

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
      <Section title="BEAT"><Row label="intensity" value={f(snap.beatIntensity)} /><Row label="pulse" value={f(snap.bgBeatPulse)} /><Row label="phase" value={f(snap.bgBeatPhase)} /><Row label="physGlow" value={f(snap.physGlow)} /></Section>
      <Section title="PHYSICS"><Row label="heat" value={f(snap.heat)} /><Row label="velocity" value={f(snap.velocity)} /><Row label="words" value={String(snap.wordCount)} /></Section>
      <Section title="ANIMATION"><Row label="effect" value={snap.effectKey} /><Row label="entry" value={f(snap.entryProgress)} /><Row label="exit" value={f(snap.exitProgress)} /><Row label="mod" value={snap.activeMod ?? "none"} /></Section>
      <Section title="PARTICLES"><Row label="system" value={snap.particleSystem} /><Row label="count" value={String(snap.particleCount)} /></Section>
      <Section title="DIRECTION"><Row label="section" value={`${snap.secIndex}/${snap.secTotal}`} /><Row label="line" value={String(snap.lineIndex)} /><Row label="chapter" value={snap.dirChapter} /><Row label="hero" value={snap.lineHeroWord || "—"} /><Row label="active" value={snap.activeWord} /><Row label="line style" value={snap.resolvedLineStyle} /><Row label="word style" value={snap.resolvedWordStyle} /><Row label="layout" value={snap.layoutStable ? "stable" : "unstable"} /><Row label="tension" value={snap.tensionStage} /></Section>
      <Section title="PERFORMANCE"><Row label="fps" value={String(Math.round(snap.fps))} /><Row label="total" value={snap.perfTotal.toFixed(2)} /><Row label="text" value={snap.perfText.toFixed(2)} /><Row label="bg" value={snap.perfBg.toFixed(2)} /></Section>
      <div style={{ marginTop: 6, fontSize: 9, color: "rgba(74,222,128,0.4)", textAlign: "center" as const }}>{f(snap.time, 2)}s · press D to close</div>
    </div>
  );
}

// DebugPanel removed — merged into LyricDanceDebugPanel with HUD + DATA tabs

// ─── Main Component ─────────────────────────────────────────────────

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();


  const [data, setDataRaw] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>('auto');
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
  const [reactionData, setReactionData] = useState<
    Record<string, { line: Record<number, number>; total: number }>
  >({});
  const currentTimeSecRef = useRef(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  // ── Lyric sections — derived from words + cinematic direction ────────
  const durationSec = useMemo(() => {
    const lines = data?.lyrics ?? [];
    if (!lines.length) return 0;
    return (lines[lines.length - 1] as any).end ?? 0;
  }, [data?.lyrics]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );

  const activeLine = useMemo(() => {
    if (!lyricSections.isReady) return null;
    const line = lyricSections.allLines.find(
      l => currentTimeSec >= l.startSec && currentTimeSec < l.endSec + 0.1,
    ) ?? null;
    if (!line) return null;
    const section = lyricSections.sections.find(
      s => s.lines.some(sl => sl.lineIndex === line.lineIndex),
    ) ?? null;
    return { text: line.text, lineIndex: line.lineIndex, sectionLabel: section?.label ?? null };
  }, [lyricSections, currentTimeSec]);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Player lifecycle — shared hook ───────────────────────────────────
  const { player: playerInstance, data: liveData } = useLyricDancePlayer(
    data, bgCanvasRef, textCanvasRef, containerRef, { bootMode: "minimal" },
  );
  // Sync hook's hot-patched data (auto_palettes etc.) back to local state
  useEffect(() => { if (liveData) setDataRaw(liveData); }, [liveData]);
  const playerRef = { current: playerInstance };

  // Sync theme override to player engine
  useEffect(() => {
    if (playerInstance) playerInstance.themeOverride = themeMode;
  }, [themeMode, playerInstance]);

  // ── Data fetch ──────────────────────────────────────────────────────


  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    supabase
      .from("shareable_lyric_dances" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (error || !row) { setNotFound(true); setLoading(false); return; }
        const d = row as any as LyricDanceData;
        setDataRaw({ ...d, cinematic_direction: null });
        setLoading(false);

        // ── PROFILE: fire immediately in parallel — don't wait for direction ──
        // Was inside .finally() of direction chain → avatar arrived AFTER cover
        // was already showing, causing a letter→avatar pop.
        supabase.from("profiles").select("display_name, avatar_url").eq("id", d.user_id).maybeSingle()
          .then(({ data: pData }) => { if (pData) setProfile(pData as ProfileInfo); }, () => {});

        // Phase 2: cinematic direction + section images — one async IIFE, properly caught.
        // async finally() swallows its own rejections; IIFE + terminal .catch() doesn't.
        (async () => {
          // Step 1: fast read of already-stored direction
          const { data: dirRow } = await supabase
            .from("shareable_lyric_dances" as any)
            .select(DIRECTION_COLUMNS + ",cinematic_direction,section_images")
            .eq("id", d.id)
            .maybeSingle();

          const existingDir = (dirRow as any)?.cinematic_direction;
          const existingImages = (dirRow as any)?.section_images;

          // Patch direction immediately if cached
          if (existingDir && !Array.isArray(existingDir)) {
            setDataRaw(prev => prev ? { ...prev, cinematic_direction: existingDir } : prev);
          }

          // Patch section images if complete set exists
          const imagesComplete =
            Array.isArray(existingImages) &&
            existingImages.length >= 3 &&
            existingImages.every((url: string) => !!url);
          if (imagesComplete) {
            setDataRaw(prev => prev ? { ...prev, section_images: existingImages } : prev);
          }

          // If direction is already good, only generate images if missing
          if (existingDir && !Array.isArray(existingDir) && existingDir.sections?.length > 0) {
            if (!imagesComplete) {
              supabase.functions.invoke("generate-section-images", { body: { lyric_dance_id: d.id } })
                .then(({ data: imgResult }) => {
                  const urls = imgResult?.section_images ?? imgResult?.urls;
                  if (urls) setDataRaw(prev => prev ? { ...prev, section_images: urls } : prev);
                }).catch(() => {});
            }
            return;
          }

          // No cached direction — generate fresh
          if (!d.lyrics?.length) return;
          const linesForDir = (d.lyrics as any[])
            .filter((l: any) => l.tag !== "adlib")
            .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

          const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
            body: { title: d.song_name, artist: d.artist_name, lines: linesForDir, beatGrid: d.beat_grid ? { bpm: (d.beat_grid as any).bpm } : undefined, lyricId: d.id, words: d.words ?? undefined },
          });

          if (dirResult?.cinematicDirection) {
            setDataRaw(prev => prev ? { ...prev, cinematic_direction: dirResult.cinematicDirection } : prev);
            const sections = dirResult.cinematicDirection?.sections;
            if (Array.isArray(sections) && sections.length > 0) {
              supabase.functions.invoke("generate-section-images", { body: { lyric_dance_id: d.id } })
                .then(({ data: imgResult }) => {
                  const urls = imgResult?.section_images ?? imgResult?.urls;
                  if (urls) setDataRaw(prev => prev ? { ...prev, section_images: urls } : prev);
                }).catch(() => {});
            }
          }
        })().catch(() => {});

        // Comments — fire and forget
        supabase.from("lyric_dance_comments" as any)
          .select("id, text, submitted_at").eq("dance_id", d.id)
          .order("submitted_at", { ascending: true }).limit(100)
          .then(() => {}, () => {});
      });
  }, [artistSlug, songSlug]);

  useEffect(() => {
    if (!data?.id) return;
    supabase
      .from('lyric_dance_reactions' as any)
      .select('emoji, line_index')
      .eq('dance_id', data.id)
      .then(({ data: rows }) => {
        if (!rows) return;
        const aggregated: Record<string, { line: Record<number, number>; total: number }> = {};
        for (const row of rows as any[]) {
          const { emoji, line_index } = row;
          if (!aggregated[emoji]) aggregated[emoji] = { line: {}, total: 0 };
          aggregated[emoji].total++;
          if (line_index != null) {
            aggregated[emoji].line[line_index] =
              (aggregated[emoji].line[line_index] ?? 0) + 1;
          }
        }
        setReactionData(aggregated);
      });
  }, [data?.id]);

  useEffect(() => {
    if (!data?.id) return;
    const channel = supabase
      .channel(`reactions-${data.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'lyric_dance_reactions',
        filter: `dance_id=eq.${data.id}`,
      }, (payload: any) => {
        const { emoji, line_index } = payload.new;
        setReactionData(prev => {
          const updated = { ...prev };
          if (!updated[emoji]) updated[emoji] = { line: {}, total: 0 };
          updated[emoji] = {
            ...updated[emoji],
            total: updated[emoji].total + 1,
            line: {
              ...updated[emoji].line,
              ...(line_index != null ? {
                [line_index]: (updated[emoji].line[line_index] ?? 0) + 1,
              } : {}),
            },
          };
          return updated;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [data?.id]);

  useEffect(() => {
    if (!data) return;
    console.log('[Player Data] cinematic_direction keys:', Object.keys(data.cinematic_direction ?? {}));
    console.log('[Player Data] beat_grid:', data.beat_grid ? `BPM=${data.beat_grid.bpm}` : 'null');
    console.log('[Player Data] wordDirectives count:', data.cinematic_direction?.wordDirectives?.length ?? 0);
    console.log('[Player Data] texture:', data.cinematic_direction?.texture);
  }, [data]);

  // ── Realtime comment comets ─────────────────────────────────────────
  useEffect(() => {
    if (!data?.id) return;
    const channel = supabase
      .channel(`dance-comments-${data.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lyric_dance_comments',
          filter: `dance_id=eq.${data.id}`,
        },
        (payload: any) => {
          const text = payload.new?.text;
          if (text && playerRef.current) {
            playerRef.current.fireComment(text);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.id]);

  // ── Mute toggle ─────────────────────────────────────────────────────

  const handleMuteToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const newMuted = !muted;
    player.setMuted(newMuted);
    setMuted(newMuted);
  }, [muted]);

  // ── Current time tracking for active lyric UI ───────────────────────
  useEffect(() => {
    const player = playerInstance;
    if (!player) return;
    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      const t = audio.currentTime;
      if (Math.abs(t - currentTimeSecRef.current) > 0.05) {
        currentTimeSecRef.current = t;
        setCurrentTimeSec(t);
      }
      if (!audio.paused && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(rafId); rafId = 0; };
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
      else if (!audio.paused) onPlay();
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    document.addEventListener('visibilitychange', onVis);
    if (!audio.paused) onPlay();

    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [playerInstance]);

  // Badge timer + hide Lovable widget
  useEffect(() => { const t = setTimeout(() => setBadgeVisible(true), 1000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Not Found ───────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/40 text-lg font-mono">Lyric Dance not found.</p>
        <button onClick={() => navigate("/")} className="text-white/30 text-sm hover:text-white/60 transition-colors">tools.fm</button>
      </div>
    );
  }

  // ── Derived cover state ──────────────────────────────────────────────
  // isWaitingForPlayer folds into the cover overlay — no separate skeleton component.
  // Same DOM, same layout, content slots shimmer/fill as data arrives.
  const isWaitingForPlayer = loading || !data || !data.cinematic_direction || Array.isArray(data.cinematic_direction);
  const coverSongName  = data?.song_name  ?? "";
  const coverArtist    = profile?.display_name ?? data?.artist_name ?? "";
  const coverAvatarUrl = profile?.avatar_url ?? null;
  const coverInitial   = (data?.artist_name || data?.song_name || "♪")[0].toUpperCase();

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

      {/* Main content row — canvas + lyric panel */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Canvas column */}
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0 cursor-pointer overflow-hidden"
          onClick={() => { if (!showCover) handleMuteToggle(); }}
        >
          <canvas id="bg-canvas" ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          <canvas id="text-canvas" ref={textCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Hot section incoming pill */}
          {!showCover && !isWaitingForPlayer && (
            <HotSectionPill
              sections={lyricSections.sections}
              currentTimeSec={currentTimeSec}
              reactionData={reactionData}
              allLines={lyricSections.allLines}
              palette={Array.isArray(data?.palette) ? data.palette : []}
              isVisible={!showCover && !isWaitingForPlayer}
            />
          )}

          {reactionPanelOpen && (
            <div
              className="absolute inset-0 z-[15] cursor-pointer"
              style={{ background: 'rgba(0,0,0,0.55)', transition: 'opacity 200ms ease' }}
              onClick={() => setReactionPanelOpen(false)}
            />
          )}

        {/* Cover overlay — doubles as loading skeleton.
            isWaitingForPlayer = cover IS the skeleton, same DOM, content fills in.
            showCover = player ready but user hasn't tapped yet.
            No separate loading component exists. */}
        <AnimatePresence>
          {(showCover || isWaitingForPlayer) && (
            <motion.div
              initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
            >
              {/* Avatar slot — shimmer ring while loading, real avatar/initial when ready */}
              <div className="mb-5">
                {coverAvatarUrl ? (
                  <img src={coverAvatarUrl} alt={coverArtist || coverSongName} className="w-20 h-20 rounded-full object-cover border border-white/10" />
                ) : (
                  <div className={`w-20 h-20 rounded-full border flex items-center justify-center transition-colors ${isWaitingForPlayer && !coverInitial ? "border-white/5 bg-white/[0.04] animate-pulse" : "border-white/10 bg-white/10"}`}>
                    {coverInitial && <span className="text-2xl font-mono text-white/40">{coverInitial}</span>}
                  </div>
                )}
              </div>

              {/* Song name — shimmer bar while loading */}
              {coverSongName ? (
                <h2 className="text-2xl sm:text-3xl font-bold text-white text-center leading-tight max-w-[80%] mb-1">{coverSongName}</h2>
              ) : (
                <div className="h-8 w-48 rounded bg-white/[0.07] animate-pulse mb-1" />
              )}

              {/* Artist — shimmer bar while loading */}
              {coverArtist ? (
                <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/40 mb-8">{coverArtist}</p>
              ) : (
                <div className="h-3 w-28 rounded bg-white/[0.05] animate-pulse mb-8" />
              )}

              {/* Listen Now — only shown when player is ready. Pulse dot while loading. */}
              {isWaitingForPlayer ? (
                <div className="flex items-end gap-[3px] h-4">
                  {[0.5, 0.8, 1, 0.7, 0.4].map((h, i) => (
                    <div key={i} className="w-[3px] rounded-full bg-white/20"
                      style={{ height: `${h * 100}%`, animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCover(false);
                    playerRef.current?.setMuted(false);
                    playerRef.current?.seek(0);
                    playerRef.current?.play();
                    setMuted(false);
                  }}
                  className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Listen Now
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Identity label — only when cover dismissed and data ready */}
        {!showCover && !isWaitingForPlayer && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2.5">
            {coverAvatarUrl ? (
              <img src={coverAvatarUrl} alt={coverArtist || coverSongName} className="w-8 h-8 rounded-full object-cover border border-white/10" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-xs font-mono text-white/40">{coverInitial}</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white/70 leading-tight truncate max-w-[180px]">{coverSongName}</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 leading-tight">{coverArtist}</span>
            </div>
          </div>
        )}

        {/* Export buttons removed from canvas — moved to bottom bar */}
        </div>

      </div>

      {/* Bottom action bar */}
      <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }}>

        {/* Progress bar — full width, always visible */}
        {!showCover && !isWaitingForPlayer && data && (
          <ProgressBar
            player={playerRef.current}
            data={data}
            onSeekStart={() => {}}
            onSeekEnd={() => {}}
            palette={Array.isArray(data.palette) ? data.palette : ["#ffffff", "#ffffff", "#ffffff"]}
          />
        )}

        <div className="w-full max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">

            {/* Theme toggle */}
            <button
              onClick={() => setThemeMode(prev =>
                prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto'
              )}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-white/35 hover:text-white/60 hover:border-white/20 transition-all shrink-0"
              aria-label="Toggle theme"
            >
              {themeMode === 'light' ? <Sun size={14} /> : themeMode === 'dark' ? <Moon size={14} /> : (
                <span className="text-[9px] font-mono uppercase tracking-wider opacity-50">A</span>
              )}
            </button>

            {/* Now-playing chip — current lyric line, tappable to open reaction engine */}
            <button
              className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.07] text-left overflow-hidden min-w-0 group hover:border-white/15 transition-all"
              style={{ background: "rgba(255,255,255,0.02)" }}
              onClick={() => setReactionPanelOpen(true)}
            >
              {activeLine ? (
                <>
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                    style={{ background: Array.isArray(data?.palette) ? data.palette[1] ?? '#ffffff' : '#ffffff', opacity: 0.6 }}
                  />
                  <span className="text-[11px] font-mono text-white/45 truncate group-hover:text-white/65 transition-colors">
                    {activeLine.text}
                  </span>
                </>
              ) : (
                <span className="text-[11px] font-mono text-white/20 truncate">
                  {lyricSections.isReady ? 'listening...' : '...'}
                </span>
              )}
            </button>

            {/* React button */}
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.04] transition-all shrink-0"
              onClick={() => setReactionPanelOpen(true)}
            >
              <span className="text-[11px] font-mono uppercase tracking-wider">React</span>
              <span className="text-[10px] opacity-60">↑</span>
            </button>

          </div>
        </div>
      </div>

      {/* Debug — only when data is fully loaded */}
      <LiveDebugHUD player={playerInstance} />
      {data && (
      <LyricDanceDebugPanel
        player={playerInstance}
        onRegenerateSong={() => {
          toast.info("Re-generating cinematic direction…");
          if (!data) return;
          const lyricsForDirection = (data.lyrics as any[])
            .filter((l: any) => l.tag !== "adlib")
            .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
          const existingAudioSections = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
          supabase.functions.invoke("cinematic-direction", {
            body: {
              title: data.song_name,
              artist: data.artist_name,
              lines: lyricsForDirection,
              lyricId: data.id,
              audioSections: existingAudioSections,
              words: data.words ?? undefined,
            },
          }).then(({ data: dirResult, error }) => {
            if (error) { toast.error("Cinematic direction failed"); return; }
            supabase.from("shareable_lyric_dances" as any)
              .update({ cinematic_direction: dirResult?.cinematicDirection ?? null, updated_at: new Date().toISOString() } as any)
              .eq("id", data.id)
              .then(() => {
                toast.success("Cinematic direction updated — reloading…");
                setTimeout(() => window.location.reload(), 1000);
              });
          });
        }}
        onRegenerateDance={async () => {
          if (!data) return;
          toast.info("Syncing words from saved project…");
          try {
            const { data: result, error } = await supabase.functions.invoke("sync-dance-words", {
              body: { dance_id: data.id },
            });
            if (error) throw error;
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            toast.success(`Synced ${result.count} words — reloading…`);
            setTimeout(() => window.location.reload(), 800);
          } catch (e: any) {
            console.error("[DEBUG] Dance sync error:", e);
            toast.error(e.message || "Failed to sync words");
          }
        }}
        onRegenerateDirector={async () => {
          if (!data) return;
          toast.info("Refreshing cinematic direction…");
          try {
            const lyricsForDirection = (data.lyrics as any[])
              .filter((l: any) => l.tag !== "adlib")
              .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            const existingAudioSections2 = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
            const { data: result, error } = await supabase.functions.invoke("cinematic-direction", {
              body: {
                title: data.song_name,
                artist: data.artist_name,
                lines: lyricsForDirection,
                lyricId: data.id,
                audioSections: existingAudioSections2,
                words: data.words ?? undefined,
              },
            });
            if (error) throw error;
            if (result?.cinematicDirection) {
              toast.success("Cinematic direction updated — reloading…");
              setTimeout(() => window.location.reload(), 800);
            } else {
              toast.error("No cinematic direction returned");
            }
          } catch (e: any) {
            console.error("[DEBUG] Director error:", e);
            toast.error(e.message || "Failed to generate cinematic direction");
          }
        }}
        onRunCustomPrompt={async (systemPrompt: string) => {
          if (!data) return;
          toast.info("Running cinematic-direction with custom prompt…");
          try {
            const lyricsForDirection = (data.lyrics as any[])
              .filter((l: any) => l.tag !== "adlib")
              .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));
            const existingAudioSections3 = extractAudioSectionsFromDirection(data.cinematic_direction, lyricsForDirection);
            const { data: dirResult, error } = await supabase.functions.invoke("cinematic-direction", {
              body: {
                title: data.song_name,
                artist: data.artist_name,
                lines: lyricsForDirection,
                beatGrid: data.beat_grid ? { bpm: (data.beat_grid as any).bpm } : undefined,
                lyricId: data.id,
                scene_context: data.scene_context ?? null,
                systemPromptOverride: systemPrompt,
                audioSections: existingAudioSections3,
                words: data.words ?? undefined,
              },
            });
            if (error) throw error;
            if (dirResult?.cinematicDirection) {
              toast.success("Custom prompt result received — reloading…");
              setTimeout(() => window.location.reload(), 800);
            } else {
              toast.error("No cinematic direction returned");
            }
          } catch (e: any) {
            console.error("[DEBUG] Custom prompt error:", e);
            toast.error(e.message || "Failed to run custom prompt");
          }
        }}
        data={{
          renderData: {
            cinematic_direction: data.cinematic_direction as any,
          },
          beatGrid: data.beat_grid ? { bpm: (data.beat_grid as any).bpm ?? 0, beats: (data.beat_grid as any).beats ?? [], confidence: (data.beat_grid as any).confidence ?? 0 } : null, lines: data.lyrics,
          title: data.song_name, artist: data.artist_name,
          overrides: {},  fingerprint: null,
          section_images: data.section_images,
          words: data.words,
        }}
      />
      )}
      <ReactionPanel
        isOpen={reactionPanelOpen}
        onClose={() => setReactionPanelOpen(false)}
        danceId={data?.id ?? ''}
        activeLine={activeLine}
        allLines={lyricSections.allLines}
        sections={lyricSections.sections}
        currentTimeSec={currentTimeSec}
        palette={Array.isArray(data?.palette) ? data.palette : []}
        onSeekTo={(sec) => playerInstance?.seek(sec)}
        reactionData={reactionData}
        onReactionDataChange={setReactionData}
        onReactionFired={(emoji) => {
          playerRef.current?.fireComment(emoji);
        }}
      />
    </div>
  );
}
