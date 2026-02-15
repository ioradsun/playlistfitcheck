import { useState, useEffect, useRef, useCallback } from "react";
import { useSiteCopy } from "@/hooks/useSiteCopy";

import { Search, Zap, Loader2, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PlaylistInput as PlaylistInputType } from "@/lib/playlistHealthEngine";
import { SAMPLE_PLAYLIST, SAMPLE_EDITORIAL } from "@/lib/playlistHealthEngine";
import { getSessionId } from "@/lib/sessionId";


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
  const siteCopy = useSiteCopy();
  const [url, setUrl] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlistFocused, setPlaylistFocused] = useState(false);
  const [songFocused, setSongFocused] = useState(false);
  const songInputRef = useRef<HTMLInputElement>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistResult | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackResult | null>(null);
  const [playlistFetching, setPlaylistFetching] = useState(false);
  const [trackFetching, setTrackFetching] = useState(false);

  const { results: playlistResults, loading: playlistSearching, clear: clearPlaylist } =
    useSpotifySearch<PlaylistResult>("playlist", url);
  const { results: songResults, loading: songSearching, clear: clearSong } =
    useSpotifySearch<TrackResult>("track", songUrl);

  const fetchPlaylistMeta = useCallback(async (pastedUrl: string) => {
    const match = pastedUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setPlaylistFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "playlist" },
      });
      if (!error && data?.results?.length > 0) {
        setSelectedPlaylist(data.results[0]);
      }
    } catch {} finally {
      setPlaylistFetching(false);
    }
  }, []);

  const fetchTrackMeta = useCallback(async (pastedUrl: string) => {
    const match = pastedUrl.match(/track\/([a-zA-Z0-9]+)/);
    if (!match) return;
    setTrackFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-search", {
        body: { query: match[1], type: "track" },
      });
      if (!error && data?.results?.length > 0) {
        setSelectedTrack(data.results[0]);
      }
    } catch {} finally {
      setTrackFetching(false);
    }
  }, []);

  const handlePlaylistPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes("spotify.com/playlist/")) {
      e.preventDefault();
      const trimmed = pasted.trim();
      setUrl(trimmed);
      clearPlaylist();
      setPlaylistFocused(false);
      fetchPlaylistMeta(trimmed);
      setTimeout(() => songInputRef.current?.focus(), 100);
    }
  };

  const handleSongPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes("spotify.com/track/")) {
      e.preventDefault();
      const trimmed = pasted.trim();
      setSongUrl(trimmed);
      clearSong();
      setSongFocused(false);
      fetchTrackMeta(trimmed);
    }
  };

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
        body: { playlistUrl: trimmedUrl, sessionId: getSessionId(), songUrl: songUrl.trim() || null },
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
    setSelectedPlaylist(p);
    clearPlaylist();
    setPlaylistFocused(false);
    setTimeout(() => songInputRef.current?.focus(), 100);
  };

  const selectTrack = (t: TrackResult) => {
    setSongUrl(t.url);
    setSelectedTrack(t);
    clearSong();
    setSongFocused(false);
  };

  const clearSelectedPlaylist = () => {
    setSelectedPlaylist(null);
    setUrl("");
  };

  const clearSelectedTrack = () => {
    setSelectedTrack(null);
    setSongUrl("");
  };

  const showPlaylistDropdown = playlistFocused && playlistResults.length > 0 && !selectedPlaylist;
  const showSongDropdown = songFocused && songResults.length > 0 && !selectedTrack;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold text-foreground">{siteCopy.tools.playlist?.heading || "Check Playlist Health And Match Your Song"}</h1>
      </div>

      <div className="space-y-4">
        {/* Combined URL inputs */}
        <div className="glass-card rounded-xl p-4 space-y-3 relative z-50" style={{ overflow: 'visible' }}>
          {/* Playlist input with search */}
          {selectedPlaylist ? (
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60 border border-border/50">
              {selectedPlaylist.image ? (
                <img src={selectedPlaylist.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                  <Search size={14} className="text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selectedPlaylist.name}</p>
                <p className="text-xs text-muted-foreground truncate">by {selectedPlaylist.owner} · {selectedPlaylist.tracks} tracks</p>
              </div>
              <button type="button" onClick={clearSelectedPlaylist} className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors" disabled={loading}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={18} />
              <Input
                value={url}
                onChange={e => { setUrl(e.target.value); setSelectedPlaylist(null); }}
                placeholder="Search or paste Spotify playlist URL..."
                className="pl-10 h-11 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
                onKeyDown={e => e.key === "Enter" && !loading && handleAnalyze()}
                onPaste={handlePlaylistPaste}
                onFocus={() => setPlaylistFocused(true)}
                onBlur={() => setTimeout(() => setPlaylistFocused(false), 200)}
                disabled={loading}
              />
              {(playlistSearching || playlistFetching) && (
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
          )}

          <div className="border-t border-border" />

          {/* Song input with search */}
          {selectedTrack ? (
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60 border border-border/50">
              {selectedTrack.image ? (
                <img src={selectedTrack.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                  <Music size={14} className="text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{selectedTrack.name}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedTrack.artists}</p>
              </div>
              <button type="button" onClick={clearSelectedTrack} className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors" disabled={loading}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Music className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" size={18} />
              <Input
                ref={songInputRef}
                value={songUrl}
                onChange={e => { setSongUrl(e.target.value); setSelectedTrack(null); }}
                placeholder="Search or paste Spotify song URL (optional)..."
                className="pl-10 h-11 bg-transparent border-0 focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
                onPaste={handleSongPaste}
                onFocus={() => setSongFocused(true)}
                onBlur={() => setTimeout(() => setSongFocused(false), 200)}
                disabled={loading}
              />
              {(songSearching || trackFetching) && (
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
          )}

          <div className="pt-1">
            <Button onClick={handleAnalyze} className="w-full glow-primary" size="lg" disabled={loading}>
              {loading ? (
                <Loader2 size={16} className="mr-1 animate-spin" />
              ) : (
                <Zap size={16} className="mr-1" />
              )}
              {loading ? "Fetching..." : (siteCopy.tools.playlist?.cta || "Analyze Playlist")}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}