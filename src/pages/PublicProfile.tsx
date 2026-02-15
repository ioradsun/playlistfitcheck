import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, ExternalLink, Pencil, Wallet } from "lucide-react";
import { MusicEmbed } from "@/components/MusicEmbed";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";

interface PublicProfile {
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  spotify_embed_url: string | null;
  wallet_address: string | null;
}

interface PublicSearch {
  id: string;
  playlist_name: string | null;
  playlist_url: string | null;
  health_score: number | null;
  health_label: string | null;
  created_at: string;
}

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [searches, setSearches] = useState<PublicSearch[]>([]);
  const [notFound, setNotFound] = useState(false);

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (!userId) return;
    // If viewing own profile, redirect to /profile
    if (isOwner) { navigate("/profile"); return; }

    supabase.from("profiles").select("display_name, bio, avatar_url, spotify_embed_url, wallet_address").eq("id", userId).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return; }
        setProfile(data as PublicProfile);
      });
    supabase.from("user_roles").select("role").eq("user_id", userId)
      .then(({ data }) => { setRoles(data?.map((r: any) => r.role) ?? []); });
    supabase.from("saved_searches").select("id, playlist_name, playlist_url, health_score, health_label, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setSearches(data as PublicSearch[]); });
  }, [userId, isOwner, navigate]);

  const isArtist = roles.includes("artist");
  const hasMusic = profile?.spotify_embed_url && isMusicUrl(profile.spotify_embed_url);
  const embedUrl = profile?.spotify_embed_url ?? null;
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
    <div className="min-h-screen bg-background pt-20 px-4 pb-12">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Avatar className="h-20 w-20 border-2 border-border">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{profile.display_name || "User"}</h1>
            <p className="text-sm text-muted-foreground capitalize">{roles[0] ?? "user"}</p>
            {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
            {profile.wallet_address && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-mono">
                <Wallet size={12} />
                {profile.wallet_address.slice(0, 6)}…{profile.wallet_address.slice(-4)}
              </p>
            )}
          </div>
        </div>

        {/* Music embed */}
        {hasMusic && embedUrl && (
          <Card className="glass-card border-border overflow-hidden">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Music size={18} /> Music</CardTitle></CardHeader>
            <CardContent>
              <MusicEmbed url={embedUrl} title={`${getPlatformLabel(embedUrl)} embed`} />
            </CardContent>
          </Card>
        )}

        {/* Recent searches */}
        {searches.length > 0 && (
          <Card className="glass-card border-border">
            <CardHeader><CardTitle className="text-lg">Recent PlaylistFit Checks</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {searches.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.playlist_name || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono font-bold text-primary">{s.health_score ?? "—"}</span>
                      {s.playlist_url && (
                        <a href={s.playlist_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
