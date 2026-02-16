import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Wallet, ArrowLeft, Music, Trophy, Flame, RotateCcw, TrendingUp, Star, Target } from "lucide-react";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { SubmissionBadge } from "@/components/songfit/SubmissionBadge";
import { isMusicUrl, getPlatformLabel } from "@/lib/platformUtils";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import type { SongFitPost } from "@/components/songfit/types";

interface PublicProfileData {
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
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<SongFitPost[]>([]);
  const [notFound, setNotFound] = useState(false);

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (!userId) return;

    supabase.from("profiles").select("display_name, bio, avatar_url, spotify_embed_url, wallet_address").eq("id", userId).single()
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

  const hasMusic = profile?.spotify_embed_url && isMusicUrl(profile.spotify_embed_url);
  const initials = (profile?.display_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

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
      </div>
    </div>
  );
};

export default PublicProfile;
