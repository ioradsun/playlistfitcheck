import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Music2, Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

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

function logEngagement(trackId: string, trackName: string, artistName: string, action: "play" | "spotify_click") {
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action },
  }).catch(() => {});
}

export function PromoPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const isMobile = useIsMobile();

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

  const handleTrackClick = useCallback((track: Track) => {
    logEngagement(track.id, track.name, track.artists, "play");
    setActiveTrack(prev => prev?.id === track.id ? null : track);
  }, []);

  const handleSpotifyClick = useCallback((e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    logEngagement(track.id, track.name, track.artists, "spotify_click");
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
    <div className={`w-full ${activeTrack ? "max-w-3xl" : "max-w-md"} mx-auto transition-all duration-300`}>
      <div className={`flex ${isMobile ? "flex-col" : "flex-row"} gap-3 items-stretch`}>
        {/* Track list */}
        <div className={`glass-card rounded-xl flex flex-col max-h-[200px] ${activeTrack && !isMobile ? "flex-1 min-w-0" : "w-full"}`}>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Music2 size={14} className="text-primary" />
            <span className="text-xs font-mono text-muted-foreground">Putting you on my fav artist</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tracks.map((track, i) => {
              const isActive = activeTrack?.id === track.id;

              return (
                <motion.button
                  key={track.id}
                  onClick={() => handleTrackClick(track)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left group ${
                    isActive ? "bg-primary/10" : "hover:bg-muted/50"
                  }`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {/* Play indicator / track number */}
                  <span className="w-5 flex-shrink-0 flex items-center justify-center">
                    {isActive ? (
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    ) : (
                      <Play size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    )}
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
                    <p className={`text-sm truncate transition-colors ${isActive ? "text-primary font-medium" : "group-hover:text-primary"}`}>
                      {track.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{track.artists}</p>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                    {formatTime(track.durationMs)}
                  </span>

                  {/* Spotify link */}
                  <button
                    onClick={(e) => handleSpotifyClick(e, track)}
                    className="flex-shrink-0 p-1.5 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    title="Open in Spotify"
                  >
                    <ExternalLink size={13} />
                  </button>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Embedded player for selected track */}
        <AnimatePresence>
          {activeTrack && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, width: isMobile ? "100%" : 0 }}
              animate={{ opacity: 1, scale: 1, width: isMobile ? "100%" : 300 }}
              exit={{ opacity: 0, scale: 0.95, width: isMobile ? "100%" : 0 }}
              transition={{ duration: 0.3 }}
              className={`flex-shrink-0 h-[200px] ${isMobile ? "w-full" : ""}`}
            >
              <iframe
                key={activeTrack.id}
                src={`https://open.spotify.com/embed/track/${activeTrack.id}?utm_source=generator&theme=0`}
                width="100%"
                height="200"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-xl"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
