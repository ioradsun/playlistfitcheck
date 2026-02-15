import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, X, Music } from "lucide-react";
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

const CAPTION_MAX = 300;

export function SongFitInlineComposer({ onPostCreated }: Props) {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState("");
  const [caption, setCaption] = useState("");
  const [results, setResults] = useState<TrackResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [publishing, setPublishing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;

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
    setQuery("");
    setResults([]);
    setFocused(false);
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
      setQuery("");
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
        caption: caption.trim(),
        tags_json: [] as any,
      });
      if (error) throw error;
      toast.success("Posted!");
      setQuery("");
      setCaption("");
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
    setCaption("");
    setSelectedTrack(null);
    setResults([]);
    inputRef.current?.focus();
  };

  const showDropdown = focused && results.length > 0 && !selectedTrack;

  return (
    <div className="border-b border-border/40 transition-colors">
      <div className="flex gap-3 px-4 pt-3 pb-3">
        {/* Avatar */}
        <Avatar className="h-10 w-10 border border-border shrink-0 mt-1">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Compose area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {selectedTrack ? (
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60 border border-border/50 group">
                  {selectedTrack.albumArt ? (
                    <img src={selectedTrack.albumArt} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Music size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">{selectedTrack.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {selectedTrack.artists.map(a => a.name).join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={clear}
                    className="p-1 rounded-full hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelectedTrack(null); }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setTimeout(() => setFocused(false), 200)}
                    placeholder="Search or paste Spotify link"
                    className="w-full bg-transparent text-foreground text-base placeholder:text-muted-foreground/60 outline-none py-2 pr-8"
                    disabled={publishing}
                  />
                  {searching && (
                    <Loader2 size={16} className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="h-9 px-5 rounded-full text-xs font-bold shrink-0"
              disabled={!selectedTrack || publishing}
              onClick={publish}
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : "Post"}
            </Button>
          </div>

          {/* Caption - shown after track is selected */}
          {selectedTrack && (
            <div className="mt-2">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                placeholder="Tell us why you made this song."
                rows={2}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
                disabled={publishing}
              />
              <div className="flex justify-end">
                <span className={`text-[10px] ${caption.length >= CAPTION_MAX ? "text-destructive" : "text-muted-foreground/50"}`}>
                  {caption.length}/{CAPTION_MAX}
                </span>
              </div>
            </div>
          )}

          {/* Search dropdown */}
          {showDropdown && (
            <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-[100] overflow-hidden max-h-72 overflow-y-auto"
              style={{ position: "relative" }}
            >
              {results.map(t => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
                  onMouseDown={() => selectTrack(t)}
                >
                  {t.image ? (
                    <img src={t.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Music size={16} className="text-muted-foreground" />
                    </div>
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
