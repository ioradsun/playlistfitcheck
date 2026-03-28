/* cache-bust: 2026-03-04-V4 */
/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { consumeShareableDancePrefetch } from "@/lib/prefetch";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { LyricDanceProgressBar } from "@/components/lyric/LyricDanceProgressBar";
import ClaimBanner from "@/components/claim/ClaimBanner";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { SeoHead } from "@/components/SeoHead";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { emitFire, emitExposure, fetchFireData } from "@/lib/fire";

interface ProfileInfo {
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{
    artistSlug: string;
    songSlug: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMarketingView = searchParams.get("from") === "claim";

  const [data, setDataRaw] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [fireStrengthByLine, setFireStrengthByLine] = useState<Record<number, number>>({});
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    const prefetched = consumeShareableDancePrefetch();
    const dataPromise = prefetched
      ? prefetched.data
      : supabase
          .from("shareable_lyric_dances" as any)
          .select(LYRIC_DANCE_COLUMNS)
          .eq("artist_slug", artistSlug)
          .eq("song_slug", songSlug)
          .maybeSingle();

    dataPromise.then(async ({ data: row, error }: any) => {
      if (error || !row) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const d = row as any as LyricDanceData;
      setNotFound(false);
      setDataRaw(d);
      setLoading(false);

      supabase
        .from("profiles")
        .select("display_name, avatar_url, is_verified")
        .eq("id", d.user_id)
        .maybeSingle()
        .then(
          ({ data: pData }) => {
            if (pData) setProfile(pData as ProfileInfo);
          },
          () => {},
        );
    });
  }, [artistSlug, songSlug]);

  // Poll for section images if missing on initial load (claim pipeline generates async)
  useEffect(() => {
    if (!data) return;
    const images = (data as any).section_images;
    if (Array.isArray(images) && images.some(Boolean)) return;

    let attempts = 0;
    const maxAttempts = 12;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        return;
      }
      const { data: fresh } = await supabase
        .from("shareable_lyric_dances" as any)
        .select("section_images")
        .eq("id", (data as any).id)
        .maybeSingle();
      const f = fresh as any;
      if (f && Array.isArray(f.section_images) && f.section_images.some(Boolean)) {
        setDataRaw((prev: LyricDanceData | null) => (
          prev
            ? { ...prev, section_images: f.section_images }
            : prev
        ));
        clearInterval(timer);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const core = useLyricDanceCore({
    lyricDanceId: data?.id ?? "",
    prefetchedData: data,
    postId: data?.post_id ?? data?.id ?? "",
    autoPlay: false,
    eagerUpgrade: true,
  });

  const {
    canvasRef,
    textCanvasRef,
    containerRef,
    player,
    playerReady,
    fetchedData,
    setFetchedData,
    muted,
    showCover,
    currentTimeSec,
    reactionPanelOpen,
    openPanel,
    closePanel,
    handlePanelClose,
    reactionData,
    setReactionData,
    durationSec,
    lyricSections,
    audioSections,
    activeLine,
    palette,
    votedSide,
    score,
    note,
    setNote,
    handleVote,
    toggleMute,
    handleReplay,
    handleListenNow,
    handlePauseForInput,
    handleResumeAfterInput,
    handleCommentFromBar,
    isWaiting,
    commentRefreshKey,
    lightningBarEnabled,
  } = core;

  useEffect(() => {
    if (fetchedData && fetchedData !== data) {
      setDataRaw(fetchedData);
    }
  }, [fetchedData, data]);

  useEffect(() => {
    const id = (data as any)?.id;
    if (!player || !id) return;
    fetchFireData(id).then((fires) => {
      player.setHistoricalFires(fires);
    });
  }, [player, (data as any)?.id]);

  const openReactionPanel = useCallback(() => {
    openPanel();
  }, [openPanel]);

  useEffect(() => {
    const t = setTimeout(() => setBadgeVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  if (notFound) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/30 text-lg font-mono">
          Lyric Dance not found.
        </p>
        <button
          onClick={() => navigate("/")}
          className="text-white/20 text-sm hover:text-white/40 transition-colors focus:outline-none"
        >
          tools.fm
        </button>
      </div>
    );
  }

  const renderData = fetchedData ?? data;
  const siteCopy = useSiteCopy();
  const fmlyHookEnabled = siteCopy.features?.fmly_hook === true;
  const empowermentPromise = (renderData as any)?.empowerment_promise ?? null;
  const coverSongName = renderData?.song_name ?? "";
  const coverArtist = profile?.display_name ?? renderData?.artist_name ?? "";
  const coverAvatarUrl = profile?.avatar_url ?? null;
  const coverInitial = (renderData?.artist_name ||
    renderData?.song_name ||
    "♪")[0].toUpperCase();
  const ogImage = renderData?.section_images?.find((u: string | null) => !!u)
    ?? (renderData as any)?.album_art_url
    ?? "https://tools.fm/og/homepage.png";
  const ogTitle = isMarketingView
    ? `${coverArtist} — watch "${coverSongName.toUpperCase()}" come alive`
    : coverSongName
      ? `"${coverSongName.toUpperCase()}" — ${coverArtist}`
      : "Lyric Dance — tools.fm";
  const ogDescription = isMarketingView
    ? "Your song. One click. AI lyric video. Claim your free artist page on tools.fm"
    : "Interactive lyric video on tools.fm · Run it back or skip";
  const hookPhrase = (renderData as any)?.hook_phrase ?? null;
  const activeLineFireCount = useMemo(() => {
    if (!activeLine) return 0;
    return fireStrengthByLine[activeLine.lineIndex] ?? 0;
  }, [activeLine, fireStrengthByLine]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#0a0a0a" }}
    >
      <SeoHead
        title={ogTitle}
        description={ogDescription}
        canonical={`https://tools.fm${location.pathname}${location.search}`}
        ogTitle={ogTitle}
        ogDescription={ogDescription}
        ogImage={ogImage}
      />
      {isMarketingView && (
        <ClaimBanner
          artistSlug={artistSlug}
          accent={
            palette?.[1] ||
            palette?.[0] ||
            renderData?.palette?.[1] ||
            "#a855f7"
          }
          coverArtUrl={
            (renderData as any)?.album_art_url ??
            renderData?.section_images?.[0] ??
            null
          }
          songName={renderData?.song_name}
          artistName={renderData?.artist_name}
        />
      )}

      <AnimatePresence>
        {badgeVisible && !isMarketingView && !isMobile && renderData && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() =>
              navigate(
                `/?from=lyric-dance&song=${encodeURIComponent(renderData.song_name)}`,
              )
            }
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/[0.06] hover:border-white/15 hover:bg-black/80 transition-all group focus:outline-none"
          >
            <span className="text-[9px] font-mono text-white/30 group-hover:text-white/60 tracking-wider transition-colors">
              Fit by toolsFM
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0 cursor-pointer overflow-hidden"
          onClick={() => {
            if (!showCover) toggleMute();
          }}
        >
          <canvas
            id="bg-canvas"
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          <canvas
            id="text-canvas"
            ref={textCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />


          <AnimatePresence>
            {(showCover || isWaiting) && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <LyricDanceCover
                  songName={coverSongName}
                  claimArtistName={renderData?.artist_name ?? ""}
                  claimSongName={renderData?.song_name ?? ""}
                  isMarketingCover={isMarketingView}
                  waiting={loading || !renderData?.cinematic_direction}
                  coverImageUrl={
                    renderData?.section_images?.[0] ??
                    (renderData as any)?.album_art_url ??
                    null
                  }
                  hideBackground={playerReady}
                  badge={null}
                  onExpand={undefined}
                  onListen={handleListenNow}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {(
            <div
              className="absolute top-0 left-0 right-0 z-[80] px-4 py-3 flex items-center justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              {!isMarketingView ? (
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => renderData?.user_id && navigate(`/u/${renderData.user_id}`)}
                >
                  <div className="relative shrink-0">
                    {coverAvatarUrl ? (
                      <img src={coverAvatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/[0.06]" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <span className="text-[11px] font-mono text-white/30">{coverInitial}</span>
                      </div>
                    )}
                    {profile?.is_verified && (
                      <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge size={10} /></span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400">
                    {coverArtist ? `In Studio · ${coverArtist}` : "In Studio"}
                  </span>
                </div>
              ) : <span />}
              <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded px-1 py-0.5">
                <button
                  onClick={toggleMute}
                  className="p-1 text-white/40 hover:text-white/70 transition-colors"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                  onClick={handleReplay}
                  className="p-1 text-white/40 hover:text-white/70 transition-colors"
                  aria-label="Replay"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="w-full flex-shrink-0"
        style={{
          background: "#0a0a0a",
          ...(isMobile ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : {}),
        }}
      >
        {!showCover && !isWaiting && renderData && !lightningBarEnabled && (
          <LyricDanceProgressBar
            player={player}
            data={renderData}
            onSeekStart={() => {}}
            onSeekEnd={() => {}}
            palette={
              palette.length ? palette : ["#ffffff", "#ffffff", "#ffffff"]
            }
          />
        )}

        {!reactionPanelOpen && (
          <div className="w-full max-w-2xl mx-auto">
            <CardBottomBar
              variant="fullscreen"
              votedSide={votedSide}
              score={score}
              note={note}
              onNoteChange={setNote}
              onVoteYes={() => handleVote(true)}
              onVoteNo={() => handleVote(false)}
              onSubmit={handleCommentFromBar}
              onOpenReactions={openReactionPanel}
              onClose={closePanel}
              panelOpen={reactionPanelOpen}
              onFireTap={() => {
                const id = (data as any)?.id;
                if (!id || !activeLine) return;
                player?.fireFire(0);
                emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0);
                setFireStrengthByLine((prev) => ({
                  ...prev,
                  [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + 1,
                }));
              }}
              onFireHoldStart={() => {
                /* nothing — visual handled by FireButton */
              }}
              onFireHoldEnd={(holdMs) => {
                const id = (data as any)?.id;
                if (!id || !activeLine) return;
                player?.fireFire(holdMs);
                emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs);
                const weight = holdMs < 300 ? 1 : holdMs < 1000 ? 2 : holdMs < 3000 ? 4 : 8;
                setFireStrengthByLine((prev) => ({
                  ...prev,
                  [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + weight,
                }));
              }}
              activeLineFireCount={activeLineFireCount}
              hookPhrase={hookPhrase}
              activeLineText={activeLine?.text ?? null}
            />
          </div>
        )}
      </div>

      <ReactionPanel
        displayMode="fullscreen"
        isOpen={reactionPanelOpen}
        refreshKey={commentRefreshKey}
        onClose={handlePanelClose}
        votedSide={votedSide}
        score={score}
        onVoteYes={() => handleVote(true)}
        onVoteNo={() => handleVote(false)}
        danceId={renderData?.id ?? ""}
        activeLine={activeLine}
        allLines={lyricSections.allLines}
        audioSections={audioSections}
        currentTimeSec={currentTimeSec}
        palette={palette}
        onSeekTo={(sec) => player?.seek(sec)}
        player={player}
        durationSec={durationSec}
        reactionData={reactionData}
        onReactionDataChange={setReactionData}
        onReactionFired={(emoji) => {
          player?.fireComment(emoji);
        }}
        onPause={handlePauseForInput}
        onResume={handleResumeAfterInput}
        onFireLine={(lineIndex, holdMs) => {
          const id = (data ?? (prefetchedData as any))?.id;
          if (!id) return;
          player?.fireFire(holdMs);
          emitFire(id, lineIndex, player?.audio.currentTime ?? 0, holdMs);
        }}
        onLineVisible={(lineIndex) => {
          const id = (data ?? (prefetchedData as any))?.id;
          if (!id) return;
          emitExposure(id, lineIndex);
        }}
        empowermentPromise={empowermentPromise}
        fmlyHookEnabled={fmlyHookEnabled}
      />
    </div>
  );
}
