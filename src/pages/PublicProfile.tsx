import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ExternalLink, Pencil, Wallet, ArrowLeft, Music, Trophy,
  Camera, X, Check, Loader2, Bookmark, Heart, MessageCircle,
} from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";

import { ConnectWalletButton } from "@/components/crypto/ConnectWalletButton";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import type { SongFitPost } from "@/components/songfit/types";

interface PublicProfileData {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_embed_url: string | null;
  wallet_address: string | null;
  is_verified: boolean;
}

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

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { features } = useSiteCopy();
  const fromMenu = !!(location.state as any)?.fromMenu;
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<SongFitPost[]>([]);
  const [saveCounts, setSaveCounts] = useState<Record<string, number>>({});
  const [notFound, setNotFound] = useState(false);

  const isOwner = user?.id === userId;

  // Owner editing state
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);

  useEffect(() => {
    if (!userId) return;

    supabase.from("profiles").select("display_name, bio, avatar_url, spotify_embed_url, wallet_address, is_verified").eq("id", userId).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return; }
        setProfile(data as PublicProfileData);
      });
    supabase.from("user_roles").select("role").eq("user_id", userId)
      .then(({ data }) => { setRoles(data?.map((r: any) => r.role) ?? []); });
    supabase.from("songfit_posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data) return;
        const posts = data as unknown as SongFitPost[];
        setSubmissions(posts);
        // Fetch save counts for all posts
        const postIds = posts.map(p => p.id);
        if (postIds.length === 0) return;
        supabase.from("songfit_saves")
          .select("post_id")
          .in("post_id", postIds)
          .then(({ data: saves }) => {
            if (!saves) return;
            const counts: Record<string, number> = {};
            saves.forEach((s: any) => { counts[s.post_id] = (counts[s.post_id] ?? 0) + 1; });
            setSaveCounts(counts);
          });
      });
  }, [userId]);

  // Owner: load saved posts & init edit fields
  useEffect(() => {
    if (!isOwner || !user) return;
    supabase
      .from("songfit_saves")
      .select("id, post_id, created_at, songfit_posts(id, track_title, spotify_track_url, album_art_url, track_artists_json)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setSavedPosts(data as unknown as SavedPost[]);
      });
  }, [isOwner, user]);

  useEffect(() => {
    if (isOwner && profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setSpotifyUrl(profile.spotify_embed_url ?? "");
    }
  }, [isOwner, profile]);

  // Auto-save for owner
  const autoSave = useCallback((fields: { display_name?: string; bio?: string; spotify_embed_url?: string }) => {
    if (!user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
      if (error) { toast.error(error.message); setAutoSaveStatus("idle"); }
      else {
        setAutoSaveStatus("saved");
        refreshProfile();
        // Update local state too
        setProfile(prev => prev ? { ...prev, ...fields } : prev);
        setTimeout(() => setAutoSaveStatus("idle"), 1500);
      }
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
    else {
      toast.success("Avatar updated!");
      refreshProfile();
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
    }
  };

  const hasMusic = profile?.spotify_embed_url && isMusicUrl(profile.spotify_embed_url);
  const initials = (profile?.display_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Google avatar fallback for owner
  const googleAvatar = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const avatarSrc = isOwner
    ? (profile?.avatar_url || googleAvatar || undefined)
    : (profile?.avatar_url ?? undefined);

  // Competitive stats
  const bestPeakRank = submissions.reduce((best, s) => {
    const rank = s.peak_rank;
    if (rank && (best === null || rank < best)) return rank;
    return best;
  }, null as number | null);
  const totalLikes = submissions.reduce((sum, s) => sum + (s.likes_count || 0), 0);
  const totalComments = submissions.reduce((sum, s) => sum + (s.comments_count || 0), 0);
  const totalSaves = Object.values(saveCounts).reduce((sum, c) => sum + c, 0);

  if (notFound) {
    return (
      <div className="min-h-screen bg-background pt-20 flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found.</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pt-20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          {!(isOwner && fromMenu) && (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={20} />
            </Button>
          )}
          <h1 className="text-xl font-semibold truncate">{profile.display_name || "User"}</h1>
          {isOwner && (
            <Button
              variant={editing ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5 ml-auto"
              onClick={() => setEditing(!editing)}
            >
              {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit</>}
            </Button>
          )}
        </div>

        <div className="flex items-start gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarSrc} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            {profile.is_verified && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <VerifiedBadge size={20} />
              </span>
            )}
            {isOwner && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera size={20} className="text-foreground" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground capitalize">{roles[0] ?? "user"}</p>
              <TrailblazerBadge userId={userId} />
            </div>
            {profile.bio && !editing && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
            {hasMusic && !editing && (
              <a
                href={profile.spotify_embed_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
              >
                <Music size={14} />
                My {getPlatformLabel(profile.spotify_embed_url!)}
                <ExternalLink size={12} />
              </a>
            )}
            {features.crypto_tipping && profile.wallet_address && !editing && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                <Wallet size={12} />
                {profile.wallet_address.slice(0, 6)}…{profile.wallet_address.slice(-4)}
              </p>
            )}
          </div>
        </div>

        {/* Edit form (owner only) */}
        {isOwner && editing && (
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

        {/* Wallet connection (owner only) */}
        {isOwner && features.crypto_tipping && (
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

        {/* Competitive Summary */}
        {submissions.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bestPeakRank ? 5 : 4}, minmax(0, 1fr))` }}>
            {bestPeakRank && (
              <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
                <Trophy size={14} className="mx-auto mb-1 text-primary" />
                <p className="text-base font-bold">#{bestPeakRank}</p>
                <p className="text-[10px] text-muted-foreground">Peak</p>
              </div>
            )}
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Music size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{submissions.length}</p>
              <p className="text-[10px] text-muted-foreground">Songs</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Heart size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{totalLikes}</p>
              <p className="text-[10px] text-muted-foreground">Likes</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <MessageCircle size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{totalComments}</p>
              <p className="text-[10px] text-muted-foreground">Comments</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Bookmark size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{totalSaves}</p>
              <p className="text-[10px] text-muted-foreground">Saves</p>
            </div>
          </div>
        )}

        {/* My Songs on CrowdFit */}
        {submissions.length > 0 && (
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-base">My Songs on CrowdFit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {submissions.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/song/${s.id}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {s.album_art_url && (
                      <img src={s.album_art_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.track_title}</p>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">{s.status}</span>
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Heart size={9} /> {s.likes_count ?? 0}
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MessageCircle size={9} /> {s.comments_count ?? 0}
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Bookmark size={9} /> {saveCounts[s.id] ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold text-primary">
                      {s.peak_rank ? `#${s.peak_rank}` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Peak</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Saved Songs (owner only) */}
        {isOwner && savedPosts.length > 0 && (
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

export default PublicProfile;
