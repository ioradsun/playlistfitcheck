import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Loader2, CornerDownRight, Smile, Trash2, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { DreamComment, Dream } from "./types";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";


const QUICK_EMOJIS = ["🔥", "❤️", "🙌", "💯", "😍", "🚀", "👏", "✨"];

interface Props {
  dreamId: string | null;
  dream?: Dream | null;
  onClose: () => void;
  onCommentAdded?: (dreamId: string) => void;
}

function buildTree(comments: DreamComment[]): (DreamComment & { replies: DreamComment[] })[] {
  const map = new Map<string, DreamComment & { replies: DreamComment[] }>();
  const roots: (DreamComment & { replies: DreamComment[] })[] = [];
  comments.forEach(c => map.set(c.id, { ...c, replies: [] }));
  map.forEach(c => {
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id)!.replies.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function CommentItem({
  comment, depth, onReply, onDelete, onToggleLike, currentUserId, likedSet, signalMap,
}: {
  comment: DreamComment & { replies?: DreamComment[] };
  depth: number;
  onReply: (commentId: string, displayName: string) => void;
  onDelete: (commentId: string) => void;
  onToggleLike: (commentId: string, liked: boolean) => void;
  currentUserId?: string;
  likedSet: Set<string>;
  signalMap: Record<string, string>;
}) {
  const displayName = comment.profiles?.display_name || "Anonymous";
  const isOwn = currentUserId === comment.user_id;
  const liked = likedSet.has(comment.id);
  const likesCount = (comment as any).likes_count ?? 0;
  const signal = comment.user_id ? signalMap[comment.user_id] : undefined;

  return (
    <div style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div className="flex gap-2.5 py-2 group">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
          {comment.profiles?.avatar_url
            ? <img src={comment.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
            : <User size={12} className="text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="font-semibold text-sm leading-none">{displayName}</span>
            {signal && (
              <span className="text-[10px] border border-border/30 rounded-full px-2 py-0.5 text-muted-foreground/60">
                {signal === "greenlight" ? "Greenlighted" : "Shelved"}
              </span>
            )}
          </div>
          <p className="text-sm leading-snug text-foreground/80">{comment.content}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            <button
              onClick={() => onReply(comment.id, displayName)}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Reply
            </button>
            {isOwn && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => currentUserId && onToggleLike(comment.id, liked)}
          className="flex flex-col items-center gap-0.5 shrink-0 ml-1 mt-0.5"
          title={currentUserId ? (liked ? "Unlike" : "Like") : "Sign in to like"}
        >
          <Heart size={13} className={cn("transition-all", liked ? "fill-destructive text-destructive" : "text-muted-foreground hover:text-destructive")} />
          {likesCount > 0 && <span className="text-[10px] text-muted-foreground leading-none">{likesCount}</span>}
        </button>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="border-l border-border/30 ml-3.5">
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply as any}
              depth={depth + 1}
              onReply={onReply}
              onDelete={onDelete}
              onToggleLike={onToggleLike}
              currentUserId={currentUserId}
              likedSet={likedSet}
              signalMap={signalMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getSignalVerbiage(total: number, pct: number) {
  if (total < 50) {
    return {
      label: "",
      sublabel: undefined,
      summary: "CALIBRATING BUILD FIT",
      signalLine: `${total}/50 SIGNALS NEEDED`,
      bigDisplay: `${pct}%`,
      tier: total <= 10 ? "resolving" as const : "detected" as const,
    };
  }
  return {
    label: "CONSENSUS REACHED",
    sublabel: undefined,
    summary: `${pct}% FMLY BUILD FIT`,
    signalLine: undefined,
    bigDisplay: `${pct}%`,
    tier: "consensus" as const,
  };
}

export function DreamComments({ dreamId, dream, onClose, onCommentAdded }: Props) {
  const { user } = useAuth();
  
  const [comments, setComments] = useState<DreamComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [signalMap, setSignalMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchComments = async () => {
    if (!dreamId) return;
    setLoading(true);
    const [commentsRes, backersRes] = await Promise.all([
      supabase
        .from("dream_comments")
        .select("*, profiles:user_id(display_name, avatar_url), likes_count")
        .eq("dream_id", dreamId)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("dream_backers")
        .select("user_id, signal_type")
        .eq("dream_id", dreamId)
        .not("user_id", "is", null),
    ]);

    const fetched = ((commentsRes.data as any) || []) as DreamComment[];
    setComments(fetched);

    // Build signal map: user_id → signal_type
    const sMap: Record<string, string> = {};
    for (const b of (backersRes.data || [])) {
      if (b.user_id) sMap[b.user_id] = b.signal_type;
    }
    setSignalMap(sMap);

    if (user && fetched.length > 0) {
      const ids = fetched.map(c => c.id);
      const { data: liked } = await supabase
        .from("dream_comment_likes")
        .select("comment_id")
        .eq("user_id", user.id)
        .in("comment_id", ids);
      setLikedSet(new Set((liked || []).map((l: any) => l.comment_id)));
    } else {
      setLikedSet(new Set());
    }

    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  useEffect(() => {
    if (dreamId) {
      setComments([]);
      setText("");
      setReplyTo(null);
      setShowEmoji(false);
      fetchComments();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [dreamId]);

  const handleToggleLike = async (commentId: string, alreadyLiked: boolean) => {
    if (!user) { toast.error("Sign in to like"); return; }
    setLikedSet(prev => { const next = new Set(prev); alreadyLiked ? next.delete(commentId) : next.add(commentId); return next; });
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, likes_count: ((c as any).likes_count ?? 0) + (alreadyLiked ? -1 : 1) } as any : c));
    try {
      if (alreadyLiked) {
        await supabase.from("dream_comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
      } else {
        await supabase.from("dream_comment_likes").insert({ comment_id: commentId, user_id: user.id });
      }
    } catch { fetchComments(); }
  };

  const submitComment = async () => {
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!text.trim() || !dreamId) return;
    setSending(true);
    try {
      const insertData: any = { dream_id: dreamId, user_id: user.id, content: text.trim() };
      if (replyTo) insertData.parent_comment_id = replyTo.id;
      const { error } = await supabase.from("dream_comments").insert(insertData);
      if (error) throw error;
      setText("");
      setReplyTo(null);
      setShowEmoji(false);
      await fetchComments();
      onCommentAdded?.(dreamId!);
      inputRef.current?.focus();
    } catch (e: any) {
      toast.error(e.message || "Failed to comment");
    } finally {
      setSending(false);
    }
  };

  const handleReply = (commentId: string, displayName: string) => {
    setReplyTo({ id: commentId, name: displayName });
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const handleDelete = async (commentId: string) => {
    try {
      const { error } = await supabase.from("dream_comments").delete().eq("id", commentId);
      if (error) throw error;
      await fetchComments();
      if (dreamId) onCommentAdded?.(dreamId);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const tree = buildTree(comments);
  const displayName = dream?.profiles?.display_name || "Anonymous";

  // Demand strength stats
  const backersCount = dream?.backers_count ?? 0;
  const greenlightCount = dream?.greenlight_count ?? 0;
  const demandPct = backersCount > 0 ? Math.round((greenlightCount / backersCount) * 100) : 0;
  const shelveCount = backersCount - greenlightCount;

  return (
    <Sheet open={!!dreamId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">

        {/* ── Post identity header — no title, poster + idea pushed to top ── */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 space-y-4">

          {/* Poster row */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20 shrink-0">
              {dream?.profiles?.avatar_url
                ? <img src={dream.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                : <User size={16} className="text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-bold leading-tight">{displayName}</p>
              {dream?.title && (
                <p className="text-sm text-foreground/80 leading-snug mt-1">{dream.title}</p>
              )}
            </div>
          </div>

          {/* Stat cards — Signal Status + Signals */}
          {backersCount > 0 && (() => {
            const verbiage = getSignalVerbiage(backersCount, demandPct);
            return (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
                    Signal Status
                  </p>
                  <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
                    {verbiage.bigDisplay}
                  </p>
                  {verbiage.label && (
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-snug mt-0.5 truncate">
                      {verbiage.label}
                    </p>
                  )}
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-snug">
                    {verbiage.summary}
                  </p>
                  {verbiage.signalLine && (
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-snug">
                      {verbiage.signalLine}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5 flex flex-col gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
                    Signals
                  </p>
                  <p className="text-2xl font-bold leading-none text-foreground tracking-tight">
                    {backersCount}
                  </p>
                  <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-snug mt-0.5">
                    {greenlightCount} {greenlightCount === 1 ? "SIGNAL" : "SIGNALS"}<br />{shelveCount} Bypassed
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Comments list ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : tree.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No comments yet — be the first!</p>
          ) : (
            tree.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                depth={0}
                onReply={handleReply}
                onDelete={handleDelete}
                onToggleLike={handleToggleLike}
                currentUserId={user?.id}
                likedSet={likedSet}
                signalMap={signalMap}
              />
            ))
          )}
        </div>

        {/* ── Input footer ── */}
        <div className="shrink-0 border-t border-border bg-background">
          {replyTo && (
            <div className="flex items-center gap-2 px-4 pt-2 text-xs text-muted-foreground">
              <CornerDownRight size={12} />
              <span>Replying to <span className="font-semibold text-foreground">{replyTo.name}</span></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}
          {showEmoji && (
            <div className="flex items-center gap-1 px-4 pt-2 pb-1 flex-wrap">
              {QUICK_EMOJIS.map(e => (
                <button key={e} onClick={() => { setText(prev => prev + e); inputRef.current?.focus(); }} className="text-lg hover:scale-125 transition-transform p-1">{e}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Smile size={18} />
            </button>
            <Input
              ref={inputRef}
              placeholder={user ? (replyTo ? `Reply to ${replyTo.name}...` : "Add a comment...") : "Sign in to comment"}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitComment(); }}
              disabled={!user || sending}
              maxLength={1000}
              className="h-9 text-sm"
            />
            <Button size="sm" className="shrink-0" onClick={submitComment} disabled={!user || sending || !text.trim()}>
              {sending ? "…" : "Send"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
