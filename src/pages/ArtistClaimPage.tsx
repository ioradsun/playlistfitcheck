import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ClaimBanner from "@/components/claim/ClaimBanner";

type GhostProfileRow = {
  id: string;
  display_name: string;
  spotify_artist_slug: string;
};

type ArtistLyricVideoRow = {
  lyric_dance_id?: string | null;
  track_title: string;
  artist_name: string;
  album_art_url: string | null;
  lyric_dance_url: string | null;
  created_at: string;
};

type ClaimDanceRow = {
  id: string;
  title: string;
  album_art_url: string | null;
  section_images: string[] | null;
  created_at: string;
};

export default function ArtistClaimPage() {
  const { username } = useParams<{ username: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<GhostProfileRow | null>(null);
  const [latestVideo, setLatestVideo] = useState<ArtistLyricVideoRow | null>(null);
  const [latestDance, setLatestDance] = useState<ClaimDanceRow | null>(null);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (!username) {
        if (active) setLoading(false);
        return;
      }

      const { data: ghostProfile } = await (supabase as any)
        .from("ghost_artist_profiles")
        .select("id, display_name, spotify_artist_slug")
        .eq("spotify_artist_slug", username)
        .maybeSingle();

      if (!active) return;
      setProfile((ghostProfile as GhostProfileRow | null) ?? null);

      if (!ghostProfile?.id) {
        setLatestVideo(null);
        setLatestDance(null);
        setLoading(false);
        return;
      }

      const [{ data: video }, { data: dance }] = await Promise.all([
        (supabase as any)
          .from("artist_lyric_videos")
          .select("track_title, artist_name, album_art_url, lyric_dance_url, lyric_dance_id, created_at")
          .eq("ghost_profile_id", ghostProfile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("lyric_projects" as any)
          .select("id, title, album_art_url, section_images, created_at")
          .eq("artist_slug", username)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) return;
      setLatestVideo((video as ArtistLyricVideoRow | null) ?? null);
      setLatestDance((dance as ClaimDanceRow | null) ?? null);

      const hasReadyDance = !!(dance?.id && Array.isArray(dance.section_images) && dance.section_images.length > 0);
      const hasPublishedVideo = !!video?.lyric_dance_url;

      setLoading(false);

      if (!hasReadyDance && !hasPublishedVideo) {
        pollTimer = setTimeout(() => {
          if (active) void load();
        }, 5000);
      }
    }

    void load();
    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [username]);

  const readyDanceUrl = useMemo(() => {
    if (latestVideo?.lyric_dance_url) return latestVideo.lyric_dance_url;
    if (!username || !latestDance?.id) return null;
    const sectionImages = latestDance.section_images;
    if (!Array.isArray(sectionImages) || sectionImages.length === 0) return null;
    return `/${username}/${slugifySong(latestDance.title)}/lyric-dance`;
  }, [latestDance?.id, latestDance?.section_images, latestDance?.title, latestVideo?.lyric_dance_url, username]);

  const artistName = useMemo(
    () => latestVideo?.artist_name ?? profile?.display_name ?? username?.toUpperCase() ?? "Artist",
    [latestVideo?.artist_name, profile?.display_name, username],
  );

  const coverArtUrl = latestVideo?.album_art_url ?? latestDance?.album_art_url ?? null;
  const displaySongName = latestVideo?.track_title ?? latestDance?.title ?? undefined;

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ClaimBanner
        artistSlug={profile?.spotify_artist_slug ?? username}
        coverArtUrl={coverArtUrl}
        songName={displaySongName}
        artistName={artistName}
      />

      <main className="mx-auto flex min-h-[calc(100vh-52px)] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Music2 className="h-6 w-6" />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-card-foreground">
            {artistName}
          </h1>

          <p className="mt-3 text-sm text-muted-foreground">
            {readyDanceUrl
              ? `Latest lyric dance: ${displaySongName || "Untitled"}`
              : "This artist page is ready, but the lyric dance is still being generated."}
          </p>

          {readyDanceUrl ? (
            <div className="mt-6 flex justify-center">
              <Link
                to={`${readyDanceUrl}?from=claim`}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open lyric dance
              </Link>
            </div>
          ) : (
            <p className="mt-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Generating preview experience…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function slugifySong(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);
}