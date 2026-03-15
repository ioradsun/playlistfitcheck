import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
};

type LyricMeta = {
  track_title: string;
  artist_name: string;
  album_art_url: string | null;
  preview_url: string | null;
};

export default function ArtistClaimPage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ClaimProfile | null>(null);
  const [accentColor, setAccentColor] = useState("#a855f7");
  const [lyricVideoUserId, setLyricVideoUserId] = useState<string | null>(null);
  const [lyricMeta, setLyricMeta] = useState<LyricMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [claimEmail, setClaimEmail] = useState("");
  const [claimSending, setClaimSending] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

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
        .from("profiles")
        .select("id, display_name")
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

      const [{ data: page }, { data: latestVideo }] = await Promise.all([
        (supabase as any)
          .from("artist_pages")
          .select("accent_color")
          .eq("user_id", p.id)
          .maybeSingle(),
        (supabase as any)
          .from("artist_lyric_videos")
          .select("track_title, artist_name, album_art_url, preview_url")
          .eq("user_id", p.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setAccentColor(page?.accent_color ?? "#a855f7");
      setLyricMeta(latestVideo ?? null);
      setLoading(false);
    })();
  }, [username]);

  useEffect(() => {
    if (searchParams.get("claimed") !== "true") return;
    if (!user || !profile || !username) return;

    supabase
      .from("profiles")
      .update({ is_claimed: true })
      .eq("spotify_artist_slug", username)
      .eq("is_claimed", false)
      .then(() => {
        setJustClaimed(true);
        navigate(`/artist/${username}/claim-page`, { replace: true });
      });
  }, [searchParams, user, profile, username, navigate]);

  const accentRgb = useMemo(() => {
    const rgb = hexToRgb(accentColor);
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }, [accentColor]);

  const handleSendClaim = async () => {
    if (!claimEmail.trim() || !username) return;
    setClaimSending(true);
    const redirectTo = `${window.location.origin}/artist/${username}/claim-page?claimed=true`;
    const { error } = await supabase.auth.signInWithOtp({
      email: claimEmail.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setClaimSending(false);
    if (!error) setClaimSent(true);
  };

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
            {lyricMeta?.track_title && <p className="text-white/70 text-sm">“{lyricMeta.track_title}”</p>}
            <p className="text-white/50 text-xs">30-sec preview</p>
          </div>
        </div>

        {lyricVideoUserId && <LyricVideoSection userId={lyricVideoUserId} accentRgb={accentRgb} />}

        <div className="border-t border-white/10 mt-8 pt-7">
          {!justClaimed ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Is this your music?</h2>
              <p className="text-white/55 text-sm">Verify your email to own this page.</p>

              {!claimSent ? (
                <>
                  <input
                    type="email"
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    placeholder="artist@email.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm"
                  />
                  <button
                    onClick={handleSendClaim}
                    disabled={claimSending}
                    className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: accentColor }}
                  >
                    {claimSending ? "Sending..." : "Send magic link"}
                  </button>
                </>
              ) : (
                <p className="text-sm font-medium" style={{ color: accentColor }}>
                  ✓ Check your email for the magic link
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">✦ Page claimed</h2>
              <button
                className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: accentColor }}
                onClick={() => navigate(`/artist/${username}`)}
              >
                Head to your artist page →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
