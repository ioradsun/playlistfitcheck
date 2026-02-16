import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Wallet, ArrowLeft, Music } from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";
import { useSiteCopy } from "@/hooks/useSiteCopy";

interface PublicProfile {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_embed_url: string | null;
  wallet_address: string | null;
}

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { features } = useSiteCopy();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [notFound, setNotFound] = useState(false);

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (!userId) return;

    supabase.from("profiles").select("display_name, bio, avatar_url, spotify_embed_url, wallet_address").eq("id", userId).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return; }
        setProfile(data as PublicProfile);
      });
    supabase.from("user_roles").select("role").eq("user_id", userId)
      .then(({ data }) => { setRoles(data?.map((r: any) => r.role) ?? []); });
  }, [userId]);

  const hasMusic = profile?.spotify_embed_url && isMusicUrl(profile.spotify_embed_url);
  const initials = (profile?.display_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

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
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-xl font-semibold truncate">{profile.display_name || "User"}</h1>
          {isOwner && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-auto" asChild>
              <Link to="/profile"><Pencil size={14} /> Edit</Link>
            </Button>
          )}
        </div>

        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20 border-2 border-border">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground capitalize">{roles[0] ?? "user"}</p>
              <TrailblazerBadge userId={userId} />
            </div>
            {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
            {hasMusic && (
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
            {features.crypto_tipping && profile.wallet_address && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                <Wallet size={12} />
                {profile.wallet_address.slice(0, 6)}…{profile.wallet_address.slice(-4)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;
