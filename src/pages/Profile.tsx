import { useEffect, useState, useRef, useCallback } from "react";
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
import { Pencil, Camera, X, Check, Loader2, Music, Wallet, ExternalLink, Bookmark } from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { ConnectWalletButton } from "@/components/crypto/ConnectWalletButton";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";
import { useSiteCopy } from "@/hooks/useSiteCopy";

interface SavedPost {
  id: string;
  post_id: string;
  created_at: string;
  songfit_posts: {
    id: string;
    track_title: string;
    spotify_track_url: string;
    album_art_url: string | null;
    track_artists_json: { name: string }[];
  } | null;
}


const Profile = () => {
  const { user, loading: authLoading, roles, profile, refreshProfile } = useAuth();
  const { features } = useSiteCopy();
  const navigate = useNavigate();
  
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const currentRole = roles[0] ?? "user";
  const isArtist = roles.includes("artist");
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  // Google avatar fallback
  const googleAvatar = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const avatarSrc = profile?.avatar_url || googleAvatar || undefined;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setSpotifyUrl(profile.spotify_embed_url ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("songfit_saves")
      .select("id, post_id, created_at, songfit_posts(id, track_title, spotify_track_url, album_art_url, track_artists_json)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setSavedPosts(data as unknown as SavedPost[]);
      });
  }, [user]);




  const autoSave = useCallback((fields: { display_name?: string; bio?: string; spotify_embed_url?: string }) => {
    if (!user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
      if (error) { toast.error(error.message); setAutoSaveStatus("idle"); }
      else { setAutoSaveStatus("saved"); refreshProfile(); setTimeout(() => setAutoSaveStatus("idle"), 1500); }
    }, 800);
  }, [user, refreshProfile]);

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    autoSave({ display_name: val, bio, spotify_embed_url: spotifyUrl || undefined });
  };
  const handleBioChange = (val: string) => {
    setBio(val);
    autoSave({ display_name: displayName, bio: val, spotify_embed_url: spotifyUrl || undefined });
  };
  const handleSpotifyUrlChange = (val: string) => {
    setSpotifyUrl(val);
    autoSave({ display_name: displayName, bio, spotify_embed_url: val });
  };




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

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile header */}
        <div className="flex items-start gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarSrc} />
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
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground capitalize">{currentRole}</p>
              <TrailblazerBadge userId={user.id} />
            </div>
            {profile?.bio && !editing && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
            {!editing && spotifyUrl && isMusicUrl(spotifyUrl) && (
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
              >
                <Music size={14} />
                My {getPlatformLabel(spotifyUrl)}
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant={editing ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setEditing(!editing)}>
              {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit</>}
            </Button>
          </div>
        </div>

        {/* Edit form (collapsible) — auto-saves */}
        {editing && (
          <Card className="glass-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Edit Profile</CardTitle>
                {autoSaveStatus === "saving" && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
                {autoSaveStatus === "saved" && <span className="text-xs text-primary flex items-center gap-1"><Check size={12} /> Saved</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={displayName} onChange={e => handleDisplayNameChange(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={bio} onChange={e => handleBioChange(e.target.value)} placeholder="Tell us about yourself" rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Music Profile URL</Label>
                <Input value={spotifyUrl} onChange={e => handleSpotifyUrlChange(e.target.value)} placeholder="Spotify or SoundCloud URL..." />
                <p className="text-xs text-muted-foreground">Your Spotify or SoundCloud profile link</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wallet connection */}
        {features.crypto_tipping && (
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Wallet size={18} /> Crypto Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Connect your wallet to receive $DEGEN tips from the community.</p>
              <ConnectWalletButton />
            </CardContent>
          </Card>
        )}

        {/* Saved Songs */}
        {savedPosts.length > 0 && (
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Bookmark size={18} /> Saved Songs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedPosts.map(s => {
                const p = s.songfit_posts;
                if (!p) return null;
                const artists = (p.track_artists_json as any[])?.map((a: any) => a.name).join(", ") || "";
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/song/${p.id}`)}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/80 cursor-pointer transition-colors"
                  >
                    {p.album_art_url && (
                      <img src={p.album_art_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.track_title}</p>
                      {artists && <p className="text-xs text-muted-foreground truncate">{artists}</p>}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Profile;
