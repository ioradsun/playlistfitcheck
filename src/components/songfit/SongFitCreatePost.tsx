import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Music, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  onCancel: () => void;
}

export function SongFitCreatePost({ onPostCreated, onCancel }: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [trackData, setTrackData] = useState<TrackData | null>(null);
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  const fetchTrack = async () => {
    if (!url.includes("spotify.com/track/")) {
      toast.error("Paste a valid Spotify track URL");
      return;
    }
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("songfit-track", {
        body: { trackUrl: url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTrackData(data as TrackData);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch track");
    } finally {
      setFetching(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const publish = async () => {
    if (!user) { toast.error("Sign in to post"); return; }
    if (!trackData) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from("songfit_posts").insert({
        user_id: user.id,
        spotify_track_url: trackData.spotifyUrl || url,
        spotify_track_id: trackData.trackId,
        track_title: trackData.title,
        track_artists_json: trackData.artists as any,
        album_title: trackData.albumTitle,
        album_art_url: trackData.albumArt,
        release_date: trackData.releaseDate,
        preview_url: trackData.previewUrl,
        caption,
        tags_json: tags as any,
      });
      if (error) throw error;
      toast.success("Post published!");
      onPostCreated();
    } catch (e: any) {
      toast.error(e.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Music size={18} className="text-primary" /> Share a Song
        </h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      {/* URL Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Paste Spotify track URL..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchTrack()}
          disabled={fetching}
        />
        <Button onClick={fetchTrack} disabled={fetching || !url}>
          {fetching ? <Loader2 size={16} className="animate-spin" /> : "Fetch"}
        </Button>
      </div>

      {/* Track Preview */}
      {trackData && (
        <div className="glass-card rounded-xl p-4 space-y-4">
          <div className="flex gap-3">
            {trackData.albumArt && (
              <img src={trackData.albumArt} alt="" className="w-20 h-20 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold truncate">{trackData.title}</h3>
              <p className="text-sm text-muted-foreground truncate">
                {trackData.artists.map(a => a.name).join(", ")}
              </p>
              {trackData.albumTitle && (
                <p className="text-xs text-muted-foreground mt-1">{trackData.albumTitle}</p>
              )}
            </div>
          </div>

          {/* Caption */}
          <Textarea
            placeholder="Add a caption..."
            value={caption}
            onChange={e => setCaption(e.target.value)}
            maxLength={500}
            rows={3}
          />

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Add tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={addTag} disabled={tags.length >= 5}>
                <Plus size={16} />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    #{t}
                    <button onClick={() => setTags(tags.filter((_, j) => j !== i))}>
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Publish
          </Button>
        </div>
      )}
    </div>
  );
}
