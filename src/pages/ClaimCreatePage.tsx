import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LyricFitTab } from "@/components/lyric/LyricFitTab";
import ClaimBanner from "@/components/claim/ClaimBanner";

interface TrackMeta {
  trackId: string;
  trackTitle: string;
  artistName: string;
  albumArtUrl: string | null;
  previewUrl: string | null;
  bpm: number;
  slug: string;
  profileId: string;
}

type Phase = "search" | "loading" | "pipeline" | "done";

export default function ClaimCreatePage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("search");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<TrackMeta | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!spotifyUrl.trim()) return;
    setError(null);
    setPhase("loading");

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("create-artist-page", {
        body: { spotifyTrackUrl: spotifyUrl.trim() },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data.error) throw new Error(data.error);
      if (!data.previewUrl) throw new Error("No preview audio available for this track");

      setMeta(data as TrackMeta);

      const mp3Res = await fetch(data.previewUrl);
      if (!mp3Res.ok) throw new Error(`Failed to fetch preview audio (${mp3Res.status})`);
      const blob = await mp3Res.blob();
      const file = new File([blob], `${data.trackTitle}.mp3`, { type: "audio/mpeg" });

      setAudioFile(file);
      setPhase("pipeline");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      setPhase("search");
    }
  }, [spotifyUrl]);

  const claimMeta = useMemo(() => {
    if (!meta) return null;

    const songSlug = meta.trackTitle
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 50);

    return {
      artistSlug: meta.slug,
      songSlug,
      artistName: meta.artistName,
      songName: meta.trackTitle,
      albumArtUrl: meta.albumArtUrl,
      ghostProfileId: meta.profileId,
      spotifyTrackId: meta.trackId,
    };
  }, [meta]);

  const handleDone = useCallback(
    (danceUrl: string) => {
      setPhase("done");
      navigate(`${danceUrl}?from=claim`);
    },
    [navigate],
  );

  if (phase === "search" || phase === "loading") {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 px-6 z-50">
        <div className="text-center">
          <p className="text-white/25 text-xs uppercase tracking-widest mb-2">tools.fm</p>
          <h1 className="text-2xl font-bold text-white mb-1">Create a Lyric Dance</h1>
          <p className="text-white/40 text-sm">
            Paste a Spotify track link. We&apos;ll build the full lyric video in seconds.
          </p>
        </div>
        <div className="w-full max-w-md space-y-3">
          <input
            type="text"
            value={spotifyUrl}
            onChange={(e) => setSpotifyUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="https://open.spotify.com/track/..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
            disabled={phase === "loading"}
          />
          <button
            onClick={handleSubmit}
            disabled={phase === "loading" || !spotifyUrl.trim()}
            className="w-full py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {phase === "loading" ? "Finding track…" : "Create"}
          </button>
          {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}
        </div>
      </div>
    );
  }

  if (phase === "pipeline" && meta && audioFile) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col z-50">
        <ClaimBanner
          artistSlug={meta.slug}
          accent="#a855f7"
          coverArtUrl={meta.albumArtUrl}
          songName={meta.trackTitle}
          artistName={meta.artistName}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <LyricFitTab
            claimMeta={claimMeta}
            autoSubmitFile={audioFile}
            onClaimPublished={(danceUrl) => handleDone(danceUrl)}
          />
        </div>
      </div>
    );
  }

  return null;
}
