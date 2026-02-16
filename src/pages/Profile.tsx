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
import { Pencil, Camera, X, Check, Loader2, Music, Wallet } from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { ConnectWalletButton } from "@/components/crypto/ConnectWalletButton";
import { MusicEmbed } from "@/components/MusicEmbed";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";


const Profile = () => {
  const { user, loading: authLoading, roles, profile, refreshProfile } = useAuth();
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
              <TrailblazerBadge userId={user.id} showCounter />
            </div>
            {profile?.bio && !editing && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
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
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Wallet size={18} /> Crypto Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Connect your wallet to receive $DEGEN tips from the community.</p>
            <ConnectWalletButton />
          </CardContent>
        </Card>

        {/* Music embed for artists (outside edit view) */}
        {!editing && spotifyUrl && isMusicUrl(spotifyUrl) && (
          <Card className="glass-card border-border overflow-hidden">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Music size={18} /> My Music</CardTitle></CardHeader>
            <CardContent>
              <MusicEmbed url={spotifyUrl} title={`${getPlatformLabel(spotifyUrl)} embed`} />
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Profile;
