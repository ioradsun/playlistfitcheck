import { useState, useEffect, useRef, type ReactNode } from "react";
import { User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ProfilePreview {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  spotify_artist_id: string | null;
}

interface Props {
  userId: string;
  children: ReactNode;
}

export function ProfileHoverCard({ userId, children }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLDivElement>(null);

  const isOwnProfile = user?.id === userId;

  const fetchProfile = async () => {
    if (profile) return;
    setLoading(true);
    const [profileRes, followersRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_url, bio, spotify_artist_id").eq("id", userId).maybeSingle(),
      supabase.from("songfit_follows").select("id", { count: "exact", head: true }).eq("followed_user_id", userId),
      supabase.from("songfit_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    if (profileRes.data) setProfile(profileRes.data as ProfilePreview);
    setFollowerCount(followersRes.count ?? 0);
    setPostCount(postsRes.count ?? 0);

    if (user && !isOwnProfile) {
      const { data } = await supabase.from("songfit_follows").select("id").eq("follower_user_id", user.id).eq("followed_user_id", userId).maybeSingle();
      setFollowing(!!data);
    }
    setLoading(false);
  };

  const toggleFollow = async () => {
    if (!user) { toast.error("Sign in to follow"); return; }
    setFollowLoading(true);
    try {
      if (following) {
        await supabase.from("songfit_follows").delete().eq("follower_user_id", user.id).eq("followed_user_id", userId);
        setFollowing(false);
        setFollowerCount(c => Math.max(0, c - 1));
      } else {
        await supabase.from("songfit_follows").insert({ follower_user_id: user.id, followed_user_id: userId });
        setFollowing(true);
        setFollowerCount(c => c + 1);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpen(true);
      fetchProfile();
    }, 400);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  const displayName = profile?.display_name || "Anonymous";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {open && (
        <div
          ref={cardRef}
          onMouseEnter={() => clearTimeout(timeoutRef.current)}
          onMouseLeave={handleMouseLeave}
          className="absolute left-0 top-full mt-1 z-[200] w-72 bg-card border border-border rounded-xl shadow-2xl p-4 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {loading && !profile ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : profile ? (
            <div className="space-y-3">
              {/* Top row: avatar + follow */}
              <div className="flex items-start justify-between">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => navigate(`/u/${userId}`)}
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-primary/20">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate leading-tight">{displayName}</p>
                    {profile.spotify_artist_id && (
                      <p className="text-[11px] text-primary font-medium">Artist</p>
                    )}
                  </div>
                </div>
                {!isOwnProfile && following !== null && (
                  <Button
                    size="sm"
                    variant={following ? "outline" : "default"}
                    className="h-8 px-4 rounded-full text-xs font-bold shrink-0"
                    onClick={toggleFollow}
                    disabled={followLoading}
                  >
                    {followLoading ? <Loader2 size={12} className="animate-spin" /> : following ? "Following" : "Follow"}
                  </Button>
                )}
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{profile.bio}</p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <span><span className="font-bold text-foreground">{postCount}</span> <span className="text-muted-foreground">posts</span></span>
                <span><span className="font-bold text-foreground">{followerCount}</span> <span className="text-muted-foreground">followers</span></span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
