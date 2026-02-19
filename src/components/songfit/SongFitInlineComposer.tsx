import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, X, Music, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { checkDuplicateSubmission, checkEligibleForReentry, reenterSubmission } from "@/lib/engagementTracking";
import { useNavigate } from "react-router-dom";

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
  genres?: string[];
}

interface Props {
  onPostCreated: () => void;
}

const CAPTION_MAX = 500;

export function SongFitInlineComposer({ onPostCreated }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [caption, setCaption] = useState("");
  const [results, setResults] = useState<TrackResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackData | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [posted, setPosted] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicatePostId, setDuplicatePostId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const postedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea to fit its content
  const autoResize = () => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;

  // Auto-focus caption when track is selected
  useEffect(() => {
    if (selectedTrack) {
      setTimeout(() => captionRef.current?.focus(), 100);
    }
  }, [selectedTrack]);

  // Clear posted banner after 3 seconds
  useEffect(() => {
    return () => {
      if (postedTimerRef.current) clearTimeout(postedTimerRef.current);
    };
  }, []);

  useEffect(() => {
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

  const checkDupe = useCallback(async (trackId: string) => {
    const { data } = await supabase
      .from("songfit_posts")
      .select("id, track_title, user_id, status, expires_at")
      .eq("spotify_track_id", trackId)
      .in("status", ["live", "cooldown"])
      .limit(1);
    if (data && data.length > 0) {
      const post = data[0];
      setDuplicatePostId(post.id);
      const daysLeft = post.expires_at
        ? Math.max(0, Math.ceil((new Date(post.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      const dayStr = daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining this cycle.` : "";
      setDuplicateWarning(`${post.track_title} is live. ${dayStr}`);
    } else {
      setDuplicateWarning(null);
      setDuplicatePostId(null);
    }
  }, [user?.id]);

  const selectTrack = useCallback(async (track: TrackResult) => {
    setQuery("");
    setResults([]);
    setFocused(false);
    setDuplicateWarning(null);
    setDuplicatePostId(null);
    try {
      const { data, error } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: track.url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSelectedTrack(data as TrackData);
      await checkDupe((data as TrackData).trackId);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch track");
    }
  }, [checkDupe]);

  const fetchTrackByUrl = useCallback(async (url: string) => {
    if (!url.includes("spotify.com/track/")) return;
    setSearching(true);
    setDuplicateWarning(null);
    setDuplicatePostId(null);
    try {
      const { data, error } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: url.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSelectedTrack(data as TrackData);
      setQuery("");
      await checkDupe((data as TrackData).trackId);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch track");
    } finally {
      setSearching(false);
    }
  }, [checkDupe]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.includes("spotify.com/track/")) {
      e.preventDefault();
      setQuery(pasted);
      fetchTrackByUrl(pasted);
    }
  }, [fetchTrackByUrl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (query.includes("spotify.com/track/")) {
        fetchTrackByUrl(query);
      }
    }
  };

  const publish = async () => {
    if (!user || !selectedTrack || !caption.trim()) return;
    setPublishing(true);
    try {
      // Check for duplicate submissions
      const duplicate = await checkDuplicateSubmission(user.id, selectedTrack.trackId);
      if (duplicate) {
        if (duplicate.status === "live") {
          toast.error("This song is already live.", {
            description: "You can only have one active submission per song.",
            action: {
              label: "View Submission",
              onClick: () => navigate(`/song/${duplicate.post.id}`),
            },
          });
          setPublishing(false);
          return;
        }
        if (duplicate.status === "cooldown") {
          const cooldownDate = duplicate.post.cooldown_until
            ? new Date(duplicate.post.cooldown_until).toLocaleDateString()
            : "soon";
          toast.error("This song is in cooldown.", {
            description: `You can re-enter after ${cooldownDate}.`,
            action: {
              label: "View Previous",
              onClick: () => navigate(`/song/${duplicate.post.id}`),
            },
          });
          setPublishing(false);
          return;
        }
      }

      // Check for re-entry eligible
      const eligible = await checkEligibleForReentry(user.id, selectedTrack.trackId);
      if (eligible) {
        const { error: reError } = await reenterSubmission(eligible.id, eligible.engagement_score);
        if (reError) throw reError;
        setQuery("");
        setCaption("");
        setSelectedTrack(null);
        window.dispatchEvent(new CustomEvent("crowdfit:post-created"));
        // Show posted banner
        setPosted(true);
        postedTimerRef.current = setTimeout(() => {
          setPosted(false);
          onPostCreated();
        }, 3000);
        setPublishing(false);
        return;
      }

      // New submission
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
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
        tags_json: (selectedTrack.genres?.slice(0, 3) ?? []) as any,
        status: "live",
        submitted_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;
      setQuery("");
      setCaption("");
      setSelectedTrack(null);
      window.dispatchEvent(new CustomEvent("crowdfit:post-created"));
      // Show posted banner for 3 seconds then refresh feed
      setPosted(true);
      postedTimerRef.current = setTimeout(() => {
        setPosted(false);
        onPostCreated();
      }, 3000);
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
    setDuplicateWarning(null);
    setDuplicatePostId(null);
    setPosted(false);
    if (postedTimerRef.current) clearTimeout(postedTimerRef.current);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const showDropdown = focused && results.length > 0 && !selectedTrack;

  // Posted success banner
  if (posted) {
    return (
      <div className="border-b border-border/40 px-4 py-5 flex items-center justify-center">
        <p className="text-sm font-medium text-primary animate-pulse">
          Your hook is live. Let's see if it lands.
        </p>
      </div>
    );
  }

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
                    onPaste={handlePaste}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setTimeout(() => setFocused(false), 200)}
                    placeholder="Search your song or paste Spotify link"
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
              disabled={!selectedTrack || publishing || !!duplicateWarning || !caption.trim()}
              onClick={publish}
            >
              {publishing ? "Dropping…" : "Drop"}
            </Button>
          </div>

          {/* Hook lyrics — required after track is selected */}
          {selectedTrack && !duplicateWarning && (
            <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
              <div className="flex items-center justify-end px-3 pt-2.5 pb-1">
                <span className={`text-[10px] tabular-nums ${caption.length >= CAPTION_MAX ? "text-destructive font-medium" : "text-muted-foreground/40"}`}>
                  {CAPTION_MAX - caption.length} left
                </span>
              </div>
              <textarea
                ref={captionRef}
                value={caption}
                onChange={e => {
                  setCaption(e.target.value.slice(0, CAPTION_MAX));
                  autoResize();
                }}
                onInput={autoResize}
                autoFocus
                placeholder="What's the story behind this one..."
                rows={4}
                style={{ minHeight: "96px", height: "auto" }}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none resize-none leading-relaxed px-3 pb-3"
                disabled={publishing}
              />
            </div>
          )}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border-none bg-amber-600 px-3 py-2 text-sm text-white">
              <AlertTriangle size={15} className="shrink-0 text-white" />
              <span className="flex-1">
                {duplicateWarning}{" "}
                <button onClick={() => duplicatePostId && navigate(`/song/${duplicatePostId}`)} className="text-white underline hover:text-white/80 transition-colors">
                  View Submission
                </button>
              </span>
              <button onClick={clear} className="p-0.5 rounded hover:bg-white/20 text-white hover:text-white/80 transition-colors">
                <X size={14} />
              </button>
            </div>
          )}

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
