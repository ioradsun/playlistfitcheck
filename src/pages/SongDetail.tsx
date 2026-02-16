import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trophy, Target, TrendingUp, RotateCcw, Flame } from "lucide-react";
import { LazySpotifyEmbed } from "@/components/songfit/LazySpotifyEmbed";
import { SubmissionBadge } from "@/components/songfit/SubmissionBadge";
import { SongFitComments } from "@/components/songfit/SongFitComments";
import type { SongFitPost, CycleHistory } from "@/components/songfit/types";

const SongDetail = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<SongFitPost | null>(null);
  const [cycles, setCycles] = useState<CycleHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    Promise.all([
      supabase
        .from("songfit_posts")
        .select("*, profiles:user_id(display_name, avatar_url, spotify_artist_id)")
        .eq("id", postId)
        .single(),
      supabase
        .from("songfit_cycle_history")
        .select("*")
        .eq("post_id", postId)
        .order("cycle_number", { ascending: true }),
    ]).then(([postRes, cyclesRes]) => {
      if (postRes.data) setPost(postRes.data as unknown as SongFitPost);
      if (cyclesRes.data) setCycles(cyclesRes.data as unknown as CycleHistory[]);
      setLoading(false);
    });
  }, [postId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Song not found.</p>
      </div>
    );
  }

  const totalCycles = cycles.length + 1; // current + history
  const lifetimeScore = cycles.reduce((sum, c) => sum + c.final_engagement_score, 0) + post.engagement_score;
  const bestCycleScore = Math.max(post.engagement_score, ...cycles.map(c => c.final_engagement_score));
  const bestPeakRank = Math.min(
    post.peak_rank ?? Infinity,
    ...cycles.map(c => c.peak_rank ?? Infinity)
  );

  return (
    <div className="px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{post.track_title}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {post.track_artists_json?.map(a => a.name).join(", ")}
            </p>
          </div>
          <SubmissionBadge status={post.status} expiresAt={post.expires_at} cooldownUntil={post.cooldown_until} />
        </div>

        {/* Embed */}
        <LazySpotifyEmbed
          trackId={post.spotify_track_id}
          trackTitle={post.track_title}
          trackUrl={post.spotify_track_url}
          postId={post.id}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass-card border-border">
            <CardContent className="p-4 text-center">
              <Trophy size={16} className="mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{bestPeakRank === Infinity ? "—" : `#${bestPeakRank}`}</p>
              <p className="text-[10px] text-muted-foreground">Peak Rank</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border">
            <CardContent className="p-4 text-center">
              <Flame size={16} className="mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{Math.round(bestCycleScore)}</p>
              <p className="text-[10px] text-muted-foreground">Best Score</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border">
            <CardContent className="p-4 text-center">
              <RotateCcw size={16} className="mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{totalCycles}</p>
              <p className="text-[10px] text-muted-foreground">Cycles</p>
            </CardContent>
          </Card>
        </div>

        {/* Current Cycle */}
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={16} /> Current Cycle #{post.cycle_number}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Engagement Score</span>
              <span className="font-mono font-bold">{Math.round(post.engagement_score)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Impressions</span>
              <span className="font-mono">{post.impressions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Peak Rank</span>
              <span className="font-mono">{post.peak_rank ? `#${post.peak_rank}` : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Likes</span>
              <span className="font-mono">{post.likes_count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Comments</span>
              <span className="font-mono">{post.comments_count}</span>
            </div>
          </CardContent>
        </Card>

        {/* Lifetime Impact */}
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={16} /> Lifetime Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{Math.round(lifetimeScore)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total engagement across {totalCycles} cycle{totalCycles > 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        {/* Cycle History */}
        {cycles.length > 0 && (
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Submission History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cycles.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <div>
                    <p className="text-sm font-medium">Cycle #{c.cycle_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.started_at).toLocaleDateString()} – {new Date(c.ended_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold">{Math.round(c.final_engagement_score)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.peak_rank ? `Peak #${c.peak_rank}` : "Unranked"}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Comments link */}
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{post.comments_count} comment{post.comments_count !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SongDetail;
