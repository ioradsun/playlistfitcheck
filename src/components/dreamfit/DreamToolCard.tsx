import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { User, MoreHorizontal, Trash2, CheckCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Dream } from "./types";
import { DreamSignal } from "./DreamSignal";
import { formatDistanceToNow } from "date-fns";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ProfileHoverCard } from "@/components/songfit/ProfileHoverCard";
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

const ADMIN_EMAILS = ["sunpatel@gmail.com", "spatel@iorad.com"];

export function DreamToolCard({ dream, onOpenComments, onRefresh }: Props) {
  const { user } = useAuth();

  const isOwnPost = user?.id === dream.user_id;
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const showMenu = isOwnPost || isAdmin;
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

  const handleSetStatus = async (status: "resolved" | "bypassed") => {
    try {
      const { error } = await supabase.from("dream_tools").update({ status }).eq("id", dream.id);
      if (error) throw error;
      toast.success(status === "resolved" ? "Dream resolved ✅" : "Dream bypassed ⏭");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  return (
    <div className="border-b border-border/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ProfileHoverCard userId={dream.user_id}>
            <div className="flex items-center gap-3 cursor-pointer min-w-0">
              {/* h-10 avatar, bg-muted fallback, ring-primary/20 */}
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20">
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
                {/* Content Tier: text-sm (14px), font-semibold, text-muted-foreground */}
                <p className="text-sm font-semibold leading-tight truncate text-muted-foreground">{displayName}</p>
                {/* Metadata Tier: 11px, text-muted-foreground */}
                <p className="font-mono text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
              </div>
            </div>
          </ProfileHoverCard>
          <TrailblazerBadge userId={dream.user_id} compact />
        </div>

        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 bg-popover z-50">
              {isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => handleSetStatus("resolved")}>
                    <CheckCircle size={14} className="mr-2" />
                    Resolve
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSetStatus("bypassed")}>
                    <SkipForward size={14} className="mr-2" />
                    Bypass
                  </DropdownMenuItem>
                </>
              )}
              {isOwnPost && (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                  <Trash2 size={14} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content — Content Tier: text-sm, font-semibold display name + body */}
      <div className="px-3 pb-2">
        <p className="text-sm leading-snug">
          <span className="font-semibold mr-1.5">{displayName}</span>
          {dream.title}
        </p>
      </div>

      {dream.status === "not_a_fit" && dream.status_note && (
        <div className="px-3 pb-2">
          {/* Metadata Tier: 11px, text-muted-foreground */}
          <p className="font-mono text-[11px] text-muted-foreground italic">"{dream.status_note}"</p>
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
