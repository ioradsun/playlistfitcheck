import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Send, X, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { DreamComment } from "./types";

interface Props {
  dreamId: string;
  onClose: () => void;
}

export function DreamComments({ dreamId, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [comments, setComments] = useState<DreamComment[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dream_comments")
      .select("*, profiles:user_id(display_name, avatar_url)")
      .eq("dream_id", dreamId)
      .order("created_at", { ascending: true });
    setComments((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchComments();
  }, [dreamId]);

  const handleSubmit = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("dream_comments").insert({
        dream_id: dreamId,
        user_id: user.id,
        content: content.trim(),
      });
      if (error) throw error;
      setContent("");
      fetchComments();
    } catch (e: any) {
      toast.error(e.message || "Failed to comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("dream_comments").delete().eq("id", id);
    fetchComments();
  };

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Comments</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No comments yet. Be first!</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="group flex items-start gap-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{c.profiles?.display_name || "Anonymous"}</span>{" "}
                  <span className="text-muted-foreground">{c.content}</span>
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
              </div>
              {user?.id === c.user_id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive hover:bg-muted rounded transition-all"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        className="flex items-center gap-2"
      >
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={user ? "Add a comment..." : "Sign in to comment"}
          className="flex-1 h-8 px-3 rounded-md bg-muted border-0 text-xs outline-none"
          disabled={!user}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!content.trim() || submitting || !user}
          className="p-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
        >
          <Send size={12} />
        </button>
      </form>
    </div>
  );
}
