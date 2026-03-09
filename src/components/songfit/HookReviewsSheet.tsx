import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { User, Music, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";


interface Reply {
  id: string;
  content: string;
  created_at: string;
  user_id: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface ReviewRow {
  id: string;
  hook_rating: string;
  would_replay: boolean;
  context_note: string | null;
  created_at: string;
  user_id: string | null;
  session_id: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  replies: Reply[];
  showReplies: boolean;
  showReplyInput: boolean;
}

interface PostMeta {
  track_title: string;
  track_artists_json: { name: string }[];
  album_art_url: string | null;
  caption: string | null;
}


interface Props {
  postId: string | null;
  onClose: () => void;
  onRemoved?: () => void;
  onVoteChange?: (vote: boolean | null) => void;
  spotifyTrackUrl?: string;
  artistsJson?: any[];
}

function AvatarBubble({ avatar, name, size = 8 }: { avatar?: string | null; name: string; size?: number }) {
  const dim = `${size * 4}px`;
  return (
    <div
      className="rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: dim, height: dim }}
    >
      {avatar ? (
        <img src={avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <User size={size * 1.5} className="text-muted-foreground" />
      )}
    </div>
  );
}

export function HookReviewsSheet({ postId, onClose, onRemoved, onVoteChange, spotifyTrackUrl, artistsJson }: Props) {
  const { user, profile } = useAuth();
  
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [post, setPost] = useState<PostMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [localVote, setLocalVote] = useState<boolean | null | undefined>(undefined);
  const [voteLoading, setVoteLoading] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setRows([]);
    setPost(null);
    setLocalVote(undefined);

    (async () => {
      const [postRes, reviewsRes] = await Promise.all([
        supabase
          .from("songfit_posts")
          .select("track_title, track_artists_json, album_art_url, caption")
          .eq("id", postId)
          .single(),
        supabase
          .from("songfit_hook_reviews")
          .select("id, hook_rating, would_replay, context_note, created_at, user_id, session_id")
          .eq("post_id", postId)
          .order("created_at", { ascending: false }),
      ]);

      if (postRes.data) {
        const raw = postRes.data;
        const artists = Array.isArray(raw.track_artists_json)
          ? (raw.track_artists_json as { name: string }[])
          : [];
        setPost({
          track_title: raw.track_title,
          track_artists_json: artists,
          album_art_url: raw.album_art_url,
          caption: raw.caption,
        });
      }

      const reviews = reviewsRes.data ?? [];
      if (reviews.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Detect current user's vote
      if (user) {
        const existing = reviews.find(r => r.user_id === user.id);
        setLocalVote(existing ? existing.would_replay : null);
      }

      const userIds = [...new Set(reviews.filter(r => r.user_id).map(r => r.user_id!))];
      let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles || []) {
          profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
      }

      const reviewIds = reviews.map(r => r.id);
      const { data: allComments } = await supabase
        .from("songfit_comments")
        .select("id, content, created_at, user_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      const tagPattern = /^\[review:([a-f0-9-]+)\] /;
      const repliesData = (allComments ?? []).filter(c => tagPattern.test(c.content));

      const replyProfileIds = [...new Set(repliesData.filter(r => r.user_id).map(r => r.user_id!))];
      let replyProfileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = { ...profileMap };
      const newIds = replyProfileIds.filter(id => !replyProfileMap[id]);
      if (newIds.length > 0) {
        const { data: rp } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", newIds);
        for (const p of rp || []) replyProfileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }

      const replyMap: Record<string, Reply[]> = {};
      for (const reply of repliesData) {
        const match = reply.content.match(tagPattern);
        if (!match) continue;
        const reviewId = match[1];
        if (!reviewIds.includes(reviewId)) continue;
        if (!replyMap[reviewId]) replyMap[reviewId] = [];
        replyMap[reviewId].push({
          id: reply.id,
          content: reply.content.replace(tagPattern, ""),
          created_at: reply.created_at,
          user_id: reply.user_id,
          profiles: reply.user_id ? (replyProfileMap[reply.user_id] ?? null) : null,
        });
      }

      setRows(reviews.map(r => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
        replies: replyMap[r.id] ?? [],
        showReplies: true,
        showReplyInput: false,
      })) as ReviewRow[]);
      setLoading(false);
    })();
  }, [postId]);

  const removeReview = useCallback(async (reviewId: string) => {
    const { error } = await supabase.from("songfit_hook_reviews").delete().eq("id", reviewId);
    if (error) { toast.error("Failed to remove review"); return; }
    setRows(prev => prev.filter(r => r.id !== reviewId));
    onRemoved?.();
  }, [onRemoved]);

  const handleVoteChange = async (vote: boolean) => {
    if (!user || !postId) return;
    setVoteLoading(true);
    try {
      // Remove existing vote first
      if (localVote !== null && localVote !== undefined) {
        await supabase
          .from("songfit_hook_reviews")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
      }
      // If tapping same vote, just remove (toggle off)
      if (vote === localVote) {
        setLocalVote(null);
        onVoteChange?.(null);
        setRows(prev => prev.filter(r => r.user_id !== user.id));
      } else {
        // Insert new vote
        await supabase.from("songfit_hook_reviews").insert({
          post_id: postId,
          user_id: user.id,
          hook_rating: "solid",
          would_replay: vote,
          context_note: null,
        });
        setLocalVote(vote);
        onVoteChange?.(vote);
        // Refresh rows
        setRows(prev => {
          const without = prev.filter(r => r.user_id !== user.id);
          const newRow: ReviewRow = {
            id: crypto.randomUUID(),
            hook_rating: "solid",
            would_replay: vote,
            context_note: null,
            created_at: new Date().toISOString(),
            user_id: user.id,
            session_id: null,
            profiles: { display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
            replies: [],
            showReplies: true,
            showReplyInput: false,
          };
          return [newRow, ...without];
        });
      }
      window.dispatchEvent(new CustomEvent("crowdfit:vote"));
    } catch {}
    setVoteLoading(false);
  };

  const openReplyInput = useCallback((reviewId: string, mentionName?: string) => {
    setRows(prev => prev.map(r =>
      r.id === reviewId
        ? { ...r, showReplyInput: true, showReplies: true }
        : { ...r, showReplyInput: false }
    ));
    if (mentionName) {
      setReplyTexts(prev => ({
        ...prev,
        [reviewId]: `@${mentionName} `,
      }));
    }
    setTimeout(() => inputRefs.current[reviewId]?.focus(), 80);
  }, []);

  const submitReply = useCallback(async (reviewId: string) => {
    const text = (replyTexts[reviewId] ?? "").trim();
    if (!text || !user || !postId) return;
    setReplySubmitting(prev => ({ ...prev, [reviewId]: true }));
    const taggedContent = `[review:${reviewId}] ${text}`;
    try {
      const { data, error } = await supabase.from("songfit_comments").insert({
        post_id: postId,
        user_id: user.id,
        content: taggedContent,
      }).select("id, content, created_at, user_id").single();
      if (error) throw error;
      const newReply: Reply = {
        id: data.id,
        content: text,
        created_at: data.created_at,
        user_id: data.user_id,
        profiles: { display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
      };
      setRows(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, replies: [...r.replies, newReply], showReplyInput: false, showReplies: true }
          : r
      ));
      setReplyTexts(prev => ({ ...prev, [reviewId]: "" }));
    } catch {}
    setReplySubmitting(prev => ({ ...prev, [reviewId]: false }));
  }, [replyTexts, user, postId, profile]);

  const artistNames = post?.track_artists_json.map(a => a.name).join(", ") ?? "";

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">

        {/* ── Header ── */}
        <div className="shrink-0 border-b border-border/30">

          {/* Song identity row */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            {post?.album_art_url ? (
              <img
                src={post.album_art_url}
                alt={post?.track_title}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music size={14} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold leading-tight truncate">
                {post?.track_title ?? "Loading…"}
              </h2>
              {artistNames && (
                <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{artistNames}</p>
              )}
            </div>
            {/* Follow / Save — text only */}
            <div className="flex items-center gap-3 shrink-0">
              {artistsJson?.[0]?.spotifyUrl && (
                <a
                  href={artistsJson[0].spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Follow
                </a>
              )}
              {spotifyTrackUrl && (
                <a
                  href={spotifyTrackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Save
                </a>
              )}
            </div>
          </div>

          {/* Caption — tap to expand, no label */}
          {post?.caption && (
            <button
              onClick={() => setLyricsExpanded(prev => !prev)}
              className="w-full text-left px-4 pb-3"
            >
              <p className={`text-[11px] leading-relaxed text-muted-foreground/50 whitespace-pre-wrap ${lyricsExpanded ? "" : "line-clamp-1"}`}>
                {post.caption}
              </p>
            </button>
          )}

          {/* Score — flat typographic row */}
          {!loading && rows.length > 0 && (() => {
            const total = rows.length;
            const signals = rows.filter(r => r.would_replay).length;
            const pct = total > 0 ? Math.round((signals / total) * 100) : 0;
            return (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border/20">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {signals > 0 ? `${pct}% replay fit` : "calibrating"}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/40">
                  {total} {total === 1 ? "signal" : "signals"}
                </span>
              </div>
            );
          })()}

          {/* YOUR SIGNAL vote controls */}
          {user && (
            <div className="border-t border-border/20">
              <div className="flex items-stretch">
                <button
                  onClick={() => handleVoteChange(true)}
                  disabled={voteLoading}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group"
                >
                  <span className={`text-[11px] font-mono tracking-[0.18em] uppercase transition-colors ${
                    localVote === true
                      ? "text-foreground"
                      : "text-muted-foreground/50 group-hover:text-muted-foreground"
                  }`}>
                    {localVote === true ? "✓ Run it back" : "Run it back"}
                  </span>
                </button>
                <div style={{ width: "0.5px" }} className="bg-border/30 self-stretch my-2" />
                <button
                  onClick={() => handleVoteChange(false)}
                  disabled={voteLoading}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-foreground/[0.03] transition-colors duration-[120ms] group"
                >
                  <span className={`text-[11px] font-mono tracking-[0.18em] uppercase transition-colors ${
                    localVote === false
                      ? "text-foreground"
                      : "text-muted-foreground/50 group-hover:text-muted-foreground"
                  }`}>
                    {localVote === false ? "✓ Skip" : "Skip"}
                  </span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ── Reviews list ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No reviews yet.</p>
          ) : (
            <div>
              {rows.map((row) => {
                const name = row.profiles?.display_name || (row.user_id ? "User" : "Anonymous");
                const avatar = row.profiles?.avatar_url;
                const hasReplies = row.replies.length > 0;

                return (
                  <div key={row.id} className="px-4 pt-4 pb-1">
                    {/* ── Top-level review ── */}
                    <div className="flex gap-3">
                      {/* Avatar + thread line */}
                      <div className="flex flex-col items-center shrink-0">
                        <AvatarBubble avatar={avatar} name={name} size={8} />
                        {(hasReplies || row.showReplyInput) && (
                          <div className="w-px flex-1 bg-border/40 mt-2 min-h-[12px]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-2">
                         {/* Name + vote state via typography */}
                         <div className="flex items-center gap-2 mb-0.5">
                           <span className="text-sm font-semibold leading-none">{name}</span>
                           <span className={`text-[10px] font-mono uppercase tracking-wider ${
                             row.would_replay ? "text-muted-foreground/60" : "text-muted-foreground/30"
                           }`}>
                             {row.would_replay ? "replay" : "skip"}
                           </span>
                         </div>

                        {row.context_note && (
                          <p className="text-sm text-foreground/80 leading-snug mb-1">{row.context_note}</p>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground/50">
                            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                          </span>
                          {user && (
                             <button
                               onClick={() => openReplyInput(row.id)}
                               className="text-xs font-semibold text-muted-foreground/60 hover:text-foreground transition-colors"
                             >
                               Reply
                             </button>
                           )}
                           {user && user.id === row.user_id && (
                             <button
                               onClick={() => removeReview(row.id)}
                               className="text-[11px] text-muted-foreground/30 hover:text-destructive/70 transition-colors"
                             >
                               Remove
                             </button>
                           )}
                        </div>
                      </div>
                    </div>

                    {/* ── Replies ── */}
                    {hasReplies && (
                      <div className="ml-11 border-l border-border/30">
                        {row.replies.map((reply) => {
                          const rName = reply.profiles?.display_name || "User";
                          const rAvatar = reply.profiles?.avatar_url;
                          return (
                            <div key={reply.id} className="flex gap-2.5 py-2 pl-3">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                                {rAvatar
                                  ? <img src={rAvatar} alt="" className="w-full h-full object-cover" />
                                  : <User size={11} className="text-muted-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-snug">
                                  <span className="font-semibold mr-1.5">{rName}</span>
                                  <span className="text-foreground/80">{reply.content}</span>
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[11px] text-muted-foreground/50">
                                    {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                                  </span>
                                  {user && (
                                    <button
                                      onClick={() => openReplyInput(row.id, rName)}
                                      className="text-[11px] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors"
                                    >
                                      Reply
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Inline reply composer ── */}
                    {row.showReplyInput && user && (
                      <div className="ml-11 flex items-center gap-2 mb-3 mt-1">
                        <AvatarBubble avatar={profile?.avatar_url} name={profile?.display_name ?? "You"} size={6} />
                        <div className="flex-1 flex items-center gap-2 bg-transparent border border-border/50 rounded-full px-3 py-1.5">
                          <input
                            ref={el => { inputRefs.current[row.id] = el; }}
                            value={replyTexts[row.id] ?? ""}
                            onChange={e => setReplyTexts(prev => ({ ...prev, [row.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submitReply(row.id);
                              }
                              if (e.key === "Escape") {
                                setRows(prev => prev.map(r => r.id === row.id ? { ...r, showReplyInput: false } : r));
                              }
                            }}
                            placeholder={`Reply to ${name}…`}
                            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
                          />
                          <button
                            onClick={() => submitReply(row.id)}
                            disabled={!replyTexts[row.id]?.trim() || replySubmitting[row.id]}
                            className="text-primary disabled:opacity-30 transition-opacity"
                          >
                            {replySubmitting[row.id]
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Send size={13} />
                            }
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-b border-border/20 mt-2" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
