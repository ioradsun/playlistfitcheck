import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Search, Save, Music, ExternalLink } from "lucide-react";

interface Profile {
  display_name: string | null;
  bio: string | null;
  spotify_embed_url: string | null;
}

interface SavedSearch {
  id: string;
  playlist_name: string | null;
  playlist_url: string | null;
  song_name: string | null;
  health_score: number | null;
  health_label: string | null;
  blended_score: number | null;
  blended_label: string | null;
  created_at: string;
}

const Profile = () => {
  const { user, loading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const isArtist = roles.includes("artist");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    // Fetch profile
    supabase.from("profiles").select("*").eq("id", user.id).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          setDisplayName(data.display_name ?? "");
          setBio(data.bio ?? "");
          setSpotifyUrl(data.spotify_embed_url ?? "");
        }
      });
    // Fetch saved searches
    supabase.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setSearches(data as SavedSearch[]);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      bio,
      spotify_embed_url: isArtist ? spotifyUrl : undefined,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved!");
  };

  // Convert Spotify URL to embed URL
  const embedUrl = spotifyUrl
    ? spotifyUrl.replace("open.spotify.com/", "open.spotify.com/embed/")
    : null;

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{displayName || "Your Profile"}</h1>
            <p className="text-sm text-muted-foreground capitalize">{roles[0] ?? "user"}</p>
          </div>
          <Button onClick={() => navigate("/")} className="gap-2">
            <Search size={16} />
            Run a Search
          </Button>
        </div>

        {/* Edit profile */}
        <Card className="glass-card border-border">
          <CardHeader><CardTitle className="text-lg">Edit Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Input value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself" />
            </div>
            {isArtist && (
              <div className="space-y-2">
                <Label>Spotify Playlist URL</Label>
                <Input value={spotifyUrl} onChange={e => setSpotifyUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/..." />
                <p className="text-xs text-muted-foreground">Paste a Spotify playlist or album link to embed your works</p>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save size={16} />
              {saving ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>

        {/* Spotify embed for artists */}
        {isArtist && embedUrl && (
          <Card className="glass-card border-border overflow-hidden">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Music size={18} /> My Music</CardTitle></CardHeader>
            <CardContent>
              <iframe
                src={embedUrl}
                width="100%"
                height="352"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-lg"
                title="Spotify embed"
              />
            </CardContent>
          </Card>
        )}

        {/* Search history */}
        <Card className="glass-card border-border">
          <CardHeader><CardTitle className="text-lg">Search History</CardTitle></CardHeader>
          <CardContent>
            {searches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet. Run a Fit Check to see results here.</p>
            ) : (
              <div className="space-y-3">
                {searches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.playlist_name || "Untitled"}</p>
                      {s.song_name && <p className="text-xs text-muted-foreground truncate">🎵 {s.song_name}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono font-bold text-primary">{s.health_score ?? "—"}</span>
                      {s.blended_score != null && (
                        <span className="text-xs font-mono text-accent-foreground">Fit: {s.blended_score}</span>
                      )}
                      {s.playlist_url && (
                        <a href={s.playlist_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
