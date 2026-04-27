import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDmContext } from "@/hooks/useDmContext";
import { ProfileTopBar } from "@/components/profile/ProfileTopBar";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileSocials } from "@/components/profile/ProfileSocials";
import { HookSection } from "@/components/profile/HookSection";
import { MomentumStrip } from "@/components/profile/MomentumStrip";
import { CatalogGrid } from "@/components/profile/CatalogGrid";
import { VoiceStrip } from "@/components/profile/VoiceStrip";
import { FmlyFabric } from "@/components/profile/FmlyFabric";
import { CareerFooter } from "@/components/profile/CareerFooter";
import type { ProfileSong, ProfileRecord } from "@/components/profile/types";
import { useProfileData } from "@/hooks/useProfileData";
import { useFmlyFabric } from "@/hooks/useFmlyFabric";

const LOADING = (
  <div className="min-h-screen flex items-center justify-center pt-20">
    <p className="text-muted-foreground">Loading profile…</p>
  </div>
);

const SAVE_DELAY = 600;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return null;
  }
};

export default function PublicProfile() {
  const { userId: routeUserId } = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const { openCompose } = useDmContext();

  const viewedUserId = routeUserId ?? user?.id ?? null;
  const isOwner = Boolean(user?.id && viewedUserId && user.id === viewedUserId);
  const fromMenu = Boolean((location.state as { fromMenu?: boolean } | null)?.fromMenu);

  const { loading, notFound, profile, songs, featuredSong, voiceLines, momentum, career, heroTint } = useProfileData(viewedUserId);
  const { topSupporters, whoTheyBack, mutuals, recentLocks } = useFmlyFabric(viewedUserId, user?.id ?? null);

  const [editing, setEditing] = useState(false);
  const [draftProfile, setDraftProfile] = useState<ProfileRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const [lockedInCount, setLockedInCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftProfile(profile);
  }, [profile]);

  useEffect(() => {
    let canceled = false;
    async function checkLockedState() {
      if (!viewedUserId) return;
      if (!user || user.id === viewedUserId) {
        setIsLocked(false);
        return;
      }
      const { count } = await supabase
        .from("release_subscriptions")
        .select("id", { head: true, count: "exact" })
        .eq("artist_user_id", viewedUserId)
        .eq("subscriber_user_id", user.id);
      if (!canceled) setIsLocked((count ?? 0) > 0);
    }
    void checkLockedState();
    return () => {
      canceled = true;
    };
  }, [user, viewedUserId]);

  useEffect(() => {
    setLockedInCount(momentum.lockedInCount);
  }, [momentum.lockedInCount]);

  const openSong = (song: ProfileSong) => {
    const lyricPath = song.lyric_projects?.artist_slug && song.lyric_projects?.url_slug
      ? `/${song.lyric_projects.artist_slug}/${song.lyric_projects.url_slug}/lyric-dance`
      : `/song/${song.id}`;
    navigate(lyricPath);
  };

  const visibleSongs = useMemo(() => {
    const source = isOwner ? songs : songs.filter((song) => song.status === "live");
    const filtered = featuredSong ? source.filter((song) => song.id !== featuredSong.id) : source;
    if (isOwner) return filtered;
    return [...filtered].sort((a, b) => (b.fires_count ?? 0) - (a.fires_count ?? 0));
  }, [isOwner, songs, featuredSong]);

  const updateProfileDraft = (patch: Partial<ProfileRecord>) => {
    setDraftProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    if (!user || !isOwner) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      refreshProfile();
    }, SAVE_DELAY);
  };

  const handleLockToggle = async () => {
    if (!viewedUserId) return;
    if (!user) {
      navigate(`/auth?intent=drop_alert&artist=${viewedUserId}`);
      return;
    }
    if (user.id === viewedUserId || isLocked === null) return;

    if (isLocked) {
      setIsLocked(false);
      setLockedInCount((count) => Math.max(0, count - 1));
      const { error } = await supabase
        .from("release_subscriptions")
        .delete()
        .eq("artist_user_id", viewedUserId)
        .eq("subscriber_user_id", user.id);
      if (error) {
        setIsLocked(true);
        setLockedInCount((count) => count + 1);
        toast.error(error.message);
        return;
      }
      toast.success("Unlocked.");
      return;
    }

    setIsLocked(true);
    setLockedInCount((count) => count + 1);
    const { error } = await supabase.from("release_subscriptions").insert({
      artist_user_id: viewedUserId,
      subscriber_user_id: user.id,
    });

    if (error) {
      setIsLocked(false);
      setLockedInCount((count) => Math.max(0, count - 1));
      toast.error(error.message);
      return;
    }

    toast.success("Locked in for next drop.");
  };

  const handleAvatarUpload: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user || !isOwner) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/avatar.${ext}`;

    setUploading(true);
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setUploading(false);
      toast.error(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    updateProfileDraft({ avatar_url: avatarUrl });
    toast.success("Avatar updated.");
  };

  if (!routeUserId && authLoading) return LOADING;
  if (!viewedUserId) return <Navigate to="/auth" replace />;
  if (notFound) return <div className="min-h-screen pt-20 flex items-center justify-center text-muted-foreground">Profile not found.</div>;
  if (loading || !profile || !draftProfile) return LOADING;

  const ownerAvatarFallback = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const avatarUrl = isOwner ? draftProfile.avatar_url || ownerAvatarFallback : draftProfile.avatar_url;

  return (
    <div className="px-4 py-6">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <div className="max-w-4xl mx-auto space-y-4">
        <ProfileTopBar
          name={draftProfile.display_name ?? "Artist"}
          isOwner={isOwner}
          fromMenu={fromMenu}
          editing={editing}
          lockedInCount={lockedInCount}
          isLocked={isLocked}
          onBack={() => navigate(-1)}
          onEditToggle={() => setEditing((value) => !value)}
          onLockToggle={handleLockToggle}
        />

        <ProfileHero
          userId={viewedUserId}
          displayName={draftProfile.display_name ?? ""}
          bio={draftProfile.bio ?? ""}
          avatarUrl={avatarUrl ?? undefined}
          isVerified={draftProfile.is_verified}
          tintColor={heroTint}
          isOwner={isOwner}
          editing={editing}
          uploading={uploading}
          onNameChange={(value) => updateProfileDraft({ display_name: value })}
          onBioChange={(value) => updateProfileDraft({ bio: value })}
          onAvatarClick={() => fileInputRef.current?.click()}
        />

        <ProfileSocials
          profile={draftProfile}
          isOwner={isOwner}
          editing={editing}
          onSocialChange={(key, value) => updateProfileDraft({ [key]: normalizeUrl(value) } as Partial<ProfileRecord>)}
          onDm={() => viewedUserId && openCompose(viewedUserId)}
        />

        <HookSection
          song={featuredSong}
          isOwner={isOwner}
          onOpenSong={openSong}
          onCreateFirstSong={() => navigate("/the-director?mode=song")}
        />
        <MomentumStrip momentum={{ ...momentum, lockedInCount }} />
        <CatalogGrid songs={visibleSongs} isOwner={isOwner} onOpenSong={openSong} />
        <VoiceStrip lines={voiceLines} isOwner={isOwner} onOpenPost={(postId) => navigate(`/song/${postId}`)} />

        <FmlyFabric
          isOwner={isOwner}
          topSupporters={topSupporters}
          whoTheyBack={whoTheyBack}
          mutuals={mutuals}
          recentLocks={recentLocks}
          onOpenPerson={(personId) => navigate(`/u/${personId}`)}
        />

        <CareerFooter stats={career} />
      </div>
    </div>
  );
}
