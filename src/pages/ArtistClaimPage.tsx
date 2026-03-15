import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SpotifyArtistInput from "@/components/SpotifyArtistInput";
import LyricVideoSection from "@/components/lyric/LyricVideoSection";

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function ArtistClaimPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);
  const [fallback, setFallback] = useState<{
    profileId: string;
    accentRgb: string;
    albumArtUrl: string | null;
    artistName: string;
    trackTitle: string;
  } | null>(null);

  useEffect(() => {
    if (!username) { setNotFound(true); return; }

    (async () => {
      // Try ghost_artist_profiles first, fall back to profiles
      let profileId: string | null = null;

      const { data: ghost } = await (supabase as any)
        .from("ghost_artist_profiles")
        .select("id")
        .eq("spotify_artist_slug", username)
        .maybeSingle();

      if (ghost?.id) {
        profileId = ghost.id;
      } else {
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("spotify_artist_slug", username)
          .maybeSingle();
        profileId = prof?.id ?? null;
      }

      if (!profileId) { setNotFound(true); return; }

      // Fetch lyric video
      const { data: vid } = await (supabase as any)
        .from("artist_lyric_videos")
        .select("lyric_dance_url, album_art_url, artist_name, track_title, preview_url, synced_lyrics_lrc")
        .or(`ghost_profile_id.eq.${profileId},user_id.eq.${profileId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vid?.lyric_dance_url) {
        // Happy path: redirect to full lyric dance with claim context
        const separator = vid.lyric_dance_url.includes("?") ? "&" : "?";
        navigate(`${vid.lyric_dance_url}${separator}from=claim`, { replace: true });
        return;
      }

      // Fallback: show simple player
      const { data: page } = await (supabase as any)
        .from("artist_pages")
        .select("accent_color")
        .eq("user_id", profileId)
        .maybeSingle();

      const accent = page?.accent_color ?? "#a855f7";
      const { r, g, b } = hexToRgb(accent);
      setFallback({
        profileId,
        accentRgb: `${r}, ${g}, ${b}`,
        albumArtUrl: vid?.album_art_url ?? null,
        artistName: vid?.artist_name ?? username,
        trackTitle: vid?.track_title ?? "",
      });
    })();
  }, [username, navigate]);

  // Not found → creation screen
  if (notFound) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 px-6 z-50">
        <div className="text-center">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-2">tools.fm</p>
          <h1 className="text-2xl font-bold text-white mb-1">Your music. Your page.</h1>
          <p className="text-white/40 text-sm">
            Paste a Spotify track and we'll build it in seconds.
          </p>
        </div>
        <div className="w-full max-w-md">
          <SpotifyArtistInput onSuccess={(slug) => navigate(`/artist/${slug}/claim-page`)} />
        </div>
      </div>
    );
  }

  // Loading state while redirect happens
  if (!fallback) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center text-white/40">
        Loading…
      </div>
    );
  }

  // Fallback: no lyric dance yet — show simple player with claim CTA
  const { profileId, accentRgb, albumArtUrl, artistName, trackTitle } = fallback;
  return (
    <div className="fixed inset-0 bg-[#0a0a0a] overflow-y-auto">
      {albumArtUrl && (
        <div className="absolute inset-0">
          <img src={albumArtUrl} className="w-full h-full object-cover scale-110" style={{ filter: "blur(2px) brightness(0.25)" }} />
        </div>
      )}
      <div className="relative z-10 min-h-full flex flex-col px-5 py-6 max-w-2xl mx-auto text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {albumArtUrl && (
              <img src={albumArtUrl} className="h-10 w-10 rounded-lg object-cover border border-white/20 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{artistName}</p>
              {trackTitle && (
                <p className="text-white/50 text-xs truncate">"{trackTitle}" · 30-sec preview</p>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate("/auth", {
              state: { claimSlug: username, returnTab: "CrowdFit" }
            })}
            className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold text-white ml-4"
            style={{
              background: "linear-gradient(135deg, #a855f7, #ec4899)",
              boxShadow: "0 0 16px rgba(168,85,247,0.3)",
            }}
          >
            Claim free →
          </button>
        </div>

        {/* Simple lyric player takes remaining space */}
        <div className="flex-1 min-h-0">
          <LyricVideoSection userId={profileId} accentRgb={accentRgb} />
        </div>
      </div>
    </div>
  );
}
