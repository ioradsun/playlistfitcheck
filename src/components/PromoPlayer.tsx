import { useState, useEffect, useCallback, useRef } from "react";
import { motion, useDragControls } from "framer-motion";
import { ExternalLink, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getSessionId } from "@/lib/sessionId";

interface Track {
  id: string;
  name: string;
  artists: string;
  spotifyUrl: string;
  albumArt: string | null;
  durationMs: number;
}

const PLAYLIST_ID = "3wtgtkdE8aDOf3V0LYoAXa";

function logEngagement(trackId: string, trackName: string, artistName: string, action: string) {
  supabase.functions.invoke("track-engagement", {
    body: { trackId, trackName, artistName, action, sessionId: getSessionId() },
  }).catch(() => {});
}

const WidgetHeader = ({ title, onPointerDown }: { title: string; onPointerDown?: (e: React.PointerEvent) => void }) => (
  <div
    className="px-3 py-2.5 border-b border-border cursor-grab active:cursor-grabbing"
    onPointerDown={onPointerDown}
  >
    <span className="text-xs font-mono text-muted-foreground">{title}</span>
  </div>
);

export function PromoPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [widgetMode, setWidgetMode] = useState<"tracklist" | "embed">("tracklist");
  const [embedUrl, setEmbedUrl] = useState("");
  const [widgetTitle, setWidgetTitle] = useState("Featured Artist");
  const isMobile = useIsMobile();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Fetch widget config
  useEffect(() => {
    supabase.from("widget_config").select("mode, embed_url, widget_title").limit(1).single().then(({ data }) => {
      if (data?.mode) setWidgetMode(data.mode as "tracklist" | "embed");
      if (data?.embed_url) setEmbedUrl(data.embed_url);
      if (data?.widget_title) setWidgetTitle(data.widget_title);
    });
  }, []);

  // Fetch tracks only if tracklist mode
  useEffect(() => {
    if (widgetMode !== "tracklist") { setLoading(false); return; }
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
  }, [widgetMode]);

  useEffect(() => {
    if (widgetMode === "embed") {
      logEngagement("widget", "Widget", "System", "widget_open");
    }
  }, [widgetMode]);

  const handleTrackClick = useCallback((track: Track) => {
    logEngagement(track.id, track.name, track.artists, "play");
    setActiveTrack(prev => prev?.id === track.id ? null : track);
  }, []);

  const handleSpotifyClick = useCallback((e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    logEngagement(track.id, track.name, track.artists, "spotify_click");
    window.open(track.spotifyUrl, "_blank", "noopener");
  }, []);

  if (loading || error) return null;
  if (widgetMode === "tracklist" && tracks.length === 0) return null;
  if (widgetMode === "embed" && !embedUrl) return null;

  // ── TRACKLIST MODE content ──
  const trackList = (
    <div className="flex flex-col">
      <WidgetHeader title={widgetTitle} onPointerDown={(e) => dragControls.start(e)} />
      <div className="overflow-y-auto max-h-[132px]">
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
      {activeTrack && (
        <div className="border-t border-border">
          <iframe
            key={activeTrack.id}
            src={`https://open.spotify.com/embed/track/${activeTrack.id}?utm_source=generator&theme=0&autoplay=1`}
            width="100%"
            height="80"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            style={{ borderRadius: 12 }}
          />
        </div>
      )}
    </div>
  );

  const dragBoundary = !isMobile ? <div ref={constraintsRef} className="fixed inset-0 z-30 pointer-events-none" /> : null;

  // Embed mode
  if (widgetMode === "embed") {
    return (
      <>
        {dragBoundary}
        <motion.div
          drag={!isMobile}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={constraintsRef}
          dragMomentum={false}
          className="fixed bottom-20 right-4 z-50 w-[280px] glass-card rounded-xl shadow-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <WidgetHeader title={widgetTitle} onPointerDown={(e) => dragControls.start(e)} />
          <iframe
            src={embedUrl}
            width="100%"
            height="152"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ borderRadius: "0 0 12px 12px" }}
          />
        </motion.div>
      </>
    );
  }

  // Tracklist mode
  return (
    <>
      {dragBoundary}
      <motion.div
        drag={!isMobile}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={constraintsRef}
        dragMomentum={false}
        className="fixed bottom-20 right-4 z-50 w-[280px] glass-card rounded-xl shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {trackList}
      </motion.div>
    </>
  );
}
