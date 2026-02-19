import { useState, useRef } from "react";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;

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
    <div className="border-b border-border/40 transition-colors">
      <div className="flex gap-3 px-4 pt-3 pb-2">
        <Avatar className="h-10 w-10 border border-border shrink-0 mt-1">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="What's frustrating you?"
            rows={3}
            className="w-full bg-transparent text-foreground text-base placeholder:text-muted-foreground/60 outline-none resize-none py-2 leading-relaxed"
            disabled={publishing}
          />
        </div>
      </div>

      {/* Action row below the textarea — no cramping */}
      <div className="flex items-center justify-between px-4 pb-3">
        <span className={`text-[10px] ${text.length >= MAX_LENGTH ? "text-destructive" : "text-muted-foreground/40"} ${text.length === 0 ? "invisible" : ""}`}>
          {text.length}/{MAX_LENGTH}
        </span>
        <Button
          size="sm"
          className="h-8 px-5 rounded-full text-xs font-bold"
          disabled={!text.trim() || publishing}
          onClick={publish}
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : "Make This Real"}
        </Button>
      </div>
    </div>
  );
}
