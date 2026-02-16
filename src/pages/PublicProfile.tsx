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
  ExternalLink, Pencil, Wallet, ArrowLeft, Music, Trophy, Flame,
  RotateCcw, TrendingUp, Star, Target, Camera, X, Check, Loader2, Bookmark,
} from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { SubmissionBadge } from "@/components/songfit/SubmissionBadge";
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
      .limit(20)
      .then(({ data }) => { if (data) setSubmissions(data as unknown as SongFitPost[]); });
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
  const liveSubmission = submissions.find(s => s.status === "live");
  const totalCycles = submissions.reduce((sum, s) => sum + (s.cycle_number || 1), 0);
  const bestPeakRank = submissions.reduce((best, s) => {
    const rank = s.peak_rank;
    if (rank && (best === null || rank < best)) return rank;
    return best;
  }, null as number | null);
  const bestCycleScore = Math.max(0, ...submissions.map(s => s.engagement_score || 0));
  const lifetimeImpact = submissions.reduce((sum, s) => sum + (s.engagement_score || 0), 0);
  const avgRank = (() => {
    const ranked = submissions.filter(s => s.peak_rank);
    if (ranked.length === 0) return null;
    return Math.round(ranked.reduce((sum, s) => sum + (s.peak_rank || 0), 0) / ranked.length);
  })();

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
          {profile.is_verified && <VerifiedBadge size={18} />}
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
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Trophy size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{bestPeakRank ? `#${bestPeakRank}` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Peak Rank</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Flame size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{Math.round(bestCycleScore)}</p>
              <p className="text-[10px] text-muted-foreground">Best Score</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <TrendingUp size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{Math.round(lifetimeImpact)}</p>
              <p className="text-[10px] text-muted-foreground">Impact</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <RotateCcw size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{totalCycles}</p>
              <p className="text-[10px] text-muted-foreground">Cycles</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Star size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{avgRank ? `#${avgRank}` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">Avg Rank</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <Target size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{submissions.length}</p>
              <p className="text-[10px] text-muted-foreground">Songs</p>
            </div>
          </div>
        )}

        {/* Active Submission Spotlight */}
        {liveSubmission && (
          <Card className="glass-card border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {liveSubmission.album_art_url && (
                    <img src={liveSubmission.album_art_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{liveSubmission.track_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <SubmissionBadge status="live" expiresAt={liveSubmission.expires_at} compact />
                      {liveSubmission.peak_rank && (
                        <span className="text-xs text-muted-foreground">Rank #{liveSubmission.peak_rank}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/song/${liveSubmission.id}`)}>
                  View
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submission Record */}
        {submissions.length > 0 && (
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Submission Record</CardTitle>
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
                      <div className="flex items-center gap-2 mt-0.5">
                        <SubmissionBadge status={s.status} expiresAt={s.expires_at} cooldownUntil={s.cooldown_until} compact />
                        <span className="text-[10px] text-muted-foreground">Cycle {s.cycle_number}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold text-primary">{Math.round(s.engagement_score)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {s.peak_rank ? `Peak #${s.peak_rank}` : "—"}
                    </p>
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
