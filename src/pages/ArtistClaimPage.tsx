import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import SpotifyArtistInput from "@/components/SpotifyArtistInput";
import LyricVideoSection from "@/components/lyric/LyricVideoSection";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

type ClaimProfile = {
  id: string;
  display_name: string | null;
  claim_token: string | null;
};

type LyricMeta = {
  track_title: string;
  artist_name: string;
  album_art_url: string | null;
  preview_url: string | null;
  lyric_dance_url: string | null;
};

export default function ArtistClaimPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const justClaimed = (location.state as any)?.justClaimed ?? false;

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ClaimProfile | null>(null);
  const [accentColor, setAccentColor] = useState("#a855f7");
  const [lyricVideoUserId, setLyricVideoUserId] = useState<string | null>(null);
  const [lyricMeta, setLyricMeta] = useState<LyricMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!username) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const { data: p } = await (supabase as any)
        .from("ghost_artist_profiles")
        .select("id, display_name, claim_token")
        .eq("spotify_artist_slug", username)
        .eq("is_claimed", false)
        .maybeSingle();

      if (!p) {
        setProfile(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(p);
      setLyricVideoUserId(p.id);
      setNotFound(false);

      const { data: latestVideo } = await (supabase as any)
        .from("artist_lyric_videos")
        .select("track_title, artist_name, album_art_url, preview_url, lyric_dance_url")
        .eq("ghost_profile_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setLyricMeta(latestVideo ?? null);
      setLoading(false);
    })();
  }, [username]);

  const accentRgb = useMemo(() => {
    const rgb = hexToRgb(accentColor);
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }, [accentColor]);

  if (loading) {
    return <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center text-white/40">Loading…</div>;
  }

  if (notFound || !username) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 px-6 z-50">
        <div className="text-center">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-2">tools.fm</p>
          <h1 className="text-2xl font-bold text-white mb-1">Create your artist page</h1>
          <p className="text-white/40 text-sm">Paste any Spotify track to get started.</p>
        </div>
        <div className="w-full max-w-md">
          <SpotifyArtistInput onSuccess={(slug) => navigate(`/artist/${slug}/claim-page`)} />
        </div>
      </div>
    );
  }

  const albumArtUrl = lyricMeta?.album_art_url ?? null;

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] overflow-y-auto">
      {albumArtUrl && (
        <div className="absolute inset-0">
          <img
            src={albumArtUrl}
            className="w-full h-full object-cover scale-110"
            style={{ filter: "blur(2px) brightness(0.25)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom,
                rgba(${accentRgb}, 0.08) 0%,
                rgba(10,10,10,0.7) 50%,
                rgba(10,10,10,1) 100%)`,
            }}
          />
        </div>
      )}

      <div className="relative z-10 min-h-full px-5 py-6 max-w-2xl mx-auto text-white">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-white/70 hover:text-white mb-6"
        >
          <ChevronLeft size={18} /> Back
        </button>

        <div className="flex items-center gap-4 mb-6">
          {albumArtUrl ? (
            <img src={albumArtUrl} className="h-14 w-14 rounded-lg object-cover border border-white/20" />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-white/10" />
          )}
          <div>
            <p className="text-xl font-semibold">{profile?.display_name ?? lyricMeta?.artist_name ?? username}</p>
            {lyricMeta?.track_title && <p className="text-white/70 text-sm">"{lyricMeta.track_title}"</p>}
            <p className="text-white/50 text-xs">30-sec preview</p>
          </div>
        </div>

        {lyricMeta?.lyric_dance_url ? (
          <div className="rounded-xl overflow-hidden border border-white/10 aspect-[9/16] max-h-[70vh]">
            <iframe
              src={lyricMeta.lyric_dance_url}
              className="w-full h-full"
              allow="autoplay"
            />
          </div>
        ) : lyricVideoUserId ? (
          <LyricVideoSection userId={lyricVideoUserId} accentRgb={accentRgb} />
        ) : null}

        <div className="border-t border-white/10 mt-8 pt-7">
          {justClaimed ? (
            <div className="text-center space-y-4 py-8">
              <p className="text-2xl">✦</p>
              <p className="text-white font-semibold text-lg">Page claimed.</p>
              <p className="text-white/40 text-sm">
                This page is now yours.
              </p>
              <button
                onClick={() => navigate(`/artist/${username}`)}
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white border border-white/20 hover:border-white/40 transition-colors"
              >
                Go to your artist page →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Is this your music?</h2>
              <p className="text-white/55 text-sm">Create a free account to own this page.</p>
              <button
                onClick={() => navigate("/auth", {
                  state: {
                    claimSlug: username,
                    claimToken: profile?.claim_token,
                    returnTab: "CrowdFit",
                  }
                })}
                className="w-full py-3 rounded-full font-semibold text-white transition-all active:scale-95"
                style={{
                  background: `rgb(${accentRgb})`,
                  boxShadow: `0 0 20px rgba(${accentRgb}, 0.3)`,
                }}
              >
                Claim this page →
              </button>
              <p className="text-center text-xs text-white/30 mt-2">
                Create a free account to own this page
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
