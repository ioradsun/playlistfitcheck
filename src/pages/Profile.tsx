import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Search, Save, Music, ExternalLink, Pencil, Camera, Share2, X } from "lucide-react";

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
  const { user, loading: authLoading, roles, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isArtist = roles.includes("artist");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Sync form state from profile context
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setSpotifyUrl(profile.spotify_embed_url ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setSearches(data as SavedSearch[]); });
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(uploadErr.message); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setUploading(false);
    if (updateErr) toast.error(updateErr.message);
    else { toast.success("Avatar updated!"); refreshProfile(); }
  };

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
    else { toast.success("Profile saved!"); setEditing(false); refreshProfile(); }
  };

  const embedUrl = spotifyUrl
    ? spotifyUrl.replace("open.spotify.com/", "open.spotify.com/embed/")
    : null;

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const publicUrl = user ? `${window.location.origin}/u/${user.id}` : "";

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile header */}
        <div className="flex items-start gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Camera size={20} className="text-foreground" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{profile?.display_name || "Your Profile"}</h1>
            <p className="text-sm text-muted-foreground capitalize">{roles[0] ?? "user"}</p>
            {profile?.bio && !editing && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Profile link copied!"); }}>
              <Share2 size={14} /> Share
            </Button>
            <Button variant={editing ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setEditing(!editing)}>
              {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit</>}
            </Button>
            <Button size="sm" onClick={() => navigate("/")} className="gap-1.5">
              <Search size={14} /> Search
            </Button>
          </div>
        </div>

        {/* Edit form (collapsible) */}
        {editing && (
          <Card className="glass-card border-border">
            <CardHeader><CardTitle className="text-lg">Edit Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself" rows={3} />
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
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>
        )}

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
