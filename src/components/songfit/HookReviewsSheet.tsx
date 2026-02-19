import { useEffect, useState, useCallback } from "react";
import { User, Music, Heart, CornerDownRight, X, ChevronDown } from "lucide-react";
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
  // client-side
  likes: number;
  liked: boolean;
  replies: Reply[];
  showReply: boolean;
}

interface PostMeta {
  track_title: string;
  track_artists_json: { name: string }[];
  album_art_url: string | null;
  caption: string | null;
}

const RATING_LABEL: Record<string, string> = {
  missed: "Missed",
  almost: "Almost",
  solid: "Solid",
  hit: "Hit",
};

const RATING_COLOR: Record<string, string> = {
  missed: "text-destructive/80",
  almost: "text-yellow-500",
  solid: "text-primary/80",
  hit: "text-primary",
};

const RATING_BG: Record<string, string> = {
  missed: "bg-destructive/10",
  almost: "bg-yellow-500/10",
  solid: "bg-primary/10",
  hit: "bg-primary/15",
};

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function HookReviewsSheet({ postId, onClose }: Props) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [post, setPost] = useState<PostMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});

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

      // Fetch profiles for non-null user_ids
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

      // Fetch replies stored as tagged comments: content starts with [review:<id>]
      const reviewIds = reviews.map(r => r.id);
      const { data: allComments } = await supabase
        .from("songfit_comments")
        .select("id, content, created_at, user_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      // Parse out which review each tagged comment belongs to
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
        likes: 0,
        liked: false,
        replies: replyMap[r.id] ?? [],
        showReply: false,
      })) as ReviewRow[]);
      setLoading(false);
    })();
  }, [postId]);

  const toggleLike = useCallback((reviewId: string) => {
    setRows(prev => prev.map(r =>
      r.id === reviewId
        ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
        : r
    ));
  }, []);

  const toggleReply = useCallback((reviewId: string) => {
    setRows(prev => prev.map(r =>
      r.id === reviewId ? { ...r, showReply: !r.showReply } : r
    ));
  }, []);

  const submitReply = useCallback(async (reviewId: string) => {
    const text = (replyTexts[reviewId] ?? "").trim();
    if (!text || !user || !postId) return;
    setReplySubmitting(prev => ({ ...prev, [reviewId]: true }));
    // Encode the review reference in content as a tag so we don't violate
    // the FK constraint (parent_comment_id must reference songfit_comments)
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
        content: text, // display without the [review:...] tag
        created_at: data.created_at,
        user_id: data.user_id,
        profiles: { display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
      };
      setRows(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, replies: [...r.replies, newReply], showReply: false }
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
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 space-y-3">
          {/* Track identity */}
          <div className="flex items-center gap-3">
            {post?.album_art_url ? (
              <img
                src={post.album_art_url}
                alt={post?.track_title}
                className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Music size={18} className="text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-0.5">
                Hook Reviews
              </p>
              <h2 className="text-sm font-bold leading-tight truncate">
                {post?.track_title ?? "Loading…"}
              </h2>
              {artistNames && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{artistNames}</p>
              )}
            </div>
          </div>

          {/* Hook lyrics — collapsible */}
          {post?.caption && (
            <button
              onClick={() => setLyricsExpanded(prev => !prev)}
              className="w-full text-left rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 hover:bg-muted/60 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  Hook Lyrics
                </p>
                <ChevronDown
                  size={13}
                  className={`text-muted-foreground/40 transition-transform duration-200 group-hover:text-muted-foreground/70 ${lyricsExpanded ? "rotate-180" : ""}`}
                />
              </div>
              <div className={`overflow-hidden transition-all duration-200 ${lyricsExpanded ? "max-h-96" : "max-h-10"}`}>
                <p className={`text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap ${!lyricsExpanded ? "line-clamp-2" : ""}`}>
                  {post.caption}
                </p>
              </div>
              {!lyricsExpanded && (
                <p className="text-[10px] text-muted-foreground/40 mt-1">Tap to expand</p>
              )}
            </button>
          )}

          {/* Review count */}
          {!loading && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{rows.length}</span>{" "}
              {rows.length === 1 ? "review" : "reviews"}
            </p>
          )}
        </div>

        {/* ── Reviews list ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No reviews yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const name = row.profiles?.display_name || (row.user_id ? "User" : "Anonymous");
                const avatar = row.profiles?.avatar_url;
                return (
                  <div key={row.id} className="rounded-xl bg-muted/20 px-3 py-3 space-y-2">
                    {/* Row: avatar + content */}
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                        {avatar ? (
                          <img src={avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={13} className="text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Name + rating badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-sm font-semibold leading-none">{name}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${RATING_COLOR[row.hook_rating] ?? "text-muted-foreground"} ${RATING_BG[row.hook_rating] ?? "bg-muted/40"}`}>
                            {RATING_LABEL[row.hook_rating] ?? row.hook_rating}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md select-none ${row.would_replay ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted/60"}`}>
                            {row.would_replay ? "Replay" : "Skip"}
                          </span>
                        </div>

                        {row.context_note && (
                          <p className="text-xs text-foreground/75 leading-snug">{row.context_note}</p>
                        )}

                        {/* Actions row */}
                        <div className="flex items-center gap-3 mt-1.5">
                          <p className="text-[10px] text-muted-foreground/40 flex-1">
                            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                          </p>
                          {/* Like */}
                          <button
                            onClick={() => toggleLike(row.id)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors group"
                          >
                            <Heart
                              size={12}
                              className={row.liked ? "fill-primary text-primary" : "group-hover:text-primary"}
                            />
                            {row.likes > 0 && <span className={row.liked ? "text-primary" : ""}>{row.likes}</span>}
                          </button>
                          {/* Reply */}
                          {user && (
                            <button
                              onClick={() => toggleReply(row.id)}
                              className="text-[11px] text-muted-foreground/60 hover:text-primary transition-colors"
                            >
                              Reply
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Replies */}
                    {row.replies.length > 0 && (
                      <div className="ml-10 space-y-2 border-l-2 border-border/30 pl-3">
                        {row.replies.map(reply => {
                          const rName = reply.profiles?.display_name || "User";
                          const rAvatar = reply.profiles?.avatar_url;
                          return (
                            <div key={reply.id} className="flex items-start gap-2">
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
                                {rAvatar ? (
                                  <img src={rAvatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <User size={10} className="text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[11px] font-semibold">{rName}</span>
                                <span className="text-[10px] text-muted-foreground/40 ml-1.5">
                                  {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                                </span>
                                <p className="text-xs text-foreground/75 leading-snug mt-0.5">{reply.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply composer */}
                    {row.showReply && user && (
                      <div className="ml-10 flex items-start gap-2">
                        <CornerDownRight size={12} className="text-muted-foreground/40 mt-2 shrink-0" />
                        <div className="flex-1 flex items-end gap-2 rounded-lg bg-muted/40 border border-border/50 px-2.5 py-1.5">
                          <textarea
                            autoFocus
                            value={replyTexts[row.id] ?? ""}
                            onChange={e => setReplyTexts(prev => ({ ...prev, [row.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submitReply(row.id);
                              }
                              if (e.key === "Escape") toggleReply(row.id);
                            }}
                            placeholder="Write a reply…"
                            rows={1}
                            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleReply(row.id)}
                              className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                              <X size={11} />
                            </button>
                            <button
                              onClick={() => submitReply(row.id)}
                              disabled={replySubmitting[row.id] || !(replyTexts[row.id] ?? "").trim()}
                              className="text-[11px] font-semibold text-primary hover:text-primary/80 disabled:opacity-40 transition-colors"
                            >
                              {replySubmitting[row.id] ? <Loader2 size={11} className="animate-spin" /> : "Post"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
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
