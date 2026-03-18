/* cache-bust: 2026-03-04-V4 */
/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Thin React shell — all rendering is delegated to LyricDancePlayer.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";

import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { useLyricDancePlayer } from "@/hooks/useLyricDancePlayer";
import { useLyricSections } from "@/hooks/useLyricSections";
import { useReactionPanel } from "@/hooks/useReactionPanel";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { HotSectionPill } from "@/components/lyric/HotSectionPill";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import ClaimBanner from "@/components/claim/ClaimBanner";
import { useCardVote } from "@/hooks/useCardVote";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import type { PhysicsSpec } from "@/engine/PhysicsIntegrator";
import type { ArtistDNA } from "@/components/lyric/ArtistFingerprintTypes";
import type { CinematicDirection } from "@/types/CinematicDirection";

// ─── Helpers ────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────

interface ProfileInfo { display_name: string | null; avatar_url: string | null; }

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

// ─── Main Component ─────────────────────────────────────────────────

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMarketingView = searchParams.get("from") === "claim";

  const [data, setDataRaw] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [muted, setMuted] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>('auto');
  const currentTimeSecRef = useRef(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const { votedSide, score, note, setNote, handleVote, handleSubmit } = useCardVote(
    data?.post_id ?? data?.id ?? "",
    { anonymous: true },
  );

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

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Player lifecycle — shared hook ───────────────────────────────────
  const { player: playerInstance, playerReady, data: liveData } = useLyricDancePlayer(
    data, bgCanvasRef, textCanvasRef, containerRef, { bootMode: "full" },
  );
  // Sync hook's hot-patched data (auto_palettes etc.) back to local state
  useEffect(() => { if (liveData) setDataRaw(liveData); }, [liveData]);
  const playerRef = useRef<typeof playerInstance>(null);
  useEffect(() => { playerRef.current = playerInstance; }, [playerInstance]);

  const {
    reactionPanelOpen,
    setReactionPanelOpen,
    reactionData,
    setReactionData,
    activeLine,
    audioSections,
    palette,
    handlePanelClose,
  } = useReactionPanel({
    player: playerInstance,
    lyricSections,
    currentTimeSec,
    data,
    durationSec,
  });

  useEffect(() => {
    if (!playerInstance) return;
    playerInstance.setReactionData(reactionData);
  }, [playerInstance, reactionData]);

  useEffect(() => {
    if (!playerInstance) return;
    playerInstance.setEmojiStreamEnabled(!reactionPanelOpen && !showCover);
  }, [playerInstance, reactionPanelOpen, showCover]);

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
        setDataRaw(d);
        setLoading(false);

        // ── PROFILE: fire immediately in parallel — don't wait for direction ──
        // Was inside .finally() of direction chain → avatar arrived AFTER cover
        // was already showing, causing a letter→avatar pop.
        supabase.from("profiles").select("display_name, avatar_url").eq("id", d.user_id).maybeSingle()
          .then(({ data: pData }) => { if (pData) setProfile(pData as ProfileInfo); }, () => {});

        // Phase 2: generate section images or cinematic direction if missing.
        // The first query already fetched cinematic_direction and section_images,
        // so we only need to generate what's absent — no re-fetch needed.
        (async () => {
          const existingDir = d.cinematic_direction;
          const existingImages = (d as any).section_images;

          const imagesComplete =
            Array.isArray(existingImages) &&
            existingImages.length >= 3 &&
            existingImages.every((url: string) => !!url);

          // Direction exists — only generate images if missing
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

          // No direction — generate fresh
          if (!d.lyrics?.length) return;
          const linesForDir = (d.lyrics as any[])
            .filter((l: any) => l.tag !== "adlib")
            .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

          const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
            body: {
              title: d.song_name,
              artist: d.artist_name,
              lines: linesForDir,
              beatGrid: d.beat_grid ? { bpm: (d.beat_grid as any).bpm } : undefined,
              lyricId: d.id,
              words: d.words ?? undefined,
            },
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


  // ── Realtime canonical section sync (shareable_lyric_dances.cinematic_direction.sections) ──
  useEffect(() => {
    if (!data?.id) return;
    const channel = supabase
      .channel(`dance-sections-${data.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'shareable_lyric_dances',
        filter: `id=eq.${data.id}`,
      }, (payload: any) => {
        const nextDirection = payload.new?.cinematic_direction;
        if (nextDirection === undefined) return;
        setDataRaw(prev => prev ? { ...prev, cinematic_direction: nextDirection } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.id]);

  // ── Mute toggle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!playerReady || !playerInstance) return;
    playerInstance.setMuted(true);
    // Start canvas animation behind cover — audio stays silent until user taps LISTEN NOW
    playerInstance.startRendering();
  }, [playerReady, playerInstance]);

  const handleMuteToggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const newMuted = !muted;
    player.setMuted(newMuted);
    setMuted(newMuted);
  }, [muted]);

  const handleReplay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    player.setMuted(false);
    player.seek(0);
    player.play();
    setMuted(false);
  }, []);

  const handlePauseForInput = useCallback(() => {
    playerRef.current?.pause();
  }, []);

  const handleResumeAfterInput = useCallback(() => {
    playerRef.current?.play();
  }, []);

  const openReactionPanel = useCallback(() => {
    setReactionPanelOpen(true);
    if (showCover) {
      setShowCover(false);
    }
    const p = playerRef.current;
    if (p) {
      p.setMuted(false);
      p.play();
      setMuted(false);
    }
  }, [showCover, setReactionPanelOpen]);

  // ── Current time tracking for active lyric UI ───────────────────────
  useEffect(() => {
    const player = playerInstance;
    if (!player) return;
    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      const timeSec = audio.currentTime;
      if (Math.abs(timeSec - currentTimeSecRef.current) > 0.05) {
        currentTimeSecRef.current = timeSec;
        setCurrentTimeSec(timeSec);
      }
      if (!audio.paused && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!audio.paused) {
        onPlay();
      }
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
        <p className="text-white/30 text-lg font-mono">Lyric Dance not found.</p>
        <button onClick={() => navigate("/")} className="text-white/20 text-sm hover:text-white/40 transition-colors focus:outline-none">tools.fm</button>
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
      {isMarketingView && (
        <ClaimBanner
          artistSlug={artistSlug}
          accent={palette?.[1] || palette?.[0] || data?.palette?.[1] || "#a855f7"}
          coverArtUrl={(data as any)?.album_art_url ?? data?.section_images?.[0] ?? null}
          songName={data?.song_name}
          artistName={data?.artist_name}
        />
      )}


      {/* Badge */}
      <AnimatePresence>
        {badgeVisible && !isMarketingView && (
          <motion.button
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate(`/?from=lyric-dance&song=${encodeURIComponent(data.song_name)}`)}
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/[0.06] hover:border-white/15 hover:bg-black/80 transition-all group focus:outline-none"
          >
            <span className="text-[9px] font-mono text-white/30 group-hover:text-white/60 tracking-wider transition-colors">Fit by toolsFM</span>
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
          <canvas
            id="bg-canvas"
            ref={bgCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          <canvas
            id="text-canvas"
            ref={textCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Hot section incoming pill */}
          {!showCover && !isWaitingForPlayer && !isMarketingView && (
            <HotSectionPill
              sections={lyricSections.sections}
              currentTimeSec={currentTimeSec}
              reactionData={reactionData}
              allLines={lyricSections.allLines}
              palette={palette}
              isVisible={!showCover && !isWaitingForPlayer}
            />
          )}

          {reactionPanelOpen && (
            <div
              className="absolute inset-0 z-[15] cursor-pointer"
              style={{ background: 'rgba(0,0,0,0.55)', transition: 'opacity 200ms ease' }}
              onClick={(e) => {
                e.stopPropagation();
                handlePanelClose();
              }}
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
              className="absolute inset-0"
            >
              <LyricDanceCover
                songName={coverSongName}
                claimArtistName={data?.artist_name ?? ""}
                claimSongName={data?.song_name ?? ""}
                isMarketingCover={isMarketingView}
                waiting={isWaitingForPlayer}
                coverImageUrl={data?.section_images?.[0] ?? (data as any)?.album_art_url ?? null}
                hideBackground={playerReady}
                badge={coverArtist ? `In Studio · ${coverArtist}` : "In Studio"}
                onExpand={undefined}
                onListen={(e) => {
                  e.stopPropagation();
                  setShowCover(false);
                  const p = playerRef.current;
                  if (p) {
                    p.setMuted(false);
                    p.play();
                  }
                  setMuted(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Persistent top bar */}
        {!isWaitingForPlayer && !isMarketingView && (
          <div className="absolute top-0 left-0 right-0 z-[80] px-4 py-3 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              {coverAvatarUrl ? (
                <img src={coverAvatarUrl} alt={coverArtist || coverSongName} className="w-8 h-8 rounded-full object-cover border border-white/[0.06]" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="text-[11px] font-mono text-white/30">{coverInitial}</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-white/60 leading-tight truncate max-w-[180px]">{coverSongName}</span>
                <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 leading-tight">{coverArtist}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded px-1 py-0.5">
              <button onClick={(e) => { e.stopPropagation(); handleMuteToggle(); }} className="p-1 text-white/40 hover:text-white/70 transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button onClick={handleReplay} className="p-1 text-white/40 hover:text-white/70 transition-colors" aria-label="Replay">
                <RotateCcw size={14} />
              </button>
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
            palette={palette.length ? palette : ["#ffffff", "#ffffff", "#ffffff"]}
          />
        )}

        {!reactionPanelOpen && !isMarketingView && (
          <div className="w-full max-w-2xl mx-auto">
            <CardBottomBar
              variant="fullscreen"
              votedSide={votedSide}
              score={score}
              note={note}
              onNoteChange={setNote}
              onVoteYes={() => handleVote(true)}
              onVoteNo={() => handleVote(false)}
              onSubmit={handleSubmit}
              onOpenReactions={openReactionPanel}
              onClose={() => setReactionPanelOpen(false)}
              panelOpen={reactionPanelOpen}
            />
          </div>
        )}

        {/* Marketing view: reaction hint — emoji opens reaction panel */}
        {isMarketingView && (
          <div className="w-full max-w-2xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
            <span className="text-white text-[11px]">fans react on every line</span>
            <span className="text-white/40 text-[11px]">→</span>
            <button
              onClick={openReactionPanel}
              className="text-[16px] active:scale-110 transition-transform"
            >
              🔥
            </button>
          </div>
        )}
      </div>

      <ReactionPanel
        displayMode="fullscreen"
        isOpen={reactionPanelOpen}
        onClose={handlePanelClose}
        votedSide={votedSide}
        score={score}
        onVoteYes={() => handleVote(true)}
        onVoteNo={() => handleVote(false)}
        danceId={data?.id ?? ''}
        activeLine={activeLine}
        allLines={lyricSections.allLines}
        audioSections={audioSections}
        currentTimeSec={currentTimeSec}
        palette={palette}
        onSeekTo={(sec) => playerInstance?.seek(sec)}
        player={playerInstance}
        durationSec={durationSec}
        reactionData={reactionData}
        onReactionDataChange={setReactionData}
        onReactionFired={(emoji) => {
          playerRef.current?.fireComment(emoji);
        }}
        onPause={handlePauseForInput}
        onResume={handleResumeAfterInput}
      />
    </div>
  );
}
