import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ExternalLink, Loader2, Music } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";

interface PostRow {
  id: string;
  title: string;
  album_art_url: string | null;
  created_at: string;
  impressions: number;
  likes_count: number;
  comments_count: number;
  tips_total: number;
  engagement_score: number;
  spotify_track_id: string | null;
  spotify_track_url: string | null;
  project_id: string | null;
  lyric_dance_url: string | null;
  status: string;
}


interface ListenerIntelligence {
  totalUniqueSessions: number;
  sessionsMultipleSongs: number;
  sessionsSuperFan: number;
  songOverlap: Array<{ songA: string; songB: string; titleA: string; titleB: string; shared: number }>;
  perSong: Record<
    string,
    {
      exposureSessions: number;
      fireSessions: number;
      closingSessions: number;
      commentSessions: number;
      repeatListeners: number;
      avgFiresPerSession: number;
      deepListeners: number;
    }
  >;
}

async function fetchListenerIntelligence(
  danceIds: string[],
  danceTitles: Record<string, string>,
): Promise<ListenerIntelligence> {
  if (danceIds.length === 0) {
    return {
      totalUniqueSessions: 0,
      sessionsMultipleSongs: 0,
      sessionsSuperFan: 0,
      songOverlap: [],
      perSong: {},
    };
  }

  const [firesRes, exposuresRes, closingRes, commentsRes] = await Promise.all([
    supabase
      .from("project_fires" as any)
      .select("project_id, session_id, line_index, created_at")
      .in("project_id", danceIds),
    supabase.from("project_exposures" as any).select("project_id, session_id").in("project_id", danceIds),
    supabase.from("project_closing_picks" as any).select("project_id, session_id").in("project_id", danceIds),
    supabase.from("project_comments" as any).select("project_id, session_id").in("project_id", danceIds),
  ]);

  const fires = (firesRes.data ?? []) as any[];
  const exposures = (exposuresRes.data ?? []) as any[];
  const closings = (closingRes.data ?? []) as any[];
  const comments = (commentsRes.data ?? []) as any[];

  const allSessions = new Set<string>();
  const sessionSongs = new Map<string, Set<string>>();

  for (const row of [...fires, ...exposures]) {
    if (!row.session_id) continue;
    allSessions.add(row.session_id);
    if (!sessionSongs.has(row.session_id)) sessionSongs.set(row.session_id, new Set());
    sessionSongs.get(row.session_id)?.add(row.project_id);
  }

  let sessionsMultipleSongs = 0;
  let sessionsSuperFan = 0;
  for (const songs of sessionSongs.values()) {
    if (songs.size >= 2) sessionsMultipleSongs++;
    if (songs.size >= 3) sessionsSuperFan++;
  }

  const songOverlap: ListenerIntelligence["songOverlap"] = [];
  const danceIdArray = [...new Set(danceIds)];
  for (let i = 0; i < danceIdArray.length; i++) {
    for (let j = i + 1; j < danceIdArray.length; j++) {
      const a = danceIdArray[i];
      const b = danceIdArray[j];
      let shared = 0;
      for (const songs of sessionSongs.values()) {
        if (songs.has(a) && songs.has(b)) shared++;
      }
      if (shared > 0) {
        songOverlap.push({
          songA: a,
          songB: b,
          titleA: danceTitles[a] ?? "Unknown",
          titleB: danceTitles[b] ?? "Unknown",
          shared,
        });
      }
    }
  }
  songOverlap.sort((a, b) => b.shared - a.shared);

  const perSong: ListenerIntelligence["perSong"] = {};

  for (const danceId of danceIds) {
    const songFires = fires.filter((f: any) => f.project_id === danceId);
    const songExposures = exposures.filter((e: any) => e.project_id === danceId);
    const songClosings = closings.filter((c: any) => c.project_id === danceId);
    const songComments = comments.filter((c: any) => c.project_id === danceId);

    const exposureSessions = new Set(songExposures.map((e: any) => e.session_id).filter(Boolean)).size;
    const fireSessions = new Set(songFires.map((f: any) => f.session_id).filter(Boolean)).size;
    const closingSessions = new Set(songClosings.map((c: any) => c.session_id).filter(Boolean)).size;
    const commentSessions = new Set(songComments.map((c: any) => c.session_id).filter(Boolean)).size;

    const sessionDays = new Map<string, Set<string>>();
    for (const fire of songFires) {
      if (!fire.session_id || !fire.created_at) continue;
      if (!sessionDays.has(fire.session_id)) sessionDays.set(fire.session_id, new Set());
      sessionDays.get(fire.session_id)?.add(String(fire.created_at).slice(0, 10));
    }
    let repeatListeners = 0;
    for (const days of sessionDays.values()) {
      if (days.size >= 2) repeatListeners++;
    }

    const sessionLines = new Map<string, Set<number>>();
    for (const fire of songFires) {
      if (!fire.session_id || fire.line_index == null) continue;
      if (!sessionLines.has(fire.session_id)) sessionLines.set(fire.session_id, new Set());
      sessionLines.get(fire.session_id)?.add(fire.line_index);
    }
    let deepListeners = 0;
    for (const lines of sessionLines.values()) {
      if (lines.size >= 3) deepListeners++;
    }

    const avgFiresPerSession = fireSessions > 0 ? songFires.length / fireSessions : 0;

    perSong[danceId] = {
      exposureSessions,
      fireSessions,
      closingSessions,
      commentSessions,
      repeatListeners,
      avgFiresPerSession,
      deepListeners,
    };
  }

  return {
    totalUniqueSessions: allSessions.size,
    sessionsMultipleSongs,
    sessionsSuperFan,
    songOverlap,
    perSong,
  };
}

interface SongSignal {
  post: PostRow;
  type: "in_studio" | "now_streaming";
  totalFires: number;
  uniqueListeners: number;
  firesPerListener: number;
  topLine: { text: string; fireCount: number; avgHoldMs: number } | null;
  spotifyClicks: number;
  saves: number;
  commentCount: number;
}

async function fetchPortfolioData(userId: string): Promise<SongSignal[]> {
  const { data: posts } = await supabase
    .from("feed_posts" as any)
    .select(
      "id, title, album_art_url, created_at, impressions, likes_count, comments_count, tips_total, engagement_score, spotify_track_id, spotify_track_url, project_id, lyric_dance_url, status",
    )
    .eq("user_id", userId)
    .eq("status", "live")
    .order("created_at", { ascending: false });

  if (!posts || posts.length === 0) return [];

  const inStudioPosts = posts.filter((p: any) => p.project_id);
  const nowStreamingPosts = posts.filter((p: any) => p.spotify_track_id && !p.project_id);

  const danceIds = inStudioPosts.map((p: any) => p.project_id).filter(Boolean);
  let firesByDance: Record<string, { totalFires: number; uniqueListeners: number }> = {};
  let topLineByDance: Record<string, { text: string; fireCount: number; avgHoldMs: number } | null> = {};

  if (danceIds.length > 0) {
    const { data: fireRows } = await supabase.from("project_fires" as any).select("project_id").in("project_id", danceIds);

    const fireCountMap: Record<string, number> = {};
    for (const row of (fireRows ?? []) as any[]) {
      fireCountMap[row.project_id] = (fireCountMap[row.project_id] ?? 0) + 1;
    }

    const { data: exposureRows } = await supabase
      .from("project_exposures" as any)
      .select("project_id, session_id")
      .in("project_id", danceIds);

    const listenerMap: Record<string, Set<string>> = {};
    for (const row of (exposureRows ?? []) as any[]) {
      if (!listenerMap[row.project_id]) listenerMap[row.project_id] = new Set();
      listenerMap[row.project_id].add(row.session_id);
    }

    for (const danceId of danceIds) {
      const fires = fireCountMap[danceId] ?? 0;
      const listeners = listenerMap[danceId]?.size ?? 0;
      firesByDance[danceId] = { totalFires: fires, uniqueListeners: listeners };
    }

    const { data: strengthRows } = await supabase
      .from("v_fire_strength" as any)
      .select("project_id, line_index, fire_strength, fire_count, avg_hold_ms")
      .in("project_id", danceIds)
      .order("fire_strength", { ascending: false });

    const { data: danceRows } = await supabase.from("lyric_projects" as any).select("id, lines").in("id", danceIds);

    const lyricsMap: Record<string, any[]> = {};
    for (const row of (danceRows ?? []) as any[]) {
      lyricsMap[row.id] = Array.isArray(row.lines) ? row.lines : [];
    }

    const topByDance: Record<string, any> = {};
    for (const row of (strengthRows ?? []) as any[]) {
      if (!topByDance[row.project_id]) topByDance[row.project_id] = row;
    }

    for (const danceId of danceIds) {
      const top = topByDance[danceId];
      if (top) {
        const lines = lyricsMap[danceId] ?? [];
        const lineText = lines[top.line_index]?.text ?? `Line ${top.line_index}`;
        topLineByDance[danceId] = {
          text: lineText,
          fireCount: top.fire_count,
          avgHoldMs: top.avg_hold_ms,
        };
      } else {
        topLineByDance[danceId] = null;
      }
    }
  }

  const nowStreamingIds = nowStreamingPosts.map((p: any) => p.id);
  const engagementByPost: Record<string, { spotifyClicks: number; saves: number }> = {};

  if (nowStreamingIds.length > 0) {
    const { data: events } = await supabase
      .from("songfit_engagement_events" as any)
      .select("post_id, event_type")
      .in("post_id", nowStreamingIds);

    const { data: saveRows } = await supabase.from("feed_saves").select("post_id").in("post_id", nowStreamingIds);

    for (const postId of nowStreamingIds) {
      const clicks = ((events ?? []) as any[]).filter((e: any) => e.post_id === postId && e.event_type === "spotify_click").length;
      const saves = ((saveRows ?? []) as any[]).filter((s: any) => s.post_id === postId).length;
      engagementByPost[postId] = { spotifyClicks: clicks, saves };
    }
  }


  const signals: SongSignal[] = [];

  for (const post of inStudioPosts as unknown as PostRow[]) {
    const danceId = post.project_id!;
    const fires = firesByDance[danceId] ?? { totalFires: 0, uniqueListeners: 0 };
    signals.push({
      post,
      type: "in_studio",
      totalFires: fires.totalFires,
      uniqueListeners: fires.uniqueListeners,
      firesPerListener: fires.uniqueListeners > 0 ? fires.totalFires / fires.uniqueListeners : 0,
      topLine: topLineByDance[danceId] ?? null,
      spotifyClicks: 0,
      saves: 0,
      commentCount: post.comments_count,
    });
  }

  for (const post of nowStreamingPosts as unknown as PostRow[]) {
    const eng = engagementByPost[post.id] ?? { spotifyClicks: 0, saves: 0 };
    signals.push({
      post,
      type: "now_streaming",
      totalFires: 0,
      uniqueListeners: 0,
      firesPerListener: 0,
      topLine: null,
      spotifyClicks: eng.spotifyClicks,
      saves: eng.saves,
      commentCount: post.comments_count,
    });
  }

  signals.sort((a, b) => {
    const scoreA = a.type === "in_studio" ? a.totalFires * 10 : a.spotifyClicks + a.saves * 3 + a.commentCount;
    const scoreB = b.type === "in_studio" ? b.totalFires * 10 : b.spotifyClicks + b.saves * 3 + b.commentCount;
    return scoreB - scoreA;
  });

  return signals;
}

function SongCard({ signal, onClick }: { signal: SongSignal; onClick: () => void }) {
  const { post, type, totalFires, uniqueListeners, firesPerListener, topLine, spotifyClicks, saves, commentCount } = signal;

  const typeLabel = type === "in_studio" ? "In Studio" : "Now Streaming";
  const typeColor = type === "in_studio" ? "text-orange-400" : "text-green-400";

  const holdLabel = topLine
    ? topLine.avgHoldMs < 300
      ? "tap"
      : topLine.avgHoldMs < 1000
        ? "hold"
        : topLine.avgHoldMs < 3000
          ? "deep hold"
          : "sustained"
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-card rounded-xl overflow-hidden transition-all hover:ring-1 hover:ring-primary/20 active:scale-[0.99]"
    >
      <div className="flex gap-3 p-3">
        {post.album_art_url ? (
          <img src={post.album_art_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            <Music size={18} className="text-white/20" />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          <div>
            <p className="text-[13px] font-medium text-foreground truncate">{post.title}</p>
            <p className={`text-[9px] font-mono uppercase tracking-wider ${typeColor}`}>{typeLabel}</p>
          </div>

          {type === "in_studio" && (
            <div className="flex items-center gap-3 flex-wrap">
              {totalFires > 0 && <span className="text-[10px] font-mono text-orange-400/80">🔥 {totalFires}</span>}
              {uniqueListeners > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {uniqueListeners} listener{uniqueListeners !== 1 ? "s" : ""}
                </span>
              )}
              {firesPerListener >= 1.5 && (
                <span className="text-[9px] font-mono text-muted-foreground/50">{firesPerListener.toFixed(1)}/listener</span>
              )}
            </div>
          )}
          {type === "now_streaming" && (
            <div className="flex items-center gap-3 flex-wrap">
              {spotifyClicks > 0 && <span className="text-[10px] font-mono text-muted-foreground">{spotifyClicks} clicks</span>}
              {saves > 0 && <span className="text-[10px] font-mono text-muted-foreground">{saves} saves</span>}
              {commentCount > 0 && <span className="text-[10px] font-mono text-muted-foreground">{commentCount} comments</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ArtistDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [signals, setSignals] = useState<SongSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [followCount, setFollowCount] = useState(0);
  const [followerTimeline, setFollowerTimeline] = useState<Array<{ day: string; count: number }>>([]);
  const [engagementTimeline, setEngagementTimeline] = useState<Array<{ day: string; fires: number; events: number }>>([]);
  const [listenerIntel, setListenerIntel] = useState<ListenerIntelligence | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetchPortfolioData(user.id),
      supabase.from("songfit_follows").select("id", { count: "exact", head: true }).eq("followed_user_id", user.id),
      supabase.from("songfit_follows").select("created_at").eq("followed_user_id", user.id).order("created_at", { ascending: true }),
    ]).then(([data, follows, followRows]) => {
      setSignals(data);
      setFollowCount(follows.count ?? 0);

      // Build follower growth timeline
      const days = new Map<string, number>();
      let cumulative = 0;
      for (const row of ((followRows.data ?? []) as any[])) {
        const day = row.created_at.slice(0, 10);
        cumulative++;
        days.set(day, cumulative);
      }
      setFollowerTimeline(Array.from(days.entries()).map(([day, count]) => ({ day, count })));

      const inStudioSignals = data.filter((s) => s.type === "in_studio" && s.post.project_id);
      const ids = inStudioSignals.map((s) => s.post.project_id!);
      const titleMap: Record<string, string> = {};
      for (const s of inStudioSignals) titleMap[s.post.project_id!] = s.post.title;

      if (ids.length > 0) {
        fetchListenerIntelligence(ids, titleMap).then(setListenerIntel);
      } else {
        setListenerIntel(null);
      }

      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user || signals.length === 0) return;
    // Fetch all engagement events for the user's posts
    const postIds = signals.map((s) => s.post.id);
    if (postIds.length === 0) return;

    supabase
      .from("songfit_engagement_events" as any)
      .select("created_at, event_type")
      .in("post_id", postIds)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const days = new Map<string, { fires: number; events: number }>();
        for (const row of ((data ?? []) as any[])) {
          const day = row.created_at.slice(0, 10);
          if (!days.has(day)) days.set(day, { fires: 0, events: 0 });
          const d = days.get(day)!;
          d.events++;
          if (row.event_type === "fire") d.fires++;
        }
        setEngagementTimeline(
          Array.from(days.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, counts]) => ({ day, ...counts })),
        );
      });
  }, [user, signals]);

  const totals = useMemo(() => {
    const fires = signals.reduce((s, sig) => s + sig.totalFires, 0);
    const listeners = signals.reduce((s, sig) => s + sig.uniqueListeners, 0);
    return { fires, listeners, songs: signals.length };
  }, [signals]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground text-sm">Sign in to see your dashboard</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted/30 transition-colors">
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{profile?.display_name || "Your Dashboard"}</h1>
              {profile?.is_verified && <VerifiedBadge size={14} />}
            </div>
            {!loading && (
              <p className="text-[11px] font-mono text-muted-foreground">
                {totals.songs} song{totals.songs !== 1 ? "s" : ""}
                {totals.fires > 0 && <> · {totals.fires} fires</>}
                {totals.listeners > 0 && <> · {totals.listeners} listeners</>}
                {followCount > 0 && <> · {followCount} followers</>}
              </p>
            )}
          </div>
        </div>

        {!loading && signals.length > 0 && totals.fires > 0 && (() => {
          const topSong = signals.find((s) => s.type === "in_studio" && s.totalFires > 0);
          if (!topSong) return null;
          return (
            <div className="glass-card rounded-xl p-4 border border-orange-500/10">
              <p className="text-[12px] text-foreground/70 leading-relaxed">
                {signals.filter((s) => s.totalFires > 0).length === 1
                  ? `"${topSong.post.title}" has all your signal. Share it wider to see what lines connect.`
                  : topSong.totalFires > totals.fires * 0.6
                    ? `"${topSong.post.title}" is your standout — ${Math.round((topSong.totalFires / totals.fires) * 100)}% of your total fires. Double down on sharing it.`
                    : `Your fires are spread across ${signals.filter((s) => s.totalFires > 0).length} songs — your audience connects with your range, not just one moment.`}
              </p>
            </div>
          );
        })()}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground/30" />
          </div>
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Music size={32} className="text-muted-foreground/20" />
            <p className="text-[12px] text-muted-foreground text-center max-w-[240px]">
              Post your first song to CrowdFit to start collecting signal.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Engagement over time */}
            {engagementTimeline.length > 1 && (
              <div className="glass-card rounded-xl p-4 space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">engagement over time</p>
                <div className="flex items-end gap-0.5" style={{ height: 48 }}>
                  {engagementTimeline.map(({ day, events }) => {
                    const max = engagementTimeline.reduce((m, d) => Math.max(m, d.events), 1);
                    const pct = Math.max(6, Math.round((events / max) * 100));
                    return (
                      <div key={day} className="flex-1">
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${pct}%`,
                            minHeight: 3,
                            background: events === max ? "rgba(168,85,247,0.7)" : "rgba(168,85,247,0.3)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] font-mono text-muted-foreground/30">
                  <span>{engagementTimeline[0]?.day.slice(5)}</span>
                  <span>{engagementTimeline[engagementTimeline.length - 1]?.day.slice(5)}</span>
                </div>
                {(() => {
                  const recent = engagementTimeline.slice(-3);
                  const earlier = engagementTimeline.slice(-6, -3);
                  if (recent.length >= 2 && earlier.length >= 2) {
                    const recentAvg = recent.reduce((s, d) => s + d.events, 0) / recent.length;
                    const earlierAvg = earlier.reduce((s, d) => s + d.events, 0) / earlier.length;
                    if (recentAvg > earlierAvg * 1.2) {
                      return <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Your engagement is trending up — keep posting and sharing.</p>;
                    } else if (recentAvg < earlierAvg * 0.5) {
                      return <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Activity has slowed. A fresh post or share could re-ignite it.</p>;
                    }
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Follower growth */}
            {followerTimeline.length > 1 && (
              <div className="glass-card rounded-xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">follower growth</p>
                  <span className="text-[11px] font-mono text-foreground/70">{followCount}</span>
                </div>
                <div className="flex items-end gap-0.5" style={{ height: 40 }}>
                  {followerTimeline.map(({ day, count }) => {
                    const max = followerTimeline[followerTimeline.length - 1]?.count ?? 1;
                    const pct = Math.max(6, Math.round((count / max) * 100));
                    return (
                      <div key={day} className="flex-1">
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${pct}%`,
                            minHeight: 3,
                            background: "rgba(34,197,94,0.4)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] font-mono text-muted-foreground/30">
                  <span>{followerTimeline[0]?.day.slice(5)}</span>
                  <span>{followerTimeline[followerTimeline.length - 1]?.day.slice(5)}</span>
                </div>
              </div>
            )}

            {listenerIntel && listenerIntel.totalUniqueSessions > 0 && (
              <div className="space-y-3">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider px-1">listener intelligence</p>

                <div className="glass-card rounded-xl p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">your audience</p>
                    <span className="text-[11px] font-mono text-foreground/70">{listenerIntel.totalUniqueSessions} total</span>
                  </div>

                  {(() => {
                    const total = listenerIntel.totalUniqueSessions;
                    const multi = listenerIntel.sessionsMultipleSongs;
                    const superFan = listenerIntel.sessionsSuperFan;
                    const oneSong = total - multi;

                    const segments = [
                      { label: "Discovered you", count: oneSong, color: "rgba(150,150,150,0.4)" },
                      ...(multi - superFan > 0
                        ? [{ label: "Exploring", count: multi - superFan, color: "rgba(168,85,247,0.5)" }]
                        : []),
                      ...(superFan > 0 ? [{ label: "Super fans", count: superFan, color: "rgba(255,120,30,0.7)" }] : []),
                    ].filter((segment) => segment.count > 0);

                    return (
                      <>
                        <div className="flex rounded-full overflow-hidden h-3">
                          {segments.map((segment) => (
                            <div
                              key={segment.label}
                              style={{ width: `${Math.max(4, (segment.count / total) * 100)}%`, background: segment.color }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {segments.map((segment) => (
                            <div key={segment.label} className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: segment.color }} />
                              <span className="text-[10px] text-foreground/60">{segment.label}</span>
                              <span className="text-[9px] font-mono text-muted-foreground/40">{segment.count}</span>
                            </div>
                          ))}
                        </div>
                        {total >= 5 && (
                          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                            {superFan > 0
                              ? `${superFan} super fan${superFan !== 1 ? "s" : ""} heard 3+ of your songs. These are the people who'll share your music for you.`
                              : multi > 0
                                ? `${multi} listener${multi !== 1 ? "s" : ""} explored a second song. More releases convert discoverers into fans.`
                                : "Everyone's heard just one song so far. Post more to see who comes back."}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {listenerIntel.songOverlap.length > 0 && (
                  <div className="glass-card rounded-xl p-4 space-y-2.5">
                    <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">listener overlap</p>
                    {listenerIntel.songOverlap.slice(0, 3).map((pair, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className="text-foreground/60 truncate flex-1 min-w-0">{pair.titleA}</span>
                        <span className="text-muted-foreground/30">↔</span>
                        <span className="text-foreground/60 truncate flex-1 min-w-0">{pair.titleB}</span>
                        <span className="text-[9px] font-mono text-purple-400/60 shrink-0">{pair.shared} shared</span>
                      </div>
                    ))}
                    {(() => {
                      const top = listenerIntel.songOverlap[0];
                      return (
                        <p className="text-[11px] text-muted-foreground/50 pt-1 leading-relaxed">
                          {top.shared} people heard both "{top.titleA.slice(0, 20)}" and "{top.titleB.slice(0, 20)}." These listeners are your core audience.
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {signals.map((signal) => (
                <SongCard key={signal.post.id} signal={signal} onClick={() => navigate(`/song/${signal.post.id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
