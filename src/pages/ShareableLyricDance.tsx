/* cache-bust: 2026-04-03-V5 */
/**
 * ShareableLyricDance — Public page for a full-song lyric dance.
 * Route: /:artistSlug/:songSlug/lyric-dance
 *
 * Page concerns: data fetch by slug, SEO, claim banner, empowerment.
 * Player: delegated entirely to LyricDanceEmbed (the ONE player).
 */
import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { consumeShareableDancePrefetch, readCachedDanceData } from "@/lib/prefetch";
import ClaimBanner from "@/components/claim/ClaimBanner";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { SeoHead } from "@/components/SeoHead";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";

interface ProfileInfo {
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export default function ShareableLyricDance() {
  const { artistSlug, songSlug } = useParams<{ artistSlug: string; songSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMarketingView = searchParams.get("from") === "claim";

  const [data, setData] = useState<LyricDanceData | null>(null);
  const [localEmpowerment, setLocalEmpowerment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const empowermentGenStarted = useRef(false);
  const isMobile = useIsMobile();

  // ── Data fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!artistSlug || !songSlug) return;
    setLoading(true);

    const fetchProfile = (userId: string) => {
      const loadProfile = () => {
        supabase.from("profiles")
          .select("display_name, avatar_url, is_verified")
          .eq("id", userId).maybeSingle()
          .then(({ data: p }) => { if (p) setProfile(p as ProfileInfo); });
      };
      if ("requestIdleCallback" in window) requestIdleCallback(loadProfile);
      else setTimeout(loadProfile, 1000);
    };

    const prefetched = consumeShareableDancePrefetch();
    if (prefetched) {
      prefetched.data.then(({ data: row, error }: any) => {
        if (error || !row) { setNotFound(true); setLoading(false); return; }
        setNotFound(false);
        setData({
          ...row,
          cinematic_direction: row.cinematic_direction
            ? normalizeCinematicDirection(row.cinematic_direction)
            : row.cinematic_direction,
        } as LyricDanceData);
        if (row.user_id) fetchProfile(row.user_id);
        setLoading(false);
      });
      return;
    }

    const cached = readCachedDanceData(artistSlug, songSlug);
    if (cached) {
      setNotFound(false);
      setData({
        ...cached,
        cinematic_direction: cached.cinematic_direction
          ? normalizeCinematicDirection(cached.cinematic_direction)
          : cached.cinematic_direction,
      } as LyricDanceData);
      if (cached.user_id) fetchProfile(cached.user_id);
      setLoading(false);
      return;
    }

    supabase
      .from("lyric_projects" as any)
      .select(LYRIC_DANCE_COLUMNS)
      .eq("artist_slug", artistSlug)
      .eq("url_slug", songSlug)
      .maybeSingle()
      .then(({ data: row, error }: any) => {
        if (error || !row) { setNotFound(true); setLoading(false); return; }
        setNotFound(false);
        setData({
          ...row,
          cinematic_direction: row.cinematic_direction
            ? normalizeCinematicDirection(row.cinematic_direction)
            : row.cinematic_direction,
        } as LyricDanceData);
        setLoading(false);

        if (row.user_id) fetchProfile(row.user_id);
      });
  }, [artistSlug, songSlug]);

  // ── Poll for section images (claim pipeline generates async) ───────────
  useEffect(() => {
    if (!data) return;
    const images = data.section_images;
    if (Array.isArray(images) && images.some(Boolean)) return;
    const cached = artistSlug && songSlug ? readCachedDanceData(artistSlug, songSlug) : null;
    if (cached && (!Array.isArray(images) || !images.length)) return;

    let attempts = 0;
    const timer = setInterval(async () => {
      if (++attempts > 12) { clearInterval(timer); return; }
      const { data: fresh } = await supabase
        .from("lyric_projects" as any).select("section_images")
        .eq("id", data.id).maybeSingle();
      const f = fresh as any;
      if (f?.section_images?.some?.(Boolean)) {
        setData((prev) => prev ? { ...prev, section_images: f.section_images } : prev);
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empowerment promise (marketing pages) ──────────────────────────────
  useEffect(() => {
    if (!isMarketingView || !data?.id) return;
    if (localEmpowerment ?? (data as any)?.empowerment_promise) return;
    if (empowermentGenStarted.current) return;
    const lines = Array.isArray(data?.lines) ? (data.lines as any[]) : [];
    if (!lines.length) return;
    const linesText = lines.filter((l: any) => l?.tag !== "adlib")
      .map((l: any) => String(l?.text ?? "").trim()).filter(Boolean).join("\n");
    if (!linesText) return;
    const cd = data?.cinematic_direction as any;
    empowermentGenStarted.current = true;
    invokeWithTimeout("empowerment-promise", {
      songTitle: data.title || "Untitled", linesText,
      emotionalArc: cd?.emotionalArc ?? null, sceneTone: cd?.sceneTone ?? null,
      chorusText: cd?.chorusText ?? null, meaning: null,
    }, 30_000).then(async ({ data: gen, error }) => {
      if (error || !gen) return;
      setLocalEmpowerment(gen);
      await supabase.from("lyric_projects" as any)
        .update({ empowerment_promise: gen }).eq("id", data.id);
    }).catch(() => {});
  }, [isMarketingView, data, localEmpowerment]);

  // ── Lovable hide ───────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "hide-lovable-badge-ld";
    style.textContent = `[data-lovable-badge], .lovable-badge, iframe[src*="lovable"] { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // ── Not found ──────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 z-50">
        <p className="text-white/30 text-lg font-mono">Lyric Dance not found.</p>
        <button onClick={() => navigate("/")}
          className="text-white/20 text-sm hover:text-white/40 transition-colors focus:outline-none">
          tools.fm
        </button>
      </div>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const coverSongName = data?.title ?? "";
  const coverArtist = profile?.display_name ?? data?.artist_name ?? "";
  const coverAvatarUrl = profile?.avatar_url ?? null;
  const palette = useMemo(() => {
    const cd = data?.cinematic_direction;
    if (cd?.sections && Array.isArray(cd.sections))
      return cd.sections.map((s: any) => s.dominantColor ?? "#6B7A8E");
    return ["#ffffff"];
  }, [data]);
  const ogImage = data?.section_images?.find((u: string | null) => !!u)
    ?? (data as any)?.album_art_url ?? "https://tools.fm/og/homepage.png";
  const ogTitle = isMarketingView
    ? `${coverArtist} — watch "${coverSongName.toUpperCase()}" come alive`
    : coverSongName ? `"${coverSongName.toUpperCase()}" — ${coverArtist}` : "Lyric Dance — tools.fm";
  const ogDescription = isMarketingView
    ? "Your song. One click. AI lyric video. Claim your free artist page on tools.fm"
    : "Interactive lyric video on tools.fm · Run it back or skip";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      <SeoHead
        title={ogTitle} description={ogDescription}
        canonical={`https://tools.fm${location.pathname}${location.search}`}
        ogTitle={ogTitle} ogDescription={ogDescription} ogImage={ogImage}
      />

      {isMarketingView && (
        <ClaimBanner
          artistSlug={artistSlug}
          accent={palette?.[1] || palette?.[0] || data?.palette?.[1] || "#a855f7"}
          coverArtUrl={(data as any)?.album_art_url ?? data?.section_images?.[0] ?? null}
          songName={data?.title} artistName={data?.artist_name}
        />
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {data && (
          <LyricDanceEmbed
            lyricDanceId={data.id}
            songTitle={coverSongName || "Untitled"}
            artistName={coverArtist || undefined}
            prefetchedData={data}
            spotifyTrackId={(data as any)?.spotify_track_id ?? null}
            avatarUrl={coverAvatarUrl}
            isVerified={profile?.is_verified ?? false}
            userId={(data as any)?.user_id ?? null}
            postId={data.post_id ?? data.id}
            lyricDanceUrl={artistSlug && songSlug ? `/${artistSlug}/${songSlug}/lyric-dance` : null}
          />
        )}
      </div>

      {isMobile && <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />}
    </div>
  );
}
