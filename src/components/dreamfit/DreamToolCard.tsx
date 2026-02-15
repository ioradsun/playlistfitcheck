import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Dream, STATUS_CONFIG } from "./types";
import { formatDistanceToNow } from "date-fns";

interface Props {
  dream: Dream;
  isBacked: boolean;
  onToggleBack: () => void;
  onOpenComments: (dreamId: string) => void;
}

export function DreamToolCard({ dream, isBacked, onToggleBack, onOpenComments }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [animating, setAnimating] = useState(false);
  const status = STATUS_CONFIG[dream.status] || STATUS_CONFIG.seeding;

  const handleBack = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setAnimating(true);
    setTimeout(() => setAnimating(false), 600);
    try {
      if (isBacked) {
        await supabase.from("dream_backers").delete().eq("dream_id", dream.id).eq("user_id", user.id);
      } else {
        await supabase.from("dream_backers").insert({ dream_id: dream.id, user_id: user.id });
      }
      onToggleBack();
    } catch (e: any) {
      toast.error("Failed to update backing");
    }
  };

  const milestoneLabel =
    dream.backers_count >= 250 ? "Team is looking at this 👀" :
    dream.backers_count >= 100 ? "This is heating up 🔥" :
    dream.backers_count >= 25 ? "Momentum! ⚡" : null;

  return (
    <div className="glass-card rounded-xl p-5 space-y-3 hover:border-primary/20 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm text-foreground leading-tight">{dream.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{dream.transformation}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.className}`}>
          {status.emoji} {status.label}
        </span>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground">
          {dream.dream_type === "feature" ? `🧩 Feature${dream.target_fit ? ` · ${dream.target_fit}` : ""}` : "🚀 New Fit"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {dream.profiles?.display_name || "Anonymous"} · {formatDistanceToNow(new Date(dream.created_at), { addSuffix: true })}
        </span>
      </div>

      {milestoneLabel && (
        <p className="text-[11px] font-medium text-primary">{milestoneLabel}</p>
      )}

      {dream.status === "not_a_fit" && dream.status_note && (
        <p className="text-[11px] text-muted-foreground italic">"{dream.status_note}"</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={handleBack}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            isBacked ? "text-red-400" : "text-muted-foreground hover:text-red-400"
          }`}
        >
          <motion.span
            animate={animating ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.4 }}
          >
            <Heart size={14} className={isBacked ? "fill-red-400" : ""} />
          </motion.span>
          <span>{dream.backers_count}</span>
          {!isBacked && <span className="hidden sm:inline">Back This</span>}
        </button>

        <button
          onClick={() => onOpenComments(dream.id)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle size={14} />
          <span>{dream.comments_count}</span>
        </button>
      </div>
    </div>
  );
}
