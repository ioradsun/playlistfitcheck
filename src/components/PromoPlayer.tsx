import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Music2, Loader2, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getSessionId } from "@/lib/sessionId";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

interface Track {
  id: string;
  name: string;
  artists: string;
  spotifyUrl: string;
  albumArt: string | null;
  durationMs: number;
}

const PLAYLIST_ID = "3wtgtkdE8aDOf3V0LYoAXa";

function logEngagement(trackId: string, trackName: string, artistName: string, action: "play" | "spotify_click") {
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action, sessionId: getSessionId() },
  }).catch(() => {});
}

export function PromoPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
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
    setActiveTrack(prev => {
      const next = prev?.id === track.id ? null : track;
      setOverlayDismissed(false);
      return next;
    });
  }, []);

  const handleSpotifyClick = useCallback((e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    logEngagement(track.id, track.name, track.artists, "spotify_click");
    window.open(track.spotifyUrl, "_blank", "noopener");
  }, []);

  if (loading || error || tracks.length === 0) return null;

  const trackList = (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music2 size={13} className="text-primary" />
          <span className="text-xs font-mono text-muted-foreground">Putting you on my fav artist</span>
        </div>
        {!isMobile && (
          <button onClick={() => setExpanded(false)} className="p-1 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="overflow-y-auto max-h-[240px]">
        {tracks.map((track, i) => {
          const isActive = activeTrack?.id === track.id;
          return (
            <motion.button
              key={track.id}
              onClick={() => handleTrackClick(track)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left group ${
                isActive ? "bg-primary/10" : "hover:bg-muted/50"
              }`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                {isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                ) : (
                  <Play size={10} className="text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </span>

              {track.albumArt && (
                <img src={track.albumArt} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate transition-colors ${isActive ? "text-primary font-medium" : "group-hover:text-primary"}`}>
                  {track.name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{track.artists}</p>
              </div>

              <button
                onClick={(e) => handleSpotifyClick(e, track)}
                className="flex-shrink-0 p-1 rounded-full hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title="Open in Spotify"
              >
                <ExternalLink size={11} />
              </button>
            </motion.button>
          );
        })}
      </div>

      {/* Embedded player for selected track */}
      {activeTrack && (
        <div className="border-t border-border relative">
          {!overlayDismissed && (
            <div
              className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors"
              onClick={() => setOverlayDismissed(true)}
            >
              <Play size={20} className="text-primary opacity-60" />
            </div>
          )}
          <iframe
            key={activeTrack.id}
            src={`https://open.spotify.com/embed/track/${activeTrack.id}?utm_source=generator&theme=0&autoplay=1`}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            className="rounded-b-xl"
          />
        </div>
      )}
    </div>
  );

  // Collapsed floating button
  const floatingButton = (
    <motion.button
      onClick={() => setExpanded(true)}
      className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
    >
      <Music2 size={20} />
      {activeTrack && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-score-excellent animate-pulse" />
      )}
    </motion.button>
  );

  // Mobile: use drawer
  if (isMobile) {
    return (
      <>
        {!expanded && floatingButton}
        <Drawer open={expanded} onOpenChange={setExpanded}>
          <DrawerContent>
            <DrawerTitle className="sr-only">Music Player</DrawerTitle>
            {trackList}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop: floating card
  return (
    <>
      <AnimatePresence>
        {!expanded && floatingButton}
      </AnimatePresence>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed bottom-20 right-4 z-50 w-[280px] glass-card rounded-xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {trackList}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
