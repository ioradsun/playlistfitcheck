import { useEffect, useRef, useCallback, useState } from "react";
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
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
  Camera, X, Check, Loader2, Flame, MessageCircle, BarChart2, Sparkles,
} from "lucide-react";
import { FmlyBadge } from "@/components/FmlyBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ConnectWalletButton } from "@/components/crypto/ConnectWalletButton";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import type { FmlyPost } from "@/components/fmly/types";

type VoiceLine =
  | { kind: "fire"; actor: string; postId: string; songTitle: string; ts: string }
  | { kind: "comment"; actor: string; postId: string; songTitle: string; content: string; ts: string };

interface PublicProfileData {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_embed_url: string | null;
  wallet_address: string | null;
  is_verified: boolean;
}

interface ProfileViewState {
  loading: boolean;
  notFound: boolean;
  profile: PublicProfileData | null;
  roles: string[];
  submissions: FmlyPost[];
  voiceLines: VoiceLine[];
}

const formatRelative = (ts?: string | null) => {
  if (!ts) return "now";
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const LOADING_SHELL = (
  <div className="min-h-screen bg-background pt-20 flex items-center justify-center">
    <p className="text-muted-foreground">Loading…</p>
  </div>
);

const PublicProfile = () => {
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { features } = useSiteCopy();
  const fromMenu = !!(location.state as any)?.fromMenu;

  const viewedUserId = routeUserId ?? user?.id ?? null;
  const isOwner = !!(viewedUserId && user?.id === viewedUserId);

  const [viewState, setViewState] = useState<ProfileViewState>({
    loading: true,
    notFound: false,
    profile: null,
    roles: [],
    submissions: [],
    voiceLines: [],
  });
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const [lockedInCount, setLockedInCount] = useState<number>(0);

  // Owner editing state
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(() => "");
  const [bio, setBio] = useState(() => "");
  const [spotifyUrl, setSpotifyUrl] = useState(() => "");
  const [uploading, setUploading] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async () => {
      if (!viewedUserId) {
        return;
      }

      setViewState(prev => ({ ...prev, loading: true, notFound: false }));

      const postsPromise = supabase
        .from("feed_posts" as any)
        .select("*")
        .eq("user_id", viewedUserId)
        .order("created_at", { ascending: false })
        .limit(50);

      const firesPromise = postsPromise.then((postsRes) => {
        const posts = (postsRes.data as unknown as FmlyPost[]) ?? [];
        const postIds = posts.map((s) => s.id);
        if (postIds.length === 0) return { data: [], error: null };
        return supabase
          .from("feed_likes")
          .select("user_id, post_id, created_at, profiles:user_id(display_name)")
          .in("post_id", postIds)
          .order("created_at", { ascending: false })
          .limit(5);
      });

      const commentsPromise = postsPromise.then((postsRes) => {
        const posts = (postsRes.data as unknown as FmlyPost[]) ?? [];
        const postIds = posts.map((s) => s.id);
        if (postIds.length === 0) return { data: [], error: null };
        return supabase
          .from("feed_comments" as any)
          .select("user_id, post_id, content, created_at, profiles:user_id(display_name)")
          .in("post_id", postIds)
          .order("created_at", { ascending: false })
          .limit(5);
      });

      const [profileRes, rolesRes, postsRes, lockedCountRes, lockStateRes, recentFiresRes, recentCommentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, bio, avatar_url, spotify_embed_url, wallet_address, is_verified")
          .eq("id", viewedUserId)
          .single(),
        supabase.from("user_roles").select("role").eq("user_id", viewedUserId),
        postsPromise,
        supabase
          .from("release_subscriptions")
          .select("subscriber_user_id", { count: "exact", head: true })
          .eq("artist_user_id", viewedUserId),
        user && user.id !== viewedUserId
          ? supabase
              .from("release_subscriptions")
              .select("id", { head: true, count: "exact" })
              .eq("artist_user_id", viewedUserId)
              .eq("subscriber_user_id", user.id)
          : Promise.resolve({ count: 0, error: null }),
        firesPromise,
        commentsPromise,
      ]);

      if (isCancelled) return;

      if (profileRes.error || !profileRes.data) {
        setViewState({
          loading: false,
          notFound: true,
          profile: null,
          roles: [],
          submissions: [],
          voiceLines: [],
        });
        return;
      }

      const submissions = (postsRes.data as unknown as FmlyPost[]) ?? [];
      const roles = rolesRes.data?.map((r: any) => r.role) ?? [];
      const postById = new Map(submissions.map((s) => [s.id, s]));

      const voiceLines: VoiceLine[] = [];
      for (const fire of recentFiresRes.data ?? []) {
        if (!fire?.post_id || !fire?.user_id || fire.user_id === viewedUserId) continue;
        const submission = postById.get(fire.post_id);
        const actor = (fire as any)?.profiles?.display_name?.trim();
        if (!actor) continue;
        voiceLines.push({
          kind: "fire",
          actor,
          postId: fire.post_id,
          songTitle: submission?.lyric_projects?.title ?? submission?.caption ?? "—",
          ts: fire.created_at,
        });
      }
      for (const comment of recentCommentsRes.data ?? []) {
        if (!comment?.post_id || !comment?.user_id || comment.user_id === viewedUserId) continue;
        const submission = postById.get(comment.post_id);
        const actor = (comment as any)?.profiles?.display_name?.trim();
        if (!actor) continue;
        voiceLines.push({
          kind: "comment",
          actor,
          postId: comment.post_id,
          songTitle: submission?.lyric_projects?.title ?? submission?.caption ?? "—",
          content: comment.content ?? "",
          ts: comment.created_at,
        });
      }
      voiceLines.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

      setViewState({
        loading: false,
        notFound: false,
        profile: profileRes.data as PublicProfileData,
        roles,
        submissions,
        voiceLines: voiceLines.slice(0, 3),
      });
      setLockedInCount(lockedCountRes.count ?? 0);
      setIsLocked(user && user.id !== viewedUserId ? (lockStateRes.count ?? 0) > 0 : false);

      if (isOwner) {
        setDisplayName(profileRes.data.display_name ?? "");
        setBio(profileRes.data.bio ?? "");
        setSpotifyUrl(profileRes.data.spotify_embed_url ?? "");
      }
    };

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [viewedUserId, isOwner, user]);

  const handleDropToggle = useCallback(async () => {
    if (!viewedUserId) return;
    if (!user) {
      navigate(`/auth?intent=drop_alert&artist=${viewedUserId}`);
      return;
    }
    if (user.id === viewedUserId || isLocked === null) return;

    if (isLocked) {
      setIsLocked(false);
      setLockedInCount((c) => Math.max(0, c - 1));
      const { error } = await supabase
        .from("release_subscriptions")
        .delete()
        .eq("artist_user_id", viewedUserId)
        .eq("subscriber_user_id", user.id);
      if (error) {
        setIsLocked(true);
        setLockedInCount((c) => c + 1);
        toast.error(error.message);
      }
      return;
    }

    setIsLocked(true);
    setLockedInCount((c) => c + 1);
    const { error } = await supabase.from("release_subscriptions").insert({
      subscriber_user_id: user.id,
      artist_user_id: viewedUserId,
    });
    if (error) {
      setIsLocked(false);
      setLockedInCount((c) => Math.max(0, c - 1));
      toast.error(error.message);
    }
  }, [isLocked, navigate, user, viewedUserId]);

  // Auto-save for owner
  const autoSave = useCallback((fields: { display_name?: string; bio?: string; spotify_embed_url?: string }) => {
    if (!user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
      if (error) {
        toast.error(error.message);
        setAutoSaveStatus("idle");
      } else {
        setAutoSaveStatus("saved");
        refreshProfile();
        setViewState(prev => ({
          ...prev,
          profile: prev.profile ? { ...prev.profile, ...fields } : prev.profile,
        }));
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
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) {
      toast.error(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setUploading(false);
    if (updateErr) {
      toast.error(updateErr.message);
    } else {
      toast.success("Avatar updated!");
      refreshProfile();
      setViewState(prev => ({
        ...prev,
        profile: prev.profile ? { ...prev.profile, avatar_url: avatarUrl } : prev.profile,
      }));
    }
  };

  if (!routeUserId && authLoading) {
    return LOADING_SHELL;
  }

  if (!viewedUserId) {
    return <Navigate to="/auth" replace />;
  }

  if (viewState.notFound) {
    return (
      <div className="min-h-screen bg-background pt-20 flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found.</p>
      </div>
    );
  }

  if (viewState.loading || !viewState.profile) {
    return LOADING_SHELL;
  }

  const { profile, roles, submissions, voiceLines } = viewState;
  const sortedSubmissions = isOwner
    ? submissions
    : [...submissions].sort((a, b) => (b.fires_count ?? 0) - (a.fires_count ?? 0));
  const hasMusic = profile.spotify_embed_url && isMusicUrl(profile.spotify_embed_url);
  const initials = (profile.display_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Google avatar fallback for owner
  const googleAvatar = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const avatarSrc = isOwner
    ? (profile.avatar_url || googleAvatar || undefined)
    : (profile.avatar_url ?? undefined);

  const bestPeakRank = submissions.reduce((best, s) => {
    const rank = s.peak_rank;
    if (rank && (best === null || rank < best)) return rank;
    return best;
  }, null as number | null);
  const totalFires = submissions.reduce((sum, s) => sum + (s.fires_count ?? 0), 0);
  const totalComments = submissions.reduce((sum, s) => sum + (s.comments_count ?? 0), 0);

  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          {!(isOwner && fromMenu) && (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} strokeWidth={1.5} />
            </Button>
          )}
          <h1 className="text-xl font-semibold truncate">{profile.display_name || "User"}</h1>
          {isOwner && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                🔔 {lockedInCount} <span className="text-muted-foreground/60">locked in</span>
              </span>
              {profile.is_verified && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => navigate(`/artist/${profile.display_name?.toLowerCase().replace(/\s+/g, "-") || viewedUserId}`)}
                >
                  <Sparkles size={13} />
                  ME
                </Button>
              )}
              <Button
                variant={editing ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setEditing(!editing)}
              >
                {editing ? <><X size={14} /> Cancel</> : <><Pencil size={14} /> Edit</>}
              </Button>
            </div>
          )}
          {!isOwner && (
            <div className="ml-auto">
              <Button
                variant={isLocked ? "secondary" : "outline"}
                size="sm"
                className={isLocked
                  ? "gap-1.5 bg-[#00FF78]/10 text-[#00FF78] border-[#00FF78]/30 hover:bg-[#00FF78]/15"
                  : "gap-1.5"}
                onClick={handleDropToggle}
                disabled={isLocked === null}
              >
                {isLocked
                  ? <><span>Locked in</span> <Check size={14} /></>
                  : <>🔔 Next drop</>}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-start gap-4">
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarSrc} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            {profile.is_verified && (
              <span className="absolute -bottom-1 -right-1"><VerifiedBadge size={18} /></span>
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
              <FmlyBadge userId={viewedUserId} />
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

        {submissions.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bestPeakRank ? 4 : 3}, minmax(0, 1fr))` }}>
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
              <Flame size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{totalFires}</p>
              <p className="text-[10px] text-muted-foreground">Fires</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border">
              <MessageCircle size={14} className="mx-auto mb-1 text-primary" />
              <p className="text-base font-bold">{totalComments}</p>
              <p className="text-[10px] text-muted-foreground">Comments</p>
            </div>
          </div>
        )}

        {voiceLines.length > 0 && (
          <div className="space-y-1.5 px-1">
            {voiceLines.map((line, i) => (
              <button
                key={`${line.postId}-${line.kind}-${i}`}
                onClick={() => navigate(`/song/${line.postId}`)}
                className="w-full text-left text-[11px] font-mono text-muted-foreground/70 hover:text-foreground transition-colors flex items-baseline gap-1.5"
              >
                <span>{line.kind === "fire" ? "🔥" : "💬"}</span>
                <span className="text-foreground/90">@{line.actor}</span>
                {line.kind === "fire" ? (
                  <span>fired</span>
                ) : (
                  <span className="truncate max-w-[180px]">
                    "{line.content.slice(0, 40)}{line.content.length > 40 ? "…" : ""}"
                  </span>
                )}
                <span className="text-foreground/70 truncate flex-1">
                  {line.kind === "fire" ? line.songTitle : ""}
                </span>
                <span className="text-muted-foreground/40 ml-auto shrink-0">
                  {formatRelative(line.ts)}
                </span>
              </button>
            ))}
          </div>
        )}

        {submissions.length > 0 && (
          <Card className="glass-card border-border overflow-hidden">
            <div className="px-4 pt-4 pb-0 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BarChart2 size={14} className="text-primary" />
                <span className="text-xs font-bold tracking-widest uppercase text-primary">CrowdFit</span>
              </div>
            </div>

            <CardHeader className="pt-3 pb-1">
              <CardTitle className="text-base">Songs</CardTitle>
            </CardHeader>

            <CardContent className="pt-1 pb-4 space-y-2">
              {sortedSubmissions.map(s => {
                const peakRank = s.peak_rank;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/fmly?artist=${viewedUserId}`)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/80 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {s.lyric_projects?.album_art_url && (
                        <img src={s.lyric_projects.album_art_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.lyric_projects?.title ?? s.caption}</p>
                        <div className="flex items-center gap-2.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground capitalize">{s.status}</span>
                          <span className="text-[10px] text-muted-foreground/40">·</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            🔥 <span className="text-foreground font-semibold">{s.fires_count ?? 0}</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            💬 <span className="text-foreground font-semibold">{s.comments_count ?? 0}</span>
                          </span>
                          {peakRank && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              #<span className="text-foreground font-semibold">{peakRank}</span>
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">
                            · {formatRelative(s.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {peakRank && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-bold text-primary">#{peakRank}</p>
                        <p className="text-[10px] text-muted-foreground">Peak</p>
                      </div>
                    )}
                  </button>
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
