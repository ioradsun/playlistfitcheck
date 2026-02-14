import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Send, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { SongFitComment } from "./types";
import { formatDistanceToNow } from "date-fns";

interface Props {
  postId: string;
  onBack: () => void;
}

export function SongFitComments({ postId, onBack }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<SongFitComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("songfit_comments")
      .select("*, profiles:user_id(display_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(100);
    setComments((data || []) as unknown as SongFitComment[]);
    setLoading(false);
  };

  useEffect(() => { fetchComments(); }, [postId]);

  const submitComment = async () => {
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!text.trim()) return;
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
    <div className="w-full max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft size={18} /></Button>
        <h3 className="font-semibold">Comments</h3>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No comments yet</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {c.profiles?.avatar_url ? (
                  <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={12} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold mr-1">{c.profiles?.display_name || "Anonymous"}</span>
                  {c.content}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment input */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Input
          placeholder={user ? "Add a comment..." : "Sign in to comment"}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submitComment(); }}
          disabled={!user || sending}
          maxLength={1000}
        />
        <Button size="icon" onClick={submitComment} disabled={!user || sending || !text.trim()}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
    </div>
  );
}
