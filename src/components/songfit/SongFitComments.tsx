import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Send, Loader2 } from "lucide-react";
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

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function SongFitComments({ postId, onClose }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<SongFitComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchComments = async () => {
    if (!postId) return;
    setLoading(true);
    const { data } = await supabase
      .from("songfit_comments")
      .select("*, profiles!songfit_comments_user_id_profiles_fkey(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(100);
    setComments((data || []) as unknown as SongFitComment[]);
    setLoading(false);
    // Scroll to bottom after load
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  useEffect(() => {
    if (postId) {
      setComments([]);
      setText("");
      fetchComments();
    }
  }, [postId]);

  const submitComment = async () => {
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!text.trim() || !postId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("songfit_comments").insert({
        post_id: postId,
        user_id: user.id,
        content: text.trim(),
      });
      if (error) throw error;
      setText("");
      fetchComments();
    } catch (e: any) {
      toast.error(e.message || "Failed to comment");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/40 shrink-0">
          <SheetTitle className="text-base">Comments</SheetTitle>
        </SheetHeader>

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No comments yet — be the first!</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {c.profiles?.avatar_url ? (
                    <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={13} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    <span className="font-semibold mr-1.5">{c.profiles?.display_name || "Anonymous"}</span>
                    {c.content}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input pinned at bottom */}
        <div className="shrink-0 border-t border-border px-4 py-3 bg-background">
          <div className="flex gap-2">
            <Input
              placeholder={user ? "Add a comment..." : "Sign in to comment"}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitComment(); }}
              disabled={!user || sending}
              maxLength={1000}
              className="h-10 text-sm"
            />
            <Button size="icon" className="h-10 w-10 shrink-0" onClick={submitComment} disabled={!user || sending || !text.trim()}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
