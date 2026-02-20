import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { User, Music, Heart, ChevronDown, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { useSiteCopy } from "@/hooks/useSiteCopy";

interface Reply {
  id: string;
  content: string;
  created_at: string;
  user_id: string | null;
  liked: boolean;
  likes: number;
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
  likes: number;
  liked: boolean;
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

export function HookReviewsSheet({ postId, onClose, onRemoved }: Props) {
  const { user, profile } = useAuth();
  const siteCopy = useSiteCopy();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [post, setPost] = useState<PostMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    setRows([]);
    setPost(null);

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
          liked: false,
          likes: 0,
          profiles: reply.user_id ? (replyProfileMap[reply.user_id] ?? null) : null,
        });
      }

      setRows(reviews.map(r => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
        likes: 0,
        liked: false,
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

  const toggleLike = useCallback((reviewId: string) => {
    setRows(prev => prev.map(r =>
      r.id === reviewId
        ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
        : r
    ));
  }, []);

  const toggleReplyLike = useCallback((reviewId: string, replyId: string) => {
    setRows(prev => prev.map(r =>
      r.id === reviewId
        ? {
            ...r,
            replies: r.replies.map(rep =>
              rep.id === replyId
                ? { ...rep, liked: !rep.liked, likes: rep.liked ? rep.likes - 1 : rep.likes + 1 }
                : rep
            ),
          }
        : r
    ));
  }, []);

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
        liked: false,
        likes: 0,
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

        {/* ── Song identity header ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 space-y-4">

          {/* Song row */}
          <div className="flex items-center gap-3">
            {post?.album_art_url ? (
              <img
                src={post.album_art_url}
                alt={post?.track_title}
                className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Music size={16} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold leading-tight truncate">
                {post?.track_title ?? "Loading…"}
              </h2>
              {artistNames && (
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{artistNames}</p>
              )}
            </div>
          </div>

          {/* Stat cards */}
          {!loading && rows.length > 0 && (() => {
            const total = rows.length;
            const replayPct = Math.round((rows.filter(r => r.would_replay).length / total) * 100);
            const s = siteCopy.signals;
            const verbiage = (() => {
              if (total <= 10) return { label: s.resolving_label, summary: s.resolving_summary, bigDisplay: `${replayPct}%`, tier: "resolving" as const };
              if (total < 50) return { label: s.detected_label.replace("{n}", String(total)), summary: s.detected_summary, bigDisplay: `${total}/50`, tier: "detected" as const };
              return { label: s.consensus_label, summary: s.consensus_summary.replace("{pct}", String(replayPct)), bigDisplay: `${replayPct}%`, tier: "consensus" as const };
            })();
            return (
              <div className="grid grid-cols-2 gap-2.5">
                {/* Signal card */}
                <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
                    Signal Status
                  </p>
                  <p className={`text-2xl font-bold leading-none tracking-tight ${verbiage.tier === "resolving" ? "text-muted-foreground/40" : "text-foreground"}`}>
                    {verbiage.bigDisplay}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 leading-snug mt-0.5">
                    {verbiage.tier === "resolving" ? verbiage.label : verbiage.summary}
                  </p>
                </div>
                {/* Signals card */}
                <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
                    Signals
                  </p>
                  <p className="text-2xl font-bold leading-none text-foreground tracking-tight">
                    {total}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 leading-snug mt-0.5">
                    {rows.filter(r => r.would_replay).length} replay · {rows.filter(r => !r.would_replay).length} skip
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Hook lyrics — collapsible */}
          {post?.caption && (
            <button
              onClick={() => setLyricsExpanded(prev => !prev)}
              className="w-full text-left rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 hover:bg-muted/60 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <ChevronDown
                  size={13}
                  className={`text-muted-foreground/40 transition-transform duration-200 group-hover:text-muted-foreground/70 ${lyricsExpanded ? "rotate-180" : ""}`}
                />
              </div>
              {lyricsExpanded ? (
                <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {post.caption}
                </p>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-foreground/80 line-clamp-1">
                    {post.caption}
                  </p>
                  <p className="text-[10px] text-muted-foreground/40 mt-1">Tap to expand</p>
                </>
              )}
            </button>
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
                         {/* Name + badges */}
                         <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                           <span className="text-sm font-semibold leading-none">{name}</span>
                           <span className="text-[10px] border border-border/30 rounded-full px-2 py-0.5 text-muted-foreground/60">
                             {row.would_replay ? "Signaled" : "Bypassed"}
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
                          {row.likes > 0 && (
                            <span className="text-xs text-muted-foreground/50">
                              {row.likes} {row.likes === 1 ? "like" : "likes"}
                            </span>
                          )}
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

                      {/* Heart — right side */}
                      <button
                        onClick={() => toggleLike(row.id)}
                        className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5"
                      >
                        <Heart
                          size={14}
                          className={`transition-colors ${row.liked ? "fill-destructive text-destructive" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
                        />
                        {row.likes > 0 && (
                          <span className={`text-[10px] ${row.liked ? "text-destructive" : "text-muted-foreground/40"}`}>{row.likes}</span>
                        )}
                      </button>
                    </div>

                    {/* ── Replies ── */}
                    {hasReplies && (
                      <div className="ml-11 border-l border-border/30">
                        {row.replies.map((reply) => {
                          const rName = reply.profiles?.display_name || "User";
                          const rAvatar = reply.profiles?.avatar_url;
                          return (
                            <div key={reply.id} className="flex gap-2.5 py-2 pl-3 group">
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
                              <button
                                onClick={() => toggleReplyLike(row.id, reply.id)}
                                className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5"
                              >
                                <Heart
                                  size={13}
                                  className={`transition-colors ${reply.liked ? "fill-destructive text-destructive" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
                                />
                                {reply.likes > 0 && (
                                  <span className={`text-[10px] ${reply.liked ? "text-destructive" : "text-muted-foreground/40"}`}>{reply.likes}</span>
                                )}
                              </button>
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
