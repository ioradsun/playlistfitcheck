/* cache-bust: 2026-03-04-V4 */
/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { consumeShareableDancePrefetch } from "@/lib/prefetch";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { LyricDanceProgressBar } from "@/components/lyric/LyricDanceProgressBar";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import ClaimBanner from "@/components/claim/ClaimBanner";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { SeoHead } from "@/components/SeoHead";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { emitFire, emitExposure, fetchFireData } from "@/lib/fire";
import { getSessionId } from "@/lib/sessionId";

const COVER_COLUMNS =
  "id,user_id,post_id,artist_slug,song_slug,artist_name,song_name," +
  "audio_url,section_images,palette,auto_palettes,album_art_url," +
  "empowerment_promise,beat_grid";

const HEAVY_COLUMNS =
  "id,lyrics,words,motion_profile_spec:physics_spec,cinematic_direction," +
  "scene_context,scene_manifest,system_type,seed,artist_dna";

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
  const [closingVisible, setClosingVisible] = useState(false);
  const [closingAnswered, setClosingAnswered] = useState(false);
  const [firedSections, setFiredSections] = useState<Set<number>>(new Set());
  const [totalFireCount, setTotalFireCount] = useState(0);
  const [lastFiredAt, setLastFiredAt] = useState<string | null>(null);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    const prefetched = consumeShareableDancePrefetch();
    if (prefetched) {
      prefetched.data.then(({ data: row, error }: any) => {
        if (error || !row) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setNotFound(false);
        setDataRaw(row as any as LyricDanceData);
        setLoading(false);
      });
      return;
    }

    supabase
      .from("shareable_lyric_dances" as any)
      .select(COVER_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .maybeSingle()
      .then(({ data: row, error }: any) => {
        if (error || !row) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setNotFound(false);
        setDataRaw(row as any as LyricDanceData);
        setLoading(false);

        const userId = (row as any).user_id;
        if (userId) {
          supabase
            .from("profiles")
            .select("display_name, avatar_url, is_verified")
            .eq("id", userId)
            .maybeSingle()
            .then(({ data: pData }) => {
              if (pData) setProfile(pData as ProfileInfo);
            });
        }

        supabase
          .from("shareable_lyric_dances" as any)
          .select(HEAVY_COLUMNS)
          .eq("id", (row as any).id)
          .maybeSingle()
          .then(({ data: heavy }: any) => {
            if (heavy) {
              setDataRaw((prev) => (
                prev
                  ? { ...prev, ...(heavy as any) }
                  : prev
              ));
            }
          });
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
    autoPlay: true,
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
    toggleMute,
    handleReplay,
    handleListenNow,
    handlePauseForInput,
    handleResumeAfterInput,
    isWaiting,
    commentRefreshKey,
    handleCommentFromBar,
    setCommentRefreshKey,
    lightningBarEnabled,
  } = core;

  useEffect(() => {
    if (fetchedData && fetchedData !== data) {
      setDataRaw(fetchedData);
    }
  }, [fetchedData, data]);
  const renderData = fetchedData ?? data;

  // ── Fetch historical fire data ─────────────────────────────────────
  useEffect(() => {
    const id = renderData?.id;
    if (!player || !id) return;
    let cancelled = false;
    fetchFireData(id).then((fires) => {
      if (cancelled) return;
      player.setHistoricalFires(fires);
      setTotalFireCount(fires.length);
      if (fires.length > 0) {
        const latest = fires.reduce((a, b) =>
          (a.created_at ?? "") > (b.created_at ?? "") ? a : b,
        );
        setLastFiredAt(latest.created_at ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [player, renderData?.id]);

  const openReactionPanel = useCallback(() => {
    openPanel();
  }, [openPanel]);

  useEffect(() => {
    const t = setTimeout(() => setBadgeVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!durationSec || !player) return;
    if (showCover) return; // Don't trigger while cover is up
    if (currentTimeSec > durationSec + 2.2 && !closingVisible) {
      setClosingVisible(true);
      if (player) {
        player.audio.loop = false;
        player.pause();
      }
    }
  }, [currentTimeSec, durationSec, closingVisible, player, showCover]);

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
    const currentTime = player?.audio?.currentTime ?? 0;
    const activeStart = (renderData?.lyrics as any[])?.find(
      (l: any) => l.start <= currentTime && l.end >= currentTime,
    )?.start ?? 0;
    const windowEnd = activeStart + 10;
    const linesInWindow = (lyricSections.allLines ?? []).filter(
      (l) => l.startSec >= activeStart - 1 && l.startSec <= windowEnd,
    );
    return linesInWindow.reduce((sum, l) => {
      return sum + Object.values(reactionData).reduce((s, d) => s + (d.line[l.lineIndex] ?? 0), 0);
    }, 0);
  }, [activeLine, reactionData, lyricSections.allLines, player, renderData]);

  const activeSectionIndex = useMemo(() => {
    if (!audioSections.length) return 0;
    const idx = audioSections.findIndex(
      (s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec,
    );
    return idx >= 0 ? idx : 0;
  }, [currentTimeSec, audioSections]);

  const hasFired = firedSections.has(activeSectionIndex);
  const markFired = useCallback(() => {
    setFiredSections((prev) => new Set([...prev, activeSectionIndex]));
  }, [activeSectionIndex]);

  const barAccent = useMemo(() => {
    const autoPalettes = (renderData as any)?.auto_palettes;
    if (Array.isArray(autoPalettes) && autoPalettes[activeSectionIndex]) {
      const p = autoPalettes[activeSectionIndex] as string[];
      return p[3] ?? p[1] ?? p[0] ?? "rgba(255,140,50,1)";
    }
    return palette[1] ?? palette[0] ?? "rgba(255,140,50,1)";
  }, [renderData, activeSectionIndex, palette]);

  const moments = useMemo<Moment[]>(() => {
    const phrases = (renderData as any)?.cinematic_direction?.phrases ?? [];
    const phraseInputs = phrases.map((p: any) => {
      const isMs = p.start > 500;
      return {
        start: isMs ? p.start / 1000 : p.start,
        end: isMs ? p.end / 1000 : p.end,
        text: p.text ?? "",
      };
    });
    return buildMoments(phraseInputs, audioSections, lyricSections.allLines, durationSec);
  }, [renderData, audioSections, lyricSections.allLines, durationSec]);

  const currentMoment = useMemo(() => {
    const m = moments.find(
      (mo) => currentTimeSec >= mo.startSec && currentTimeSec < mo.endSec,
    );
    if (!m) return null;
    return { index: m.index, total: moments.length, label: m.label };
  }, [moments, currentTimeSec]);

  const handleVoiceNote = useCallback(async (audioBlob: Blob) => {
    const danceId = renderData?.id;
    if (!danceId) return;

    const momentIdx = currentMoment?.index ?? null;
    const filename = `voice-${danceId}-${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("voice-notes")
      .upload(filename, audioBlob, { contentType: "audio/webm" });

    if (uploadError) {
      // eslint-disable-next-line no-console
      console.error("[VoiceNote] Upload failed:", uploadError);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("voice-notes")
      .getPublicUrl(filename);
    const audioUrl = urlData?.publicUrl ?? null;

    await (supabase
      .from("lyric_dance_comments" as any)
      .insert({
        dance_id: danceId,
        text: "🎤 voice note",
        audio_url: audioUrl,
        session_id: getSessionId(),
        line_index: activeLine?.lineIndex ?? null,
        moment_index: momentIdx,
        parent_comment_id: null,
      }) as any);

    setCommentRefreshKey((k: number) => k + 1);

    if (audioUrl) {
      supabase.functions.invoke("voice-note-transcribe", {
        body: { audio_url: audioUrl },
      }).catch(() => {});
    }
  }, [renderData, currentMoment, activeLine, setCommentRefreshKey]);

  useEffect(() => {
    return () => {
      if (holdFireIntervalRef.current) clearInterval(holdFireIntervalRef.current);
    };
  }, []);

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
            style={{ zIndex: 1 }}
          />
          <canvas
            id="text-canvas"
            ref={textCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 2 }}
          />

          <ClosingScreen
            visible={closingVisible && !reactionPanelOpen}
            empowermentPromise={empowermentPromise}
            danceId={(data as any)?.id ?? ""}
            onAnswer={() => setClosingAnswered(true)}
            onReplay={() => {
              setClosingVisible(false);
              setClosingAnswered(false);
              if (player) {
                player.audio.loop = false;
                player.seek(0);
                player.play();
              }
            }}
            source="shareable"
          />


          <AnimatePresence>
            {(showCover || isWaiting) && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0"
                style={{ zIndex: 30 }}
              >
                <LyricDanceCover
                  songName={coverSongName}
                  claimArtistName={renderData?.artist_name ?? ""}
                  claimSongName={renderData?.song_name ?? ""}
                  isMarketingCover={isMarketingView}
                  waiting={false}
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
        {!showCover && !isWaiting && renderData && !lightningBarEnabled && !closingVisible && (
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
              {...({
                variant: "fullscreen",
                onOpenReactions: openReactionPanel,
                onClose: closePanel,
                panelOpen: reactionPanelOpen,
                currentMoment,
                onFireTap: () => {
                  if (holdFireIntervalRef.current) {
                    clearInterval(holdFireIntervalRef.current);
                    holdFireIntervalRef.current = null;
                  }
                  const id = renderData?.id;
                  if (!id || !activeLine) return;
                  player?.fireFire(0);
                  emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "shareable");
                  setFireStrengthByLine((prev) => ({
                    ...prev,
                    [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + 1,
                  }));
                  setTotalFireCount((c) => c + 1);
                  setLastFiredAt(new Date().toISOString());
                  markFired();
                },
                onFireHoldStart: () => {
                  if (holdFireIntervalRef.current) return;
                  holdFireIntervalRef.current = setInterval(() => { player?.fireFire(0); }, 300);
                },
                onFireHoldEnd: (holdMs: number) => {
                  if (holdFireIntervalRef.current) {
                    clearInterval(holdFireIntervalRef.current);
                    holdFireIntervalRef.current = null;
                  }
                  const id = renderData?.id;
                  if (!id || !activeLine) return;
                  player?.fireFire(holdMs);
                  emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs, "shareable");
                  const weight = holdMs < 300 ? 1 : holdMs < 1000 ? 2 : holdMs < 3000 ? 4 : 8;
                  setFireStrengthByLine((prev) => ({
                    ...prev,
                    [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + weight,
                  }));
                  setTotalFireCount((c) => c + 1);
                  setLastFiredAt(new Date().toISOString());
                  markFired();
                },
                onComment: (text: string) => {
                  handleCommentFromBar(text, currentMoment?.index ?? null);
                },
                onVoiceNote: handleVoiceNote,
                onPauseForInput: handlePauseForInput,
                onResumeAfterInput: handleResumeAfterInput,
                activeLineFireCount,
                hookPhrase,
                activeLineText: activeLine?.text ?? null,
                accent: barAccent,
                hasFired,
                isLive: !showCover && playerReady,
                totalFireCount,
                lastFiredAt,
                songEnded: closingVisible,
                firedMomentCount: firedSections.size,
              } as any)}
            />
          </div>
        )}
      </div>

      <ReactionPanel
        displayMode="fullscreen"
        isOpen={reactionPanelOpen}
        refreshKey={commentRefreshKey}
        onClose={handlePanelClose}
        danceId={renderData?.id ?? ""}
        activeLine={activeLine}
        allLines={lyricSections.allLines}
        audioSections={audioSections}
        phrases={(data as any)?.cinematic_direction?.phrases ?? null}
        words={(data as any)?.words ?? null}
        beatGrid={(renderData as any)?.beat_grid ?? null}
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
          const id = (data ?? (fetchedData as any))?.id;
          if (!id) return;
          player?.fireFire(holdMs);
          emitFire(id, lineIndex, player?.audio.currentTime ?? 0, holdMs, "shareable");
        }}
        onLineVisible={(lineIndex) => {
          const id = (data ?? (fetchedData as any))?.id;
          if (!id) return;
          emitExposure(id, lineIndex, "shareable");
        }}
        empowermentPromise={empowermentPromise}
        fmlyHookEnabled={fmlyHookEnabled}
      />
    </div>
  );
}
