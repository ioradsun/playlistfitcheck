import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, ExternalLink, Music2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Track {
  id: string;
  name: string;
  artists: string;
  previewUrl: string | null;
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
  // Fire-and-forget
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action },
  }).catch(() => {});
}

export function PromoPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentTrack]);

  const handlePlay = useCallback((track: Track) => {
    if (!track.previewUrl) return;

    if (currentTrack?.id === track.id && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(track.previewUrl);
    audioRef.current = audio;
    setCurrentTrack(track);
    setProgress(0);
    audio.play();
    setIsPlaying(true);

    logEngagement(track.id, track.name, track.artists, "play");
  }, [currentTrack, isPlaying]);

  const handleSpotifyClick = useCallback((track: Track) => {
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

  if (error || tracks.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass-card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Music2 size={14} className="text-primary" />
          <span className="text-xs font-mono text-muted-foreground">Now Spinning</span>
        </div>

        {/* Now playing bar */}
        <AnimatePresence>
          {currentTrack && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-border overflow-hidden"
            >
              <div className="px-4 py-3 flex items-center gap-3">
                {currentTrack.albumArt && (
                  <img
                    src={currentTrack.albumArt}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{currentTrack.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{currentTrack.artists}</p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-0.5 bg-muted">
                <motion.div
                  className="h-full bg-primary"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Track list */}
        <div className="max-h-[320px] overflow-y-auto">
          {tracks.map((track, i) => {
            const isActive = currentTrack?.id === track.id;
            const hasPreview = !!track.previewUrl;

            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isActive ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                {/* Play button or track number */}
                <button
                  onClick={() => handlePlay(track)}
                  disabled={!hasPreview}
                  className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
                    hasPreview
                      ? "hover:bg-primary/20 text-foreground"
                      : "text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  {isActive && isPlaying ? (
                    <Pause size={14} className="text-primary" />
                  ) : hasPreview ? (
                    <Play size={14} className={isActive ? "text-primary" : ""} />
                  ) : (
                    <span className="text-xs font-mono">{i + 1}</span>
                  )}
                </button>

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
                  <p className={`text-sm truncate ${isActive ? "text-primary font-medium" : ""}`}>
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
                  onClick={() => handleSpotifyClick(track)}
                  className="flex-shrink-0 p-1.5 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                  title="Listen on Spotify"
                >
                  <ExternalLink size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
