import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Send, Loader2, CornerDownRight, Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { SongFitComment } from "./types";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const QUICK_EMOJIS = ["🔥", "❤️", "🙌", "💯", "😍", "🎵", "👏", "✨"];

interface Props {
  postId: string | null;
  onClose: () => void;
}

function buildTree(comments: SongFitComment[]): SongFitComment[] {
  const map = new Map<string, SongFitComment>();
  const roots: SongFitComment[] = [];
  comments.forEach(c => map.set(c.id, { ...c, replies: [] }));
  map.forEach(c => {
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id)!.replies!.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function CommentItem({
  comment,
  depth,
  onReply,
}: {
  comment: SongFitComment;
  depth: number;
  onReply: (commentId: string, displayName: string) => void;
}) {
  const displayName = comment.profiles?.display_name || "Anonymous";
  return (
    <div style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div className="flex gap-2.5 py-2">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden mt-0.5">
          {comment.profiles?.avatar_url ? (
            <img src={comment.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={12} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            <span className="font-semibold mr-1.5">{displayName}</span>
            {comment.content}
          </p>
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
          </div>
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="border-l border-border/30 ml-3.5">
          {comment.replies.map(reply => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SongFitComments({ postId, onClose }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<SongFitComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchComments = async () => {
    if (!postId) return;
    setLoading(true);
    const { data } = await supabase
      .from("songfit_comments")
      .select("*, profiles!songfit_comments_user_id_profiles_fkey(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(200);
    setComments((data || []) as unknown as SongFitComment[]);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  useEffect(() => {
    if (postId) {
      setComments([]);
      setText("");
      setReplyTo(null);
      setShowEmoji(false);
      fetchComments();
    }
  }, [postId]);

  const submitComment = async () => {
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!text.trim() || !postId) return;
    setSending(true);
    try {
      const insertData: any = {
        post_id: postId,
        user_id: user.id,
        content: text.trim(),
      };
      if (replyTo) insertData.parent_comment_id = replyTo.id;

      const { error } = await supabase.from("songfit_comments").insert(insertData);
      if (error) throw error;
      setText("");
      setReplyTo(null);
      setShowEmoji(false);
      fetchComments();
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

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const tree = buildTree(comments);

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <SheetTitle className="text-base">Comments</SheetTitle>
        </SheetHeader>

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : tree.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No comments yet — be the first!</p>
          ) : (
            tree.map(c => (
              <CommentItem key={c.id} comment={c} depth={0} onReply={handleReply} />
            ))
          )}
        </div>

        {/* Input pinned at bottom */}
        <div className="shrink-0 border-t border-border bg-background">
          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 px-4 pt-2 text-xs text-muted-foreground">
              <CornerDownRight size={12} />
              <span>Replying to <span className="font-semibold text-foreground">{replyTo.name}</span></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}

          {/* Emoji quick-pick */}
          {showEmoji && (
            <div className="flex items-center gap-1 px-4 pt-2 pb-1 flex-wrap">
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => insertEmoji(e)}
                  className="text-lg hover:scale-125 transition-transform p-1"
                >
                  {e}
                </button>
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
            <Button size="icon" className="h-9 w-9 shrink-0" onClick={submitComment} disabled={!user || sending || !text.trim()}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
