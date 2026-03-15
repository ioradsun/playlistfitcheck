import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Stage = "idle" | "loading" | "error";

const STATUS_MESSAGES = [
  "Fetching track info…",
  "Setting up your page…",
  "Syncing lyrics…",
];

export default function SpotifyArtistInput({ onSuccess }: { onSuccess: (slug: string) => void }) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (stage !== "loading") {
      setStatusIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [stage]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setStage("loading");

    const { data, error } = await supabase.functions.invoke("create-artist-page", {
      body: { spotifyUrl: url.trim() },
    });

    if (error) {
      setStage("error");
      setError("Could not create artist page. Try another Spotify link.");
      return;
    }

    if (data?.alreadyClaimed) {
      setStage("error");
      setError("This artist page has already been claimed.");
      return;
    }

    if (data?.slug) {
      setStage("idle");
      onSuccess(data.slug);
      return;
    }

    setStage("error");
    setError("Could not create artist page. Try another Spotify link.");
  };

  return (
    <div className="bg-[#0a0a0a]">
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/track/..."
          className="bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm placeholder:text-white/25 w-full"
          required
        />
        <button
          type="submit"
          disabled={stage === "loading" || !url.trim()}
          className="bg-[#a855f7] text-white rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40"
        >
          Build artist page
        </button>
      </form>
      {stage === "error" && error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      {stage === "loading" && (
        <p className="text-white/40 text-xs mt-2 animate-pulse">{STATUS_MESSAGES[statusIdx]}</p>
      )}
    </div>
  );
}
