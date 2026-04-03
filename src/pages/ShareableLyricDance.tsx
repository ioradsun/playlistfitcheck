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
import { toast } from "sonner";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { consumeShareableDancePrefetch, readCachedDanceData } from "@/lib/prefetch";
import { useLyricDanceCore } from "@/hooks/useLyricDanceCore";
import { LyricDanceCover } from "@/components/lyric/LyricDanceCover";
import { ClosingScreen } from "@/components/lyric/ClosingScreen";
import ClaimBanner from "@/components/claim/ClaimBanner";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { SeoHead } from "@/components/SeoHead";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import { emitFire, fetchFireData } from "@/lib/fire";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import { LyricInteractionLayer } from "@/components/lyric/LyricInteractionLayer";
import { deriveMomentFireCounts } from "@/lib/momentUtils";

function deriveSectionColors(cd: any | null | undefined): Record<number, string> {
  const colors: Record<number, string> = {};
  const sections = cd?.sections;
  if (!Array.isArray(sections)) return colors;
  for (const s of sections) {
    if (typeof s.sectionIndex === "number" && typeof s.dominantColor === "string") {
      colors[s.sectionIndex] = s.dominantColor;
    }
  }
  return colors;
}

const ALL_COLUMNS =
  "id,user_id,post_id,artist_slug,song_slug,artist_name,song_name," +
  "audio_url,section_images,palette,auto_palettes,album_art_url," +
  "empowerment_promise,beat_grid," +
  "lyrics,words,motion_profile_spec:physics_spec,cinematic_direction," +
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
  const [localEmpowerment, setLocalEmpowerment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [fireStrengthByLine, setFireStrengthByLine] = useState<Record<number, number>>({});
  const [closingVisible, setClosingVisible] = useState(false);
  const [closingAnswered, setClosingAnswered] = useState(false);
  const [firedMoments, setFiredMoments] = useState<Set<number>>(new Set());
  const [totalFireCount, setTotalFireCount] = useState(0);
  const holdFireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const empowermentGenStarted = useRef(false);
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
      .select(ALL_COLUMNS)
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
          const loadProfile = () => {
            supabase
              .from("profiles")
              .select("display_name, avatar_url, is_verified")
              .eq("id", userId)
              .maybeSingle()
              .then(({ data: pData }) => {
                if (pData) setProfile(pData as ProfileInfo);
              });
          };

          if ("requestIdleCallback" in window) {
            requestIdleCallback(loadProfile);
          } else {
            setTimeout(loadProfile, 1000);
          }
        }
      });
  }, [artistSlug, songSlug]);

  // Poll for section images if missing on initial load (claim pipeline generates async)
  useEffect(() => {
    if (!data) return;
    const images = (data as any).section_images;
    if (Array.isArray(images) && images.some(Boolean)) return;

    const cached = artistSlug && songSlug
      ? readCachedDanceData(artistSlug, songSlug)
      : null;
    if (cached && (!Array.isArray(images) || !images.length)) return;

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
    reactionData,
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
  } = core;

  const renderData = fetchedData ?? data;

  useEffect(() => {
    if (!isMarketingView || !playerReady) return;
    handleListenNow();
  }, [isMarketingView, playerReady, handleListenNow]);

  useEffect(() => {
    if (!isMarketingView) return;
    if (!renderData?.id) return;
    if (localEmpowerment ?? (renderData as any)?.empowerment_promise) return;
    if (empowermentGenStarted.current) return;

    const lines = Array.isArray((renderData as any)?.lyrics)
      ? ((renderData as any).lyrics as any[])
      : [];
    if (!lines.length) return;

    const lyricsText = lines
      .filter((line: any) => line?.tag !== "adlib")
      .map((line: any) => String(line?.text ?? "").trim())
      .filter(Boolean)
      .join("\n");

    if (!lyricsText) return;

    const cinematicDirection = (renderData as any)?.cinematic_direction ?? null;
    empowermentGenStarted.current = true;

    invokeWithTimeout(
      "empowerment-promise",
      {
        songTitle: renderData?.song_name || "Untitled",
        lyricsText,
        emotionalArc: cinematicDirection?.emotionalArc ?? null,
        sceneTone: cinematicDirection?.sceneTone ?? null,
        chorusText: cinematicDirection?.chorusText ?? null,
        meaning: null,
      },
      30_000,
    )
      .then(async ({ data: generated, error }) => {
        if (error || !generated) return;
        setLocalEmpowerment(generated);
        await supabase
          .from("shareable_lyric_dances" as any)
          .update({ empowerment_promise: generated })
          .eq("id", renderData.id);
      })
      .catch(() => {});
  }, [isMarketingView, renderData, localEmpowerment]);

  useEffect(() => {
    if (!player) return;
    player.setCoverMode(showCover);
  }, [player, showCover]);

  // ── Fetch historical fire data ─────────────────────────────────────
  useEffect(() => {
    const id = renderData?.id;
    if (!player || !id) return;
    let cancelled = false;
    fetchFireData(id).then((fires) => {
      if (cancelled || !fires.length) return;
      player.setHistoricalFires(fires);
      setTotalFireCount(fires.length);
      if (fires.length > 0) {
        const latest = fires.reduce((a, b) =>
          (a.created_at ?? "") > (b.created_at ?? "") ? a : b,
        );
        // lastFiredAt tracked internally
      }
    });
    return () => { cancelled = true; };
  }, [player, renderData?.id]);


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

  const empowermentPromise = localEmpowerment ?? (renderData as any)?.empowerment_promise ?? null;
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
  const activeSectionIndex = useMemo(() => {
    if (!audioSections.length) return 0;
    const idx = audioSections.findIndex(
      (s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec,
    );
    return idx >= 0 ? idx : 0;
  }, [currentTimeSec, audioSections]);

  

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
    // Join all lines in this moment into one continuous string for the ticker
    const fullText = m.lines.map((l) => l.text).join("  ·  ");
    return {
      index: m.index,
      total: moments.length,
      label: m.label,
      text: fullText,
      startSec: m.startSec,
      endSec: m.endSec,
    };
  }, [moments, currentTimeSec]);

  const hasFired = firedMoments.has(currentMoment?.index ?? -1);
  const markFired = useCallback(() => {
    if (currentMoment?.index == null) return;
    setFiredMoments((prev) => new Set([...prev, currentMoment.index]));
  }, [currentMoment?.index]);

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
            visible={closingVisible}
            empowermentPromise={empowermentPromise}
            danceId={renderData?.id ?? ""}
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
            moments={moments}
            momentFireCounts={deriveMomentFireCounts(reactionData, moments)}
            onSeekToMoment={(idx) => {
              const m = moments[idx];
              if (m) player?.seek(m.startSec);
            }}
            onShareClip={(momentIdx, caption) => {
              void momentIdx;
              void navigator.clipboard.writeText(caption);
              toast.success("Caption copied — clip export coming soon");
            }}
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
        <div className="w-full max-w-2xl mx-auto">
          <LyricInteractionLayer
            variant="fullscreen"
            danceId={renderData?.id ?? ""}
            moments={moments}
            currentTimeSec={currentTimeSec}
            durationSec={durationSec}
            palette={palette}
            accent={barAccent}
            reactionData={reactionData}
            refreshKey={commentRefreshKey}
            isLive={!showCover && playerReady}
            hasFired={hasFired}
            totalFireCount={totalFireCount}
            songEnded={closingVisible}
            player={player}
            sectionColors={deriveSectionColors((renderData as any)?.cinematic_direction ?? null)}
            onFireTap={() => {
              const id = renderData?.id;
              if (!id || !activeLine) return;
              player?.fireFire(0);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, 0, "shareable");
              setFireStrengthByLine((prev) => ({ ...prev, [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + 1 }));
              setTotalFireCount((c) => c + 1);
              markFired();
            }}
            onFireHoldStart={() => {
              if (holdFireIntervalRef.current) return;
              holdFireIntervalRef.current = setInterval(() => { player?.fireFire(0); }, 300);
            }}
            onFireHoldEnd={(holdMs) => {
              if (holdFireIntervalRef.current) { clearInterval(holdFireIntervalRef.current); holdFireIntervalRef.current = null; }
              const id = renderData?.id;
              if (!id || !activeLine) return;
              player?.fireFire(holdMs);
              emitFire(id, activeLine.lineIndex, player?.audio.currentTime ?? 0, holdMs, "shareable");
              const weight = holdMs < 300 ? 1 : holdMs < 1000 ? 2 : holdMs < 3000 ? 4 : 8;
              setFireStrengthByLine((prev) => ({ ...prev, [activeLine.lineIndex]: (prev[activeLine.lineIndex] ?? 0) + weight }));
              setTotalFireCount((c) => c + 1);
              markFired();
            }}
            onPause={handlePauseForInput}
            onResume={handleResumeAfterInput}
            onSeekTo={(sec) => player?.seek(sec)}
            source="shareable"
          />
        </div>
      </div>
    </div>
  );
}
