import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Music2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Track {
  id: string;
  name: string;
  artists: string;
  spotifyUrl: string;
  albumArt: string | null;
  durationMs: number;
}

const PLAYLIST_ID = "3wtgtkdE8aDOf3V0LYoAXa";

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function logEngagement(trackId: string, trackName: string, artistName: string) {
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action: "spotify_click" },
  }).catch(() => {});
}

export function PromoPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTracks() {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("playlist-player", {
          body: { playlistId: PLAYLIST_ID },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        setTracks(data.tracks || []);
      } catch (e) {
        console.error("Failed to fetch player tracks:", e);
        setError("Could not load tracks");
      } finally {
        setLoading(false);
      }
    }
    fetchTracks();
  }, []);

  const handleClick = useCallback((track: Track) => {
    logEngagement(track.id, track.name, track.artists);
    window.open(track.spotifyUrl, "_blank", "noopener");
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto glass-card rounded-xl p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm font-mono">Loading tracks...</span>
      </div>
    );
  }

  if (error || tracks.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass-card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Music2 size={14} className="text-primary" />
          <span className="text-xs font-mono text-muted-foreground">Featured Tracks</span>
        </div>

        {/* Track list */}
        <div className="max-h-[352px] overflow-y-auto">
          {tracks.map((track, i) => (
            <motion.button
              key={track.id}
              onClick={() => handleClick(track)}
              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 text-left group"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              {/* Track number */}
              <span className="w-5 text-xs font-mono text-muted-foreground text-right flex-shrink-0">
                {i + 1}
              </span>

              {/* Album art */}
              {track.albumArt && (
                <img
                  src={track.albumArt}
                  alt=""
                  className="w-9 h-9 rounded object-cover flex-shrink-0"
                />
              )}

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate group-hover:text-primary transition-colors">
                  {track.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{track.artists}</p>
              </div>

              {/* Duration */}
              <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                {formatTime(track.durationMs)}
              </span>

              {/* Spotify icon */}
              <ExternalLink
                size={13}
                className="flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors"
              />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
