import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, User, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dream, STATUS_CONFIG } from "./types";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  dream: Dream;
  isBacked: boolean;
  onToggleBack: () => void;
  onOpenComments: (dreamId: string) => void;
  onRefresh: () => void;
}

export function DreamToolCard({ dream, isBacked, onToggleBack, onOpenComments, onRefresh }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [backed, setBacked] = useState(isBacked);
  const [backersCount, setBackersCount] = useState(dream.backers_count);

  const isOwnPost = user?.id === dream.user_id;
  const displayName = dream.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(dream.created_at), { addSuffix: true });
  const status = STATUS_CONFIG[dream.status] || STATUS_CONFIG.seeding;

  const handleBack = async () => {
    if (!user) { navigate("/auth"); return; }
    const wasBacked = backed;
    setBacked(!wasBacked);
    setBackersCount(c => wasBacked ? c - 1 : c + 1);
    try {
      if (wasBacked) {
        await supabase.from("dream_backers").delete().eq("dream_id", dream.id).eq("user_id", user.id);
      } else {
        await supabase.from("dream_backers").insert({ dream_id: dream.id, user_id: user.id });
      }
      onToggleBack();
    } catch {
      setBacked(wasBacked);
      setBackersCount(c => wasBacked ? c + 1 : c - 1);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from("dream_tools").delete().eq("id", dream.id);
      if (error) throw error;
      toast.success("Dream deleted");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  return (
    <div className="border-b border-border/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20 shrink-0">
            {dream.profiles?.avatar_url ? (
              <img src={dream.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={16} className="text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOwnPost && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                  <Trash2 size={14} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 pb-2">
        <p className="text-sm leading-snug">
          <span className="font-semibold mr-1.5">{displayName}</span>
          {dream.title}
        </p>
      </div>

      {dream.status === "not_a_fit" && dream.status_note && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-muted-foreground italic">"{dream.status_note}"</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center px-3 pt-1 pb-1">
        <div className="flex items-center -ml-1">
          <button onClick={handleBack} className="flex items-center gap-1 p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <Heart size={22} className={backed ? "fill-red-500 text-red-500" : "text-foreground"} />
          </button>
          {backersCount > 0 && (
            <span className="text-xs text-muted-foreground -ml-1 mr-2">{backersCount}</span>
          )}
          <button onClick={() => onOpenComments(dream.id)} className="flex items-center gap-1 p-2.5 hover:opacity-70 active:scale-90 transition-all">
            <MessageCircle size={22} className="text-foreground" />
            {dream.comments_count > 0 && <span className="text-xs text-muted-foreground">{dream.comments_count}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
