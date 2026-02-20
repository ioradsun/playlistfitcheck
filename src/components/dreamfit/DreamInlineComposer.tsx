import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
      <div className="flex gap-3 px-4 pt-3 pb-1">
        <Avatar className="h-8 w-8 border border-border shrink-0 mt-0.5">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="What's frustrating you?"
          rows={1}
          className="flex-1 bg-transparent text-foreground text-sm placeholder:text-muted-foreground/50 outline-none resize-none mt-0.5 leading-relaxed overflow-hidden"
          style={{ minHeight: "24px" }}
          disabled={publishing}
        />
      </div>

      {/* Action row — anchored to bottom, button always visible */}
      <div className="flex items-center justify-between px-4 pb-2.5">
        <span className={`text-[10px] font-mono transition-opacity duration-150 ${
          text.length === 0
            ? "opacity-0 pointer-events-none"
            : text.length >= MAX_LENGTH
            ? "text-destructive"
            : "text-muted-foreground/40"
        }`}>
          {text.length}/{MAX_LENGTH}
        </span>
        <Button
          size="sm"
          className="h-7 px-4 rounded-full text-xs font-bold"
          disabled={!text.trim() || publishing}
          onClick={publish}
        >
          {publishing ? <Loader2 size={12} className="animate-spin" /> : "Make This Real"}
        </Button>
      </div>
    </div>
  );
}
