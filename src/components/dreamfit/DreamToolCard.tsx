import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { User, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dream } from "./types";
import { DreamSignal } from "./DreamSignal";
import { formatDistanceToNow } from "date-fns";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  dream: Dream;
  onOpenComments: (dreamId: string) => void;
  onRefresh: () => void;
}

export function DreamToolCard({ dream, onOpenComments, onRefresh }: Props) {
  const { user } = useAuth();

  const isOwnPost = user?.id === dream.user_id;
  const displayName = dream.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(dream.created_at), { addSuffix: true });

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
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20">
              {dream.profiles?.avatar_url ? (
                <img src={dream.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={16} className="text-muted-foreground" />
              )}
            </div>
            {dream.profiles?.is_verified && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <VerifiedBadge size={14} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
          </div>
        <TrailblazerBadge userId={dream.user_id} compact />
        </div>

        {isOwnPost && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
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

      {/* Demand Signal bar */}
      <DreamSignal
        dreamId={dream.id}
        backersCount={dream.backers_count}
        greenlightCount={dream.greenlight_count}
        commentsCount={dream.comments_count}
        onRefresh={onRefresh}
        onOpenComments={onOpenComments}
      />
    </div>
  );
}
