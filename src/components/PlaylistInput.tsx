import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Search, Zap, BarChart3, Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PlaylistInput as PlaylistInputType } from "@/lib/playlistHealthEngine";
import { SAMPLE_PLAYLIST, SAMPLE_EDITORIAL } from "@/lib/playlistHealthEngine";
import { PromoPlayer } from "@/components/PromoPlayer";

interface Props {
  onAnalyze: (data: PlaylistInputType & { _songUrl?: string }) => void;
}

interface PlaylistResult {
  id: string;
  name: string;
  owner: string;
  tracks: number;
  image: string | null;
  url: string;
}

interface TrackResult {
  id: string;
  name: string;
  artists: string;
  image: string | null;
  url: string;
}

function useSpotifySearch<T>(type: "playlist" | "track", query: string) {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Don't search if it looks like a URL
    if (!query || query.length < 2 || query.includes("spotify.com")) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query, type },
        });
        if (!error && data?.results) {
          setResults(data.results as T[]);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, type]);

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, clear };
}

export function PlaylistInputSection({ onAnalyze }: Props) {
  const [url, setUrl] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlistFocused, setPlaylistFocused] = useState(false);
  const [songFocused, setSongFocused] = useState(false);

  const { results: playlistResults, loading: playlistSearching, clear: clearPlaylist } =
    useSpotifySearch<PlaylistResult>("playlist", url);
  const { results: songResults, loading: songSearching, clear: clearSong } =
    useSpotifySearch<TrackResult>("track", songUrl);

  const handleAnalyze = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Please paste a Spotify playlist URL");
      return;
    }

    if (!trimmedUrl.includes("spotify.com/playlist/")) {
      toast.error("Please enter a valid Spotify playlist URL");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-playlist", {
        body: { playlistUrl: trimmedUrl },
      });

      if (error) {
        throw new Error(error.message || "Failed to fetch playlist data");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      onAnalyze({ ...(data as PlaylistInputType), _songUrl: songUrl.trim() || undefined });
    } catch (e) {
      console.error("Analyze error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to analyze playlist");
    } finally {
      setLoading(false);
    }
  };

  const DEMO_PLAYLIST_URL = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
  const DEMO_SONG_URL = "https://open.spotify.com/track/7tncKjVXrUutWHOWYqf4eK";

  const handleDemo = () => {
    setUrl(DEMO_PLAYLIST_URL);
    setSongUrl(DEMO_SONG_URL);
    setTimeout(() => {
      onAnalyze({ ...(SAMPLE_PLAYLIST as PlaylistInputType & { _trackList: { name: string; artists: string }[] }), _songUrl: DEMO_SONG_URL });
    }, 600);
  };

  const selectPlaylist = (p: PlaylistResult) => {
    setUrl(p.url);
    clearPlaylist();
    setPlaylistFocused(false);
  };

  const selectTrack = (t: TrackResult) => {
    setSongUrl(t.url);
    clearSong();
    setSongFocused(false);
  };

  const showPlaylistDropdown = playlistFocused && playlistResults.length > 0;
  const showSongDropdown = songFocused && songResults.length > 0;

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center space-y-3">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <BarChart3 size={14} />
          Know before you pitch.
        </motion.div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Playlist <span className="text-gradient-primary">Fit</span> Check
        </h1>
      </div>

      {/* Combined URL inputs */}
      <div className="glass-card rounded-xl p-4 space-y-3 relative" style={{ overflow: 'visible' }}>
        {/* Playlist input with search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={18} />
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Search or paste Spotify playlist URL..."
            className="pl-10 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
            onKeyDown={e => e.key === "Enter" && !loading && handleAnalyze()}
            onFocus={() => setPlaylistFocused(true)}
            onBlur={() => setTimeout(() => setPlaylistFocused(false), 200)}
            disabled={loading}
          />
          {playlistSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" size={16} />
          )}
          {showPlaylistDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-[100] overflow-hidden max-h-80 overflow-y-auto">
              {playlistResults.map((p) => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
                  onMouseDown={() => selectPlaylist(p)}
                >
                  {p.image ? (
                    <img src={p.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Search size={12} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">by {p.owner} · {p.tracks} tracks</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Song input with search */}
        <div className="relative">
          <Music className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={18} />
          <Input
            value={songUrl}
            onChange={e => setSongUrl(e.target.value)}
            placeholder="Search or paste Spotify song URL (optional)..."
            className="pl-10 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
            onFocus={() => setSongFocused(true)}
            onBlur={() => setTimeout(() => setSongFocused(false), 200)}
            disabled={loading}
          />
          {songSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" size={16} />
          )}
          {showSongDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-[100] overflow-hidden max-h-80 overflow-y-auto">
              {songResults.map((t) => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
                  onMouseDown={() => selectTrack(t)}
                >
                  {t.image ? (
                    <img src={t.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Music size={12} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.artists}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleAnalyze} className="glow-primary" disabled={loading}>
            {loading ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <Zap size={16} className="mr-1" />
            )}
            {loading ? "Fetching..." : "Check Fit"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs">
        <Link to="/how-scoring-works" className="text-primary hover:underline underline-offset-2">
          Inside the Fitting Room
        </Link>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={handleDemo}
          className="text-primary hover:underline underline-offset-2"
        >
          See Demo Results
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <PromoPlayer />
      </div>
    </motion.div>
  );
}
