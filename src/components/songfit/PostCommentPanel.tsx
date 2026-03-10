import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Send, X } from "lucide-react";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  palette?: string[];
  hideOwnInput?: boolean;
  externalText?: string;
  onRegisterSubmit?: (fn: () => void) => void;
}

export function PostCommentPanel({ postId, isOpen, onClose, palette = ["#a855f7"], hideOwnInput = false, externalText, onRegisterSubmit }: Props) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !postId) return;
    const load = async () => {
      const { data } = await supabase
        .from("songfit_comments")
        .select("id, content, created_at, user_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(50);

      const rows = data ?? [];
      const userIds = [...new Set(rows.filter((r) => r.user_id).map((r) => r.user_id!))];
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles ?? []) profileMap[p.id] = p;
      }
      setComments(rows.map((r) => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
      })));
    };
    load();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, postId]);

  const handleSubmit = useCallback(async () => {
    const content = (externalText !== undefined ? externalText : text).trim();
    if (!content || !user || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("songfit_comments")
        .insert({ post_id: postId, user_id: user.id, content })
        .select("id, content, created_at, user_id")
        .single();
      if (!error && data) {
        setComments((prev) => [{
          ...data,
          profiles: { display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
        }, ...prev]);
        if (externalText === undefined) setText("");
      }
    } catch {}
    setSubmitting(false);
  }, [externalText, postId, profile?.avatar_url, profile?.display_name, submitting, text, user]);

  useEffect(() => {
    if (!onRegisterSubmit) return;
    onRegisterSubmit(handleSubmit);
  }, [handleSubmit, onRegisterSubmit]);

  if (!isOpen) return null;

  const accentColor = palette[1] ?? "#a855f7";

  return (
    <div
      className={`absolute inset-x-0 top-0 z-[200] flex flex-col ${hideOwnInput ? "bottom-[44px]" : "inset-0"}`}
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)" }}
    >
      <div className="flex items-center px-4 py-3 shrink-0">
        <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">FMLY</span>
      </div>

      <div className="h-px mx-4 shrink-0" style={{ background: accentColor, opacity: 0.3 }} />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {comments.length === 0 ? (
          <p className="text-[11px] font-mono text-white/20 text-center pt-8">No takes yet. Drop the first one.</p>
        ) : (
          comments.map((c) => {
            const name = c.profiles?.display_name ?? "anon";
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full shrink-0 overflow-hidden bg-white/10 flex items-center justify-center mt-0.5">
                  {c.profiles?.avatar_url ? (
                    <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-white/40 font-mono">{name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug text-white/80">
                    <span className="font-semibold text-white/60 mr-1.5">{name}</span>
                    {c.content}
                  </p>
                  <p className="text-[10px] text-white/25 mt-0.5 font-mono">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!hideOwnInput && (
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-3 border-t"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          {user ? (
            <>
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                  if (e.key === "Escape") onClose();
                }}
                placeholder="Drop your take"
                className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/25 outline-none font-mono"
              />
              {text.trim() ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="text-white/40 hover:text-white/80 disabled:opacity-20 transition-colors"
                >
                  <Send size={14} />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </>
          ) : (
            <p className="text-[11px] font-mono text-white/30">Sign in to drop a take</p>
          )}
        </div>
      )}
    </div>
  );
}
