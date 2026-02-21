import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  onCreated: () => void;
}

const MAX_LENGTH = 300;

export function DreamInlineComposer({ onCreated }: Props) {
  const { user, profile } = useAuth();
  const [text, setText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;

  // Auto-resize textarea to fit content — Twitter/Threads pattern
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const publish = async () => {
    if (!user || !text.trim()) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from("dream_tools").insert({
        user_id: user.id,
        title: text.trim(),
        frustration: text.trim(),
        transformation: "",
      });
      if (error) throw error;
      toast.success("Dream launched! 🚀");
      setText("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Failed to post");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="border-b border-border/40">
      {/* Input row */}
      <div className="flex gap-3 px-3 pt-3 pb-1 items-start">
        {/* h-10 avatar with bg-muted fallback, ring-primary/20 */}
        <Avatar className="h-10 w-10 border border-border/40 ring-2 ring-primary/20 shrink-0 mt-0.5">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-muted text-muted-foreground text-[11px] font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Content Tier: text-sm (14px), text-foreground, placeholder muted/35 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="What's frustrating you?"
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/35 outline-none resize-none py-2 leading-relaxed overflow-hidden"
          style={{ minHeight: "24px" }}
          disabled={publishing}
        />
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        {/* Metadata Tier: 11px mono char count, muted/40 */}
        <span className={`font-mono text-[11px] transition-opacity duration-150 ${
          text.length === 0
            ? "opacity-0 pointer-events-none"
            : text.length >= MAX_LENGTH
            ? "text-destructive"
            : "text-muted-foreground/40"
        }`}>
          {text.length}/{MAX_LENGTH}
        </span>
        {/* Control Tier: 13px, font-bold, tracking-[0.15em], bg-foreground, text-background */}
        <button
          disabled={!text.trim() || publishing}
          onClick={publish}
          className="text-[13px] font-bold uppercase tracking-[0.15em] bg-foreground text-background px-4 py-1.5 rounded-full hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {publishing ? <Loader2 size={12} className="animate-spin inline" /> : "MAKE FIT"}
        </button>
      </div>
    </div>
  );
}
