import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TrackResult {
  id: string;
  name: string;
  artists: string;
  image: string | null;
  url: string;
}

interface TrackData {
  trackId: string;
  title: string;
  artists: { name: string; id: string; spotifyUrl: string }[];
  albumTitle: string;
  albumArt: string | null;
  releaseDate: string | null;
  previewUrl: string | null;
  spotifyUrl: string;
}

interface Props {
  onPostCreated: () => void;
}

export function SongFitInlineComposer({ onPostCreated }: Props) {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [publishing, setPublishing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;

  // Debounced search
  useEffect(() => {
    if (selectedTrack) return;
    if (!query.trim() || query.includes("spotify.com")) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("spotify-search", {
          body: { query: query.trim(), type: "track" },
        });
        if (!error && data?.results) {
          setResults(data.results.slice(0, 6));
        }
      } catch {}
      setSearching(false);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, selectedTrack]);

  const selectTrack = useCallback(async (track: TrackResult) => {
    setQuery(track.name + " — " + track.artists);
    setResults([]);
    setFocused(false);

    // Fetch full track data
    try {
      const { data, error } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: track.url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSelectedTrack(data as TrackData);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch track");
    }
  }, []);

  const handlePasteUrl = useCallback(async () => {
    if (!query.includes("spotify.com/track/")) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: query.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSelectedTrack(data as TrackData);
      setQuery(data.title + " — " + (data.artists || []).map((a: any) => a.name).join(", "));
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch track");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (query.includes("spotify.com/track/")) {
        handlePasteUrl();
      } else if (selectedTrack) {
        publish();
      }
    }
  };

  const publish = async () => {
    if (!user || !selectedTrack) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from("songfit_posts").insert({
        user_id: user.id,
        spotify_track_url: selectedTrack.spotifyUrl,
        spotify_track_id: selectedTrack.trackId,
        track_title: selectedTrack.title,
        track_artists_json: selectedTrack.artists as any,
        album_title: selectedTrack.albumTitle,
        album_art_url: selectedTrack.albumArt,
        release_date: selectedTrack.releaseDate,
        preview_url: selectedTrack.previewUrl,
        caption: "",
        tags_json: [] as any,
      });
      if (error) throw error;
      toast.success("Posted!");
      setQuery("");
      setSelectedTrack(null);
      onPostCreated();
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPublishing(false);
    }
  };

  const clear = () => {
    setQuery("");
    setSelectedTrack(null);
    setResults([]);
  };

  const showDropdown = focused && results.length > 0 && !selectedTrack;

  return (
    <div className="px-3 pt-3 pb-3 border-b border-border/40">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border border-border shrink-0 mt-0.5">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 relative">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <p className="text-sm font-medium text-muted-foreground mb-1.5">What you on right now?</p>
              <Input
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedTrack(null); }}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
                placeholder="Search or paste Spotify link"
                className="h-10 text-sm pr-8"
                disabled={publishing}
              />
              {(query || selectedTrack) && (
                <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
              {searching && (
                <Loader2 size={14} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <Button
              size="sm"
              className="h-10 px-4 text-xs font-semibold shrink-0"
              disabled={!selectedTrack || publishing}
              onClick={publish}
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : "Post"}
            </Button>
          </div>

          {/* Selected track preview */}
          {selectedTrack && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-muted/50">
              {selectedTrack.albumArt && (
                <img src={selectedTrack.albumArt} alt="" className="w-10 h-10 rounded object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedTrack.artists.map(a => a.name).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Search dropdown */}
          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-[100] overflow-hidden max-h-64 overflow-y-auto">
              {results.map(t => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
                  onMouseDown={() => selectTrack(t)}
                >
                  {t.image ? (
                    <img src={t.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.artists}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
