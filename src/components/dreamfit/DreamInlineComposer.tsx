import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Sparkles } from "lucide-react";
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
      <div className="flex gap-3 px-4 pt-3 pb-3">
        <Avatar className="h-10 w-10 border border-border shrink-0 mt-1">
          <AvatarImage src={avatarUrl} alt={profile?.display_name ?? "You"} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="What's frustrating you?"
              rows={2}
              className="flex-1 bg-transparent text-foreground text-base placeholder:text-muted-foreground/60 outline-none resize-none py-2 leading-relaxed"
              disabled={publishing}
            />
            <Button
              size="sm"
              className="h-9 px-5 rounded-full text-xs font-bold shrink-0 mt-1"
              disabled={!text.trim() || publishing}
              onClick={publish}
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : (
                <span className="flex items-center gap-1.5"><Sparkles size={12} />Fix This</span>
              )}
            </Button>
          </div>
          {text.length > 0 && (
            <div className="flex justify-end">
              <span className={`text-[10px] ${text.length >= MAX_LENGTH ? "text-destructive" : "text-muted-foreground/50"}`}>
                {text.length}/{MAX_LENGTH}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
