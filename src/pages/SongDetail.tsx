import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchFireStrength, fetchFireData } from "@/lib/fire";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import { normalizeCinematicDirection } from "@/engine/cinematicResolver";
import { LyricDanceEmbed, type LyricDanceEmbedHandle } from "@/components/lyric/LyricDanceEmbed";
import { ClipComposer } from "@/components/lyric/ClipComposer";
import { LazySpotifyEmbed } from "@/components/songfit/LazySpotifyEmbed";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Music, Share2 } from "lucide-react";
import type { SongFitPost } from "@/components/songfit/types";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import { MilestoneCard } from "@/components/dashboard/MilestoneCard";

// ── Types ────────────────────────────────────────────────────────────────────

interface FireRow {
  line_index: number;
  time_sec: number;
  hold_ms: number;
  created_at: string;
}
interface StrengthRow {
  line_index: number;
  fire_strength: number;
  fire_count: number;
  avg_hold_ms: number;
}
interface ClosingRow {
  hook_index: number;
  pick_count: number;
  pct: number;
}
interface FreeRow {
  free_text: string;
  repeat_count: number;
}
interface CommentRow {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
}
interface LineInfo {
  lineIndex: number;
  text: string;
  startSec: number;
  endSec: number;
}

// ── Magic clip algorithm ─────────────────────────────────────────────────────

function computeMagicClip(
  fires: FireRow[],
  lines: LineInfo[],
  duration: number,
): { start: number; end: number; fires: number; topLineIndex: number } | null {
  if (fires.length === 0 || duration < 4) return null;

  // Build fire density in 0.5s buckets, weighted by hold
  const bucketSize = 0.5;
  const bucketCount = Math.ceil(duration / bucketSize);
  const buckets = new Float64Array(bucketCount);

  for (const fire of fires) {
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(fire.time_sec / bucketSize)));
    const weight = fire.hold_ms < 300 ? 1 : fire.hold_ms < 1000 ? 2 : fire.hold_ms < 3000 ? 4 : 8;
    buckets[idx] += weight;
  }

  // Sliding window: find best 8-12s window
  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (let windowSec = 8; windowSec <= 12; windowSec += 1) {
    const windowBuckets = Math.ceil(windowSec / bucketSize);
    let windowSum = 0;
    for (let i = 0; i < Math.min(windowBuckets, bucketCount); i++) windowSum += buckets[i];
    if (windowSum > bestScore) {
      bestScore = windowSum;
      bestStart = 0;
      bestEnd = windowSec;
    }

    for (let i = 1; i + windowBuckets <= bucketCount; i++) {
      windowSum -= buckets[i - 1];
      windowSum += buckets[i + windowBuckets - 1];
      const startSec = i * bucketSize;
      if (windowSum > bestScore) {
        bestScore = windowSum;
        bestStart = startSec;
        bestEnd = startSec + windowSec;
      }
    }
  }

  if (bestScore === 0) return null;

  // Snap to nearest line boundaries
  const snapStart = lines.reduce(
    (best, line) =>
      Math.abs(line.startSec - bestStart) < Math.abs(best.startSec - bestStart) ? line : best,
    lines[0],
  );
  const snapEnd = lines.reduce(
    (best, line) =>
      Math.abs(line.endSec - bestEnd) < Math.abs(best.endSec - bestEnd) ? line : best,
    lines[lines.length - 1],
  );

  const start = Math.max(0, snapStart.startSec - 0.5);
  const end = Math.min(duration, snapEnd.endSec + 0.5);

  // Count fires in window
  const firesInWindow = fires.filter((f) => f.time_sec >= start && f.time_sec <= end).length;

  // Top line in window
  const lineFireCounts: Record<number, number> = {};
  for (const f of fires) {
    if (f.time_sec >= start && f.time_sec <= end) {
      lineFireCounts[f.line_index] = (lineFireCounts[f.line_index] ?? 0) + 1;
    }
  }
  const topLineIndex = Object.entries(lineFireCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return { start, end, fires: firesInWindow, topLineIndex: topLineIndex ? Number(topLineIndex) : 0 };
}

// ── Fire Heatmap Canvas ──────────────────────────────────────────────────────

function FireHeatmapCanvas({
  fires,
  duration,
  clipRegion,
  onSeek,
}: {
  fires: FireRow[];
  duration: number;
  clipRegion: { start: number; end: number } | null;
  onSeek?: (timeSec: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || duration <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = el.clientWidth * dpr;
    el.height = el.clientHeight * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    ctx.clearRect(0, 0, cw, ch);

    const bucketCount = Math.max(cw, 100);
    const buckets = new Float64Array(bucketCount);
    for (const fire of fires) {
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((fire.time_sec / duration) * bucketCount)),
      );
      const weight = fire.hold_ms < 300 ? 1 : fire.hold_ms < 1000 ? 2 : fire.hold_ms < 3000 ? 4 : 8;
      buckets[idx] += weight;
    }
    let maxBucket = 0;
    for (let i = 0; i < bucketCount; i++) if (buckets[i] > maxBucket) maxBucket = buckets[i];
    if (maxBucket > 0) for (let i = 0; i < bucketCount; i++) buckets[i] /= maxBucket;

    // Draw clip region highlight
    if (clipRegion) {
      const x1 = (clipRegion.start / duration) * cw;
      const x2 = (clipRegion.end / duration) * cw;
      ctx.fillStyle = "rgba(255,120,30,0.08)";
      ctx.fillRect(x1, 0, x2 - x1, ch);
      ctx.strokeStyle = "rgba(255,120,30,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, ch);
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, ch);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw bars
    const barW = Math.max(cw / bucketCount, 1);
    for (let i = 0; i < bucketCount; i++) {
      const heat = buckets[i];
      const barH = Math.max(heat * ch * 0.85, heat > 0 ? 3 : 1);
      const x = (i / bucketCount) * cw;
      if (heat > 0.01) {
        const r = 255;
        const g = Math.round(160 - heat * 120);
        const a = 0.3 + heat * 0.65;
        ctx.fillStyle = `rgba(${r},${g},30,${a})`;
      } else {
        ctx.fillStyle = "rgba(150,150,150,0.15)";
      }
      ctx.fillRect(x, (ch - barH) / 2, Math.max(barW, 1), barH);
    }

    // Fire density curve
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,120,30,0.5)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < bucketCount; i++) {
      const x = (i / bucketCount) * cw;
      const y = ch - buckets[i] * ch * 0.65 - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Time labels
    ctx.font = "9px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    const labelCount = duration > 120 ? 4 : 3;
    for (let i = 0; i <= labelCount; i++) {
      const t = (i / labelCount) * duration;
      const x = (t / duration) * cw;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, i === 0 ? 2 : x - 10, ch - 2);
    }
  }, [fires, duration, clipRegion]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      onSeek(pct * duration);
    },
    [onSeek, duration],
  );

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full cursor-pointer"
      style={{ height: 72 }}
    />
  );
}

// ── Section Lyrics ───────────────────────────────────────────────────────────

function SectionLyrics({
  lines,
  sections,
  fireMap,
  comments,
  maxStrength,
}: {
  lines: LineInfo[];
  sections: any[];
  fireMap: Map<number, StrengthRow>;
  comments: CommentRow[];
  maxStrength: number;
}) {
  // Group lines by section
  const linesBySection = useMemo(() => {
    const map = new Map<number, LineInfo[]>();
    for (const line of lines) {
      let secIdx = 0;
      for (let s = 0; s < sections.length; s++) {
        const sec = sections[s];
        const start = sec.startSec ?? sec.start ?? 0;
        const end = sec.endSec ?? sec.end ?? Infinity;
        if (line.startSec >= start && line.startSec < end) {
          secIdx = s;
          break;
        }
      }
      if (!map.has(secIdx)) map.set(secIdx, []);
      map.get(secIdx)?.push(line);
    }
    return map;
  }, [lines, sections]);

  // Group comments by line_index
  const commentsByLine = useMemo(() => {
    const map = new Map<number, CommentRow[]>();
    for (const c of comments) {
      if (c.line_index == null) continue;
      if (!map.has(c.line_index)) map.set(c.line_index, []);
      map.get(c.line_index)?.push(c);
    }
    return map;
  }, [comments]);

  return (
    <div className="space-y-3">
      {Array.from(linesBySection.entries()).map(([secIdx, sectionLines]) => {
        const sec = sections[secIdx] ?? {};
        const sectionFires = sectionLines.reduce(
          (sum, l) => sum + (fireMap.get(l.lineIndex)?.fire_count ?? 0),
          0,
        );
        const label = sec.description?.slice(0, 40) ?? `Section ${secIdx + 1}`;

        return (
          <div key={secIdx} className="glass-card rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                {label}
              </span>
              {sectionFires > 0 && (
                <span className="text-[10px] font-mono text-orange-400/70">🔥 {sectionFires}</span>
              )}
            </div>
            {sectionLines
              .filter((l) => l.text.trim())
              .map((line) => {
                const fire = fireMap.get(line.lineIndex);
                const pct = fire && maxStrength > 0 ? Math.round((fire.fire_strength / maxStrength) * 100) : 0;
                const holdLabel = fire
                  ? fire.avg_hold_ms < 300
                    ? "tap"
                    : fire.avg_hold_ms < 1000
                      ? "hold"
                      : "deep"
                  : null;
                const lineComments = commentsByLine.get(line.lineIndex) ?? [];

                return (
                  <div key={line.lineIndex} className="relative py-1">
                    {pct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 rounded"
                        style={{
                          width: `${pct}%`,
                          background:
                            "linear-gradient(90deg, rgba(255,120,30,0.06) 0%, rgba(255,120,30,0.14) 100%)",
                        }}
                      />
                    )}
                    <div className="relative px-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] leading-snug flex-1 min-w-0 ${
                            fire ? "text-foreground/80" : "text-muted-foreground/35"
                          }`}
                        >
                          {line.text}
                        </span>
                        {fire && (
                          <span className="text-[9px] font-mono text-orange-400/50 shrink-0">
                            {fire.fire_count}× {holdLabel}
                          </span>
                        )}
                      </div>
                      {lineComments.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {lineComments.slice(0, 2).map((c) => (
                            <p
                              key={c.id}
                              className="text-[9px] text-primary/40 italic pl-2 border-l border-primary/15"
                            >
                              "{c.text.slice(0, 60)}{c.text.length > 60 ? "…" : ""}"
                            </p>
                          ))}
                          {lineComments.length > 2 && (
                            <p className="text-[8px] text-muted-foreground/30 pl-2">
                              +{lineComments.length - 2} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

// ── Now Streaming Drill-Down ─────────────────────────────────────────────

function NowStreamingDrillDown({ post, navigate }: { post: SongFitPost; navigate: (path: any) => void }) {
  const [events, setEvents] = useState<Array<{ event_type: string; created_at: string; user_id: string }>>([]);
  const [comments, setComments] = useState<Array<{ id: string; content: string; created_at: string; user_id: string; likes_count: number }>>([]);
  const [commentProfiles, setCommentProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from("songfit_engagement_events" as any)
        .select("event_type, created_at, user_id")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("feed_comments" as any)
        .select("id, content, created_at, user_id, likes_count")
        .eq("post_id", post.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then(async ([eventsRes, commentsRes]) => {
      const evts = (eventsRes.data ?? []) as any[];
      const cmts = (commentsRes.data ?? []) as any[];
      setEvents(evts);
      setComments(cmts);

      // Fetch profiles for commenters
      const userIds = [...new Set(cmts.map((c: any) => c.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        const map: Record<string, any> = {};
        for (const p of (profiles ?? []) as any[]) map[p.id] = p;
        setCommentProfiles(map);
      }
      setLoading(false);
    });
  }, [post.id]);

  // Aggregate events by type
  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
    return counts;
  }, [events]);

  // Unique users who engaged
  const uniqueEngagers = useMemo(() => new Set(events.map((e) => e.user_id)).size, [events]);

  // Events by day for timeline
  const timeline = useMemo(() => {
    const days = new Map<string, Record<string, number>>();
    for (const e of events) {
      const day = e.created_at.slice(0, 10);
      if (!days.has(day)) days.set(day, {});
      const d = days.get(day)!;
      d[e.event_type] = (d[e.event_type] ?? 0) + 1;
    }
    return Array.from(days.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, counts]) => ({ day, total: Object.values(counts).reduce((s, c) => s + c, 0), counts }));
  }, [events]);

  const bestDay = timeline.length > 0 ? timeline.reduce((best, d) => d.total > best.total ? d : best) : null;

  const EVENT_LABELS: Record<string, { emoji: string; label: string }> = {
    spotify_click: { emoji: "🎧", label: "Spotify clicks" },
    like: { emoji: "❤️", label: "Likes" },
    save: { emoji: "🔖", label: "Saves" },
    comment: { emoji: "💬", label: "Comments" },
    share: { emoji: "🔗", label: "Shares" },
    profile_visit: { emoji: "👤", label: "Profile visits" },
    follow_from_post: { emoji: "➕", label: "Follows" },
    fire: { emoji: "🔥", label: "Fires" },
  };

  const fmt = (t: string) => {
    const d = new Date(t);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground/30" />
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted/30">
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold truncate">{post.track_title}</p>
            <p className="text-[10px] font-mono text-green-400 uppercase tracking-wider">Now Streaming</p>
          </div>
        </div>

        {/* Spotify embed */}
        <div className="rounded-xl overflow-hidden" style={{ height: 232 }}>
          <LazySpotifyEmbed
            trackId={post.spotify_track_id!}
            trackTitle={post.track_title}
            trackUrl={post.spotify_track_url!}
            postId={post.id}
            albumArtUrl={post.album_art_url}
          />
        </div>

        {/* Headline stats */}
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[24px] font-mono font-medium text-foreground">{events.length}</span>
            <span className="text-[11px] font-mono text-muted-foreground">interactions</span>
            {uniqueEngagers > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-[11px] font-mono text-muted-foreground">{uniqueEngagers} people</span>
              </>
            )}
          </div>
          {uniqueEngagers > 1 && (
            <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
              {eventCounts.spotify_click > uniqueEngagers
                ? `People are clicking through to Spotify multiple times — that's replay intent.`
                : eventCounts.save > 0
                  ? `${eventCounts.save} ${eventCounts.save === 1 ? "person" : "people"} saved this — saves are the strongest signal for long-term playlist adds.`
                  : `${uniqueEngagers} people engaged. Share wider to see if saves and clicks grow.`}
            </p>
          )}
        </div>

        {/* Engagement breakdown */}
        {Object.keys(eventCounts).length > 0 && (
          <div className="glass-card rounded-xl p-4 space-y-2.5">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">engagement breakdown</p>
            {Object.entries(eventCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const meta = EVENT_LABELS[type] ?? { emoji: "·", label: type };
                const pct = events.length > 0 ? Math.round((count / events.length) * 100) : 0;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-foreground/75 flex items-center gap-1.5">
                        <span>{meta.emoji}</span> {meta.label}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "rgba(34,197,94,0.5)" }} />
                    </div>
                  </div>
                );
              })}
            {/* Insight */}
            {eventCounts.spotify_click > 0 &&
              eventCounts.save > 0 &&
              (() => {
                const clickToSaveRate = Math.round((eventCounts.save / eventCounts.spotify_click) * 100);
                return (
                  <p className="text-[11px] text-muted-foreground/50 pt-1 leading-relaxed">
                    {clickToSaveRate >= 30
                      ? `${clickToSaveRate}% click-to-save rate — people who listen are keeping it. That's strong conversion.`
                      : clickToSaveRate >= 10
                        ? `${clickToSaveRate}% of clickers saved. Growing this number is how songs go from heard to remembered.`
                        : `People are clicking but not saving yet. The first 30 seconds might not be hooking them — consider a stronger intro.`}
                  </p>
                );
              })()}
          </div>
        )}

        {/* Activity timeline */}
        {timeline.length > 1 && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">activity timeline</p>
            <div className="flex items-end gap-1" style={{ height: 48 }}>
              {timeline.map(({ day, total }) => {
                const maxTotal = bestDay?.total ?? 1;
                const pct = Math.max(8, Math.round((total / maxTotal) * 100));
                return (
                  <div key={day} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${pct}%`,
                        minHeight: 4,
                        background: total === maxTotal ? "rgba(34,197,94,0.7)" : "rgba(34,197,94,0.3)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] font-mono text-muted-foreground/30">
              <span>{timeline[0]?.day.slice(5)}</span>
              <span>{timeline[timeline.length - 1]?.day.slice(5)}</span>
            </div>
            {bestDay && (
              <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                {bestDay.day.slice(5)} was your biggest day — {bestDay.total} interactions.
                {timeline.length >= 3 && timeline[timeline.length - 1].total > timeline[timeline.length - 2].total
                  ? " Your momentum is building."
                  : ""}
              </p>
            )}
          </div>
        )}

        {/* Comments */}
        {comments.length > 0 && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">comments · {comments.length}</p>
            {comments.slice(0, 10).map((c) => {
              const profile = commentProfiles[c.user_id];
              return (
                <div key={c.id} className="space-y-1 py-1.5 border-b border-border/15 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-foreground/50">{profile?.display_name ?? "listener"}</span>
                    <span className="text-[8px] font-mono text-muted-foreground/30">{fmt(c.created_at)}</span>
                    {c.likes_count > 0 && (
                      <span className="text-[8px] font-mono text-muted-foreground/30 ml-auto">❤️ {c.likes_count}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground/70 leading-snug">{c.content}</p>
                </div>
              );
            })}
            {comments.length > 10 && <p className="text-[9px] text-muted-foreground/30 text-center">+{comments.length - 10} more</p>}
            {/* Insight */}
            {comments.length >= 3 && (
              <p className="text-[11px] text-muted-foreground/50 pt-1 leading-relaxed">
                {comments.length} comments means people want to talk about your music. Respond to keep the conversation going —
                engagement breeds engagement.
              </p>
            )}
          </div>
        )}

        {/* Card stats */}
        <div className="glass-card rounded-xl p-4 space-y-2">
          <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">card stats</p>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Impressions</span>
            <span className="font-mono text-foreground/70">{post.impressions.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Engagement score</span>
            <span className="font-mono text-foreground/70">{Math.round(post.engagement_score)}</span>
          </div>
          {post.peak_rank && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Peak rank</span>
              <span className="font-mono text-foreground/70">#{post.peak_rank}</span>
            </div>
          )}
          {post.impressions > 0 && events.length > 0 && (
            <p className="text-[11px] text-muted-foreground/50 pt-1 leading-relaxed">
              {Math.round((events.length / post.impressions) * 100)}% of people who saw your card engaged with it.
              {(events.length / post.impressions) >= 0.1
                ? " That's strong — your card is doing its job."
                : " Stronger album art or a punchier caption could lift this."}
            </p>
          )}
        </div>

        {/* Empty state */}
        {events.length === 0 && comments.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Music size={32} className="text-muted-foreground/20" />
            <p className="text-[12px] text-muted-foreground text-center leading-relaxed max-w-[260px]">
              No engagement yet. Your card needs more impressions — share it to get signal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

const SongDetail = () => {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<SongFitPost | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fire data
  const [rawFires, setRawFires] = useState<FireRow[]>([]);
  const [fireStrength, setFireStrength] = useState<StrengthRow[]>([]);
  const [totalFires, setTotalFires] = useState(0);
  const [uniqueListeners, setUniqueListeners] = useState(0);
  const [sourceBreakdown, setSourceBreakdown] = useState<Record<string, number>>({});

  // Closing + free text
  const [closingDist, setClosingDist] = useState<ClosingRow[]>([]);
  const [freeResponses, setFreeResponses] = useState<FreeRow[]>([]);

  // Comments
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [funnel, setFunnel] = useState<{
    exposureSessions: number;
    fireSessions: number;
    closingSessions: number;
    commentSessions: number;
    repeatListeners: number;
    deepListeners: number;
    avgFiresPerSession: number;
  } | null>(null);

  // Empowerment promise (from dance data)
  const empowermentPromise = (danceData as any)?.empowerment_promise ?? null;

  // Magic clip
  const [clipRegion, setClipRegion] = useState<{
    start: number;
    end: number;
    fires: number;
    topLineIndex: number;
  } | null>(null);

  // Export
  const [clipEditorOpen, setClipEditorOpen] = useState(false);
  const playerRef = useRef<LyricDanceEmbedHandle>(null);

  // Derived
  const isInStudio = !!post?.lyric_dance_id;
  const danceId = post?.lyric_dance_id;

  const lines: LineInfo[] = useMemo(() => {
    const raw = (danceData as any)?.lyrics;
    if (!Array.isArray(raw)) return [];
    return raw.map((line: any, i: number) => ({
      lineIndex: i,
      text: line.text ?? "",
      startSec:
        typeof line.start === "number"
          ? line.start
          : typeof line.startSec === "number"
            ? line.startSec
            : 0,
      endSec:
        typeof line.end === "number"
          ? line.end
          : typeof line.endSec === "number"
            ? line.endSec
            : 0,
    }));
  }, [danceData]);

  const sections = useMemo(() => {
    const cd = (danceData as any)?.cinematic_direction;
    return cd ? normalizeCinematicDirection(cd)?.sections ?? [] : [];
  }, [danceData]);

  const fireMap = useMemo(() => {
    const map = new Map<number, StrengthRow>();
    for (const row of fireStrength) map.set(row.line_index, row);
    return map;
  }, [fireStrength]);

  const audioDuration = useMemo(() => {
    if (!lines.length) return 0;
    return Math.max(...lines.map((l) => l.endSec), 0);
  }, [lines]);

  // ── Fetch post + dance data ────────────────────────────────────────────

  useEffect(() => {
    if (!postId) return;
    (async () => {
      const { data: postRow } = await supabase
        .from("feed_posts" as any)
        .select("*, profiles:user_id(display_name, avatar_url, is_verified)")
        .eq("id", postId)
        .single();

      if (!postRow) {
        setLoading(false);
        return;
      }
      setPost(postRow as unknown as SongFitPost);

      if (postRow.lyric_dance_id) {
        const { data: dance } = await supabase
          .from("lyric_projects" as any)
          .select(LYRIC_DANCE_COLUMNS)
          .eq("id", postRow.lyric_dance_id)
          .maybeSingle();
        if (dance) {
          const d = dance as any;
          setDanceData({
            ...d,
            cinematic_direction: d.cinematic_direction
              ? normalizeCinematicDirection(d.cinematic_direction)
              : null,
          } as LyricDanceData);
        }
      }
      setLoading(false);
    })();
  }, [postId]);

  // ── Fetch signal data ──────────────────────────────────────────────────

  useEffect(() => {
    if (!danceId) return;
    Promise.all([
      fetchFireStrength(danceId),
      fetchFireData(danceId),
      supabase
        .from("v_closing_distribution" as any)
        .select("hook_index, pick_count, pct")
        .eq("dance_id", danceId),
      supabase
        .from("v_free_form_responses" as any)
        .select("free_text, repeat_count")
        .eq("dance_id", danceId)
        .limit(20),
      supabase
        .from("project_fires" as any)
        .select("id", { count: "exact", head: true })
        .eq("dance_id", danceId),
      supabase.from("project_exposures" as any).select("session_id").eq("dance_id", danceId),
      supabase
        .from("project_comments" as any)
        .select("id, text, line_index, submitted_at")
        .eq("dance_id", danceId)
        .order("submitted_at", { ascending: true })
        .limit(200),
      supabase
        .from("project_fires" as any)
        .select("source")
        .eq("dance_id", danceId),
    ]).then(([strength, fires, dist, free, count, exposures, commentRes, sourceRes]) => {
      setFireStrength(strength);
      setRawFires(fires);
      setClosingDist((dist.data as any[]) ?? []);
      setFreeResponses((free.data as any[]) ?? []);
      setTotalFires(count.count ?? 0);
      const sessions = new Set(((exposures.data ?? []) as any[]).map((r: any) => r.session_id));
      setUniqueListeners(sessions.size);
      setComments((commentRes.data as any[]) ?? []);
      const srcCounts: Record<string, number> = {};
      for (const row of ((sourceRes.data ?? []) as any[])) {
        const src = row.source ?? "unknown";
        srcCounts[src] = (srcCounts[src] ?? 0) + 1;
      }
      setSourceBreakdown(srcCounts);
    });

    Promise.all([
      supabase.from("project_exposures" as any).select("session_id").eq("dance_id", danceId),
      supabase.from("project_fires" as any).select("session_id, line_index, created_at").eq("dance_id", danceId),
      supabase.from("project_closing_picks" as any).select("session_id").eq("dance_id", danceId),
      supabase.from("project_comments" as any).select("session_id").eq("dance_id", danceId),
    ]).then(([expRes, fireRes, closeRes, commentRes]) => {
      const expSessions = new Set(((expRes.data ?? []) as any[]).map((r: any) => r.session_id).filter(Boolean));
      const fireSessions = new Set(((fireRes.data ?? []) as any[]).map((r: any) => r.session_id).filter(Boolean));
      const closeSessions = new Set(((closeRes.data ?? []) as any[]).map((r: any) => r.session_id).filter(Boolean));
      const commentSessions = new Set(((commentRes.data ?? []) as any[]).map((r: any) => r.session_id).filter(Boolean));

      const sessionDays = new Map<string, Set<string>>();
      for (const row of ((fireRes.data ?? []) as any[])) {
        if (!row.session_id || !row.created_at) continue;
        if (!sessionDays.has(row.session_id)) sessionDays.set(row.session_id, new Set());
        sessionDays.get(row.session_id)?.add(String(row.created_at).slice(0, 10));
      }
      let repeatListeners = 0;
      for (const days of sessionDays.values()) if (days.size >= 2) repeatListeners++;

      const sessionLines = new Map<string, Set<number>>();
      for (const row of ((fireRes.data ?? []) as any[])) {
        if (!row.session_id || row.line_index == null) continue;
        if (!sessionLines.has(row.session_id)) sessionLines.set(row.session_id, new Set());
        sessionLines.get(row.session_id)?.add(row.line_index);
      }
      let deepListeners = 0;
      for (const fireLines of sessionLines.values()) if (fireLines.size >= 3) deepListeners++;

      const avgFires = fireSessions.size > 0 ? (fireRes.data ?? []).length / fireSessions.size : 0;

      setFunnel({
        exposureSessions: expSessions.size,
        fireSessions: fireSessions.size,
        closingSessions: closeSessions.size,
        commentSessions: commentSessions.size,
        repeatListeners,
        deepListeners,
        avgFiresPerSession: avgFires,
      });
    });
  }, [danceId]);

  // ── Compute magic clip when fire data arrives ──────────────────────────

  useEffect(() => {
    if (rawFires.length === 0 || lines.length === 0 || audioDuration <= 0) return;
    const clip = computeMagicClip(rawFires, lines, audioDuration);
    if (clip) setClipRegion(clip);
  }, [rawFires, lines, audioDuration]);

  // ── Handlers ───────────────────────────────────────────────────────────


  // ── Loading / not found ────────────────────────────────────────────────

  if (loading)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground/30" />
      </div>
    );

  if (!post)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Song not found.</p>
      </div>
    );

  // ── Now Streaming / Battle drill-down ──────────────────────────────────


  if (!isInStudio) {
    return <NowStreamingDrillDown post={post} navigate={navigate} />;
  }

  // ── In Studio drill-down ───────────────────────────────────────────────

  const maxStrength = fireStrength[0]?.fire_strength ?? 1;
  const firesPerListener = uniqueListeners > 0 ? totalFires / uniqueListeners : 0;
  const clipLine = clipRegion ? lines.find((l) => l.lineIndex === clipRegion.topLineIndex) : null;

  // Generate caption from closing picks or free text
  const clipCaption = (() => {
    if (freeResponses.length > 0) return freeResponses[0].free_text;
    if (closingDist.length > 0 && empowermentPromise?.hooks) {
      return empowermentPromise.hooks[closingDist[0].hook_index] ?? null;
    }
    return null;
  })();

  // Timeline: group fires by day
  const timeline = useMemo(() => {
    const days = new Map<string, number>();
    for (const fire of rawFires) {
      const day = fire.created_at.slice(0, 10);
      days.set(day, (days.get(day) ?? 0) + 1);
    }
    return Array.from(days.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day, count }));
  }, [rawFires]);

  const bestDay =
    timeline.length > 0
      ? timeline.reduce((best, d) => (d.count > best.count ? d : best))
      : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted/30">
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold truncate">{post.track_title}</p>
            <p className="text-[10px] font-mono text-orange-400 uppercase tracking-wider">In Studio</p>
          </div>
        </div>

        {/* Headline stats */}
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-3">
            <span style={{ fontSize: 28 }}>🔥</span>
            <span className="text-[28px] font-mono font-medium text-foreground">{totalFires}</span>
            <span className="text-[11px] font-mono text-muted-foreground">fires</span>
            {uniqueListeners > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {uniqueListeners} listener{uniqueListeners !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
          {uniqueListeners > 1 && (
            <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
              {firesPerListener >= 3
                ? `${firesPerListener.toFixed(1)} fires per listener — people are reacting to multiple moments.`
                : firesPerListener >= 1.5
                  ? `${firesPerListener.toFixed(1)} fires per listener — your song has more than one moment that hits.`
                  : `${firesPerListener.toFixed(1)} fires per listener. More shares will reveal which lines connect deepest.`}
            </p>
          )}
        </div>

        {/* Source breakdown */}
        {Object.keys(sourceBreakdown).length > 0 && totalFires > 0 && (() => {
          const SOURCE_LABELS: Record<string, { emoji: string; label: string }> = {
            feed: { emoji: "📱", label: "CrowdFit feed" },
            shareable: { emoji: "🔗", label: "Shared link" },
            embed: { emoji: "🖥", label: "Embedded" },
            unknown: { emoji: "·", label: "Before tracking" },
          };
          const entries = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1]);
          const topSource = entries[0];

          return (
            <div className="glass-card rounded-xl p-4 space-y-2.5">
              <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">where your fires came from</p>
              <div className="flex flex-wrap gap-2">
                {entries.map(([source, count]) => {
                  const meta = SOURCE_LABELS[source] ?? { emoji: "·", label: source };
                  const pct = Math.round((count / totalFires) * 100);
                  return (
                    <div key={source} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/15 border border-border/15">
                      <span className="text-[14px]">{meta.emoji}</span>
                      <span className="text-[11px] font-mono text-foreground/70">{count}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/40">{pct}%</span>
                      <span className="text-[9px] text-muted-foreground/40">{meta.label}</span>
                    </div>
                  );
                })}
              </div>
              {topSource && entries.length >= 2 && (() => {
                const [src, count] = topSource;
                const pct = Math.round((count / totalFires) * 100);
                if (src === "shareable" && pct >= 50) {
                  return <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Most of your signal comes from shared links — your audience is outside CrowdFit. Keep sharing on socials.</p>;
                }
                if (src === "feed" && pct >= 70) {
                  return <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Most fires are from the CrowdFit feed. Share your link on socials to reach new listeners.</p>;
                }
                if (entries.length >= 2 && Math.abs(entries[0][1] - entries[1][1]) < totalFires * 0.15) {
                  return <p className="text-[11px] text-muted-foreground/50 leading-relaxed">Your signal is balanced between feed and shares — you're building on both fronts.</p>;
                }
                return null;
              })()}
            </div>
          );
        })()}

        {funnel && funnel.exposureSessions > 0 && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">listener journey</p>

            {(() => {
              const stages = [
                { label: "Heard it", count: funnel.exposureSessions, color: "rgba(150,150,150,0.5)" },
                { label: "Fired", count: funnel.fireSessions, color: "rgba(255,120,30,0.6)" },
                { label: "Felt something", count: funnel.closingSessions, color: "rgba(168,85,247,0.6)" },
                { label: "Commented", count: funnel.commentSessions, color: "rgba(34,197,94,0.6)" },
              ].filter((stage) => stage.count > 0);

              const maxCount = stages[0]?.count ?? 1;

              return (
                <div className="space-y-2">
                  {stages.map((stage, i) => {
                    const pct = Math.max(8, Math.round((stage.count / maxCount) * 100));
                    const dropoff =
                      i > 0 && stages[i - 1].count > 0
                        ? Math.round(((stages[i - 1].count - stage.count) / stages[i - 1].count) * 100)
                        : null;
                    return (
                      <div key={stage.label} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-foreground/60">{stage.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-foreground/70">{stage.count}</span>
                            {dropoff != null && dropoff > 0 && (
                              <span className="text-[8px] font-mono text-muted-foreground/30">-{dropoff}%</span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: stage.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="flex gap-3 pt-1">
              {funnel.repeatListeners > 0 && (
                <div className="flex-1 text-center py-2 rounded-lg bg-muted/10 border border-border/10">
                  <p className="text-[14px] font-mono text-foreground/80">{funnel.repeatListeners}</p>
                  <p className="text-[8px] font-mono text-muted-foreground/40 uppercase">came back</p>
                </div>
              )}
              {funnel.deepListeners > 0 && (
                <div className="flex-1 text-center py-2 rounded-lg bg-muted/10 border border-border/10">
                  <p className="text-[14px] font-mono text-foreground/80">{funnel.deepListeners}</p>
                  <p className="text-[8px] font-mono text-muted-foreground/40 uppercase">deep listeners</p>
                </div>
              )}
              {funnel.avgFiresPerSession >= 1.5 && (
                <div className="flex-1 text-center py-2 rounded-lg bg-muted/10 border border-border/10">
                  <p className="text-[14px] font-mono text-foreground/80">{funnel.avgFiresPerSession.toFixed(1)}</p>
                  <p className="text-[8px] font-mono text-muted-foreground/40 uppercase">fires / listener</p>
                </div>
              )}
            </div>

            {(() => {
              const fireRate = funnel.exposureSessions > 0 ? funnel.fireSessions / funnel.exposureSessions : 0;
              const closingRate = funnel.fireSessions > 0 ? funnel.closingSessions / funnel.fireSessions : 0;

              if (fireRate >= 0.5) {
                return (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    Half the people who heard your song fired on it — that's exceptional. This song connects on first listen.
                  </p>
                );
              }
              if (fireRate >= 0.2 && closingRate < 0.3) {
                return (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    People are firing but not finishing — they might be dropping off mid-song. Check which sections lose attention.
                  </p>
                );
              }
              if (funnel.repeatListeners > 0) {
                return (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    {funnel.repeatListeners} listener{funnel.repeatListeners !== 1 ? "s" : ""} came back on a different day. That's the strongest signal — your song lives in their head.
                  </p>
                );
              }
              if (funnel.deepListeners > 0) {
                return (
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                    {funnel.deepListeners} listener{funnel.deepListeners !== 1 ? "s" : ""} fired on 3+ different lines — they're not just liking one moment, they're absorbing the whole song.
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}

        {totalFires > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <div className="shrink-0" style={{ width: 160 }}>
              <MilestoneCard
                number={String(totalFires)}
                label="fires"
                sublabel={uniqueListeners > 0 ? `from ${uniqueListeners} listeners` : undefined}
                songTitle={post.track_title}
              />
            </div>
            {funnel && funnel.repeatListeners > 0 && (
              <div className="shrink-0" style={{ width: 160 }}>
                <MilestoneCard
                  number={String(funnel.repeatListeners)}
                  label="came back"
                  sublabel="returned on a different day"
                  songTitle={post.track_title}
                  accentColor="rgba(168,85,247,0.8)"
                />
              </div>
            )}
            {funnel && funnel.deepListeners > 0 && (
              <div className="shrink-0" style={{ width: 160 }}>
                <MilestoneCard
                  number={String(funnel.deepListeners)}
                  label="deep listeners"
                  sublabel="fired on 3+ lines"
                  songTitle={post.track_title}
                  accentColor="rgba(34,197,94,0.8)"
                />
              </div>
            )}
          </div>
        )}

        {/* Fire heatmap */}
        {rawFires.length > 0 && (
          <div className="glass-card rounded-xl p-3 space-y-1.5">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">fire heatmap</p>
            <FireHeatmapCanvas
              fires={rawFires}
              duration={audioDuration}
              clipRegion={clipRegion}
              onSeek={(t) => {
                const player = playerRef.current?.getPlayer();
                if (player) {
                  player.seek(t);
                  player.play();
                  player.setMuted(false);
                }
              }}
            />
          </div>
        )}

        {/* 🏆 Magic Clip */}
        {clipRegion && clipLine && (
          <div className="glass-card rounded-xl p-4 space-y-3 border border-orange-500/15">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">🏆</span>
              <p className="text-[9px] font-mono text-orange-400/70 uppercase tracking-wider">magic clip</p>
            </div>
            <p className="text-[14px] text-foreground/90 font-medium leading-snug italic">"{clipLine.text}"</p>
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
              <span>
                {Math.floor(clipRegion.start / 60)}:{String(Math.floor(clipRegion.start % 60)).padStart(2, "0")}{" "}
                → {Math.floor(clipRegion.end / 60)}:{String(Math.floor(clipRegion.end % 60)).padStart(2, "0")}
              </span>
              <span>·</span>
              <span>{Math.round(clipRegion.end - clipRegion.start)}s</span>
              <span>·</span>
              <span>{clipRegion.fires} fires</span>
            </div>
            {clipCaption && (
              <p className="text-[11px] text-muted-foreground/40 italic">Caption: "{clipCaption}"</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setClipEditorOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-mono uppercase tracking-wider rounded-lg border border-orange-500/30 text-orange-400/70 hover:text-orange-400 hover:bg-orange-500/5 transition-colors"
              >
                ✂️ Open Clip Editor
              </button>
              <button
                onClick={() => {
                  const url = post.lyric_dance_url
                    ? `${window.location.origin}${post.lyric_dance_url}`
                    : window.location.href;
                  navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
                }}
                className="py-2.5 px-3 text-[9px] font-mono uppercase tracking-wider rounded-lg border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Share2 size={10} />
              </button>
            </div>
          </div>
        )}

        {clipEditorOpen && clipRegion && (
          <ClipComposer
            visible={clipEditorOpen}
            player={playerRef.current?.getPlayer() ?? null}
            durationSec={audioDuration}
            fires={rawFires}
            lines={lines}
            initialStart={clipRegion.start}
            initialEnd={clipRegion.end}
            initialCaption={clipCaption}
            songTitle={post.track_title}
            onClose={() => {
              setClipEditorOpen(false);
              const p = playerRef.current?.getPlayer();
              if (p) p.setRegion(undefined, undefined);
            }}
          />
        )}

        {/* Player (collapsed, expandable) */}
        {danceData && (
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="relative" style={{ height: 360 }}>
              <LyricDanceEmbed
                ref={playerRef}
                lyricDanceId={danceId!}
                songTitle={post.track_title}
                artistName={(post as any).artist_name || post.track_title || ""}
                avatarUrl={post.profiles?.avatar_url ?? null}
                isVerified={post.profiles?.is_verified ?? false}
                userId={post.user_id ?? null}
                prefetchedData={danceData}
              />
            </div>
          </div>
        )}


        {/* Section lyrics with fire + comments */}
        {fireStrength.length > 0 && lines.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider px-1">
              lyrics + fire
            </p>
            <SectionLyrics
              lines={lines}
              sections={sections}
              fireMap={fireMap}
              comments={comments}
              maxStrength={maxStrength}
            />
            {/* Section insight */}
            {sections.length >= 2 &&
              (() => {
                const sectionFires: { label: string; count: number }[] = [];
                const linesBySection = new Map<number, LineInfo[]>();
                for (const line of lines) {
                  let secIdx = 0;
                  for (let s = 0; s < sections.length; s++) {
                    const sec = sections[s] as any;
                    if (
                      line.startSec >= (sec.startSec ?? sec.start ?? 0) &&
                      line.startSec < (sec.endSec ?? sec.end ?? Infinity)
                    ) {
                      secIdx = s;
                      break;
                    }
                  }
                  if (!linesBySection.has(secIdx)) linesBySection.set(secIdx, []);
                  linesBySection.get(secIdx)?.push(line);
                }
                for (const [secIdx, secLines] of linesBySection) {
                  const count = secLines.reduce(
                    (s, l) => s + (fireMap.get(l.lineIndex)?.fire_count ?? 0),
                    0,
                  );
                  sectionFires.push({
                    label:
                      (sections[secIdx] as any)?.description?.slice(0, 30) ?? `Section ${secIdx + 1}`,
                    count,
                  });
                }
                const sorted = sectionFires.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
                if (sorted.length >= 2 && sorted[0].count > sorted[1].count * 2) {
                  const totalSectionFires = sorted.reduce((s, c) => s + c.count, 0);
                  return (
                    <p className="text-[11px] text-muted-foreground/50 px-1 leading-relaxed">
                      "{sorted[0].label}" has {Math.round((sorted[0].count / totalSectionFires) * 100)}% of
                      all fires — that's your clip section.
                    </p>
                  );
                }
                if (sorted.length >= 2)
                  return (
                    <p className="text-[11px] text-muted-foreground/50 px-1 leading-relaxed">
                      Fires spread across multiple sections — your song holds attention start to finish.
                    </p>
                  );
                return null;
              })()}
          </div>
        )}

        {/* What your song did */}
        {closingDist.length > 0 && empowermentPromise && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              what your song did for them
            </p>
            <p className="text-[11px] text-muted-foreground/40">
              After listening: "How does this make you feel?"
            </p>
            {closingDist.map((row) => {
              const label = empowermentPromise.hooks?.[row.hook_index] ?? `feeling ${row.hook_index}`;
              return (
                <div key={row.hook_index} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-foreground/75 flex-1 truncate">{label}</span>
                    <span className="text-[10px] font-mono text-orange-400/70 shrink-0 ml-2">
                      {row.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.pct}%`, background: "rgba(255,120,30,0.5)" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* In their own words */}
        {freeResponses.length > 0 && (
          <div className="glass-card rounded-xl p-4 space-y-2">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              in their own words
            </p>
            {freeResponses.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 py-1.5 border-b border-border/20 last:border-0"
              >
                <span className="text-[11px] text-foreground/70 flex-1 leading-snug font-light italic">
                  "{r.free_text}"
                </span>
                {r.repeat_count > 1 && (
                  <span className="text-[9px] font-mono text-primary/40 shrink-0">×{r.repeat_count}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        {timeline.length > 1 && (
          <div className="glass-card rounded-xl p-4 space-y-3">
            <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">fire timeline</p>
            <div className="flex items-end gap-1" style={{ height: 48 }}>
              {timeline.map(({ day, count }) => {
                const maxCount = bestDay?.count ?? 1;
                const pct = Math.max(8, Math.round((count / maxCount) * 100));
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${pct}%`,
                        minHeight: 4,
                        background:
                          count === maxCount ? "rgba(255,120,30,0.7)" : "rgba(255,120,30,0.3)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] font-mono text-muted-foreground/30">
              <span>{timeline[0]?.day.slice(5)}</span>
              <span>{timeline[timeline.length - 1]?.day.slice(5)}</span>
            </div>
            {bestDay && (
              <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                {bestDay.day.slice(5)} was your biggest day — {bestDay.count} fires.
                {timeline.length >= 3 &&
                timeline[timeline.length - 1].count > timeline[timeline.length - 2].count
                  ? " And your signal is growing."
                  : ""}
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {totalFires === 0 && (
          <div className="flex flex-col items-center gap-3 py-12">
            <span style={{ fontSize: 32 }}>🔥</span>
            <p className="text-[12px] text-muted-foreground text-center leading-relaxed max-w-[260px]">
              Share your song to start collecting signal. Every fire, comment, and response shows up here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SongDetail;
