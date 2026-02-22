import { useState, useRef, useEffect } from "react";
import { User, MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ProfileHoverCard } from "@/components/songfit/ProfileHoverCard";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineBattle, type BattleState } from "./InlineBattle";
import { HookFitVotesSheet } from "./HookFitVotesSheet";
import type { HookFitPost } from "./types";

interface Props {
  post: HookFitPost;
  rank?: number;
  onRefresh: () => void;
}

export function HookFitPostCard({ post, rank, onRefresh }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwnPost = user?.id === post.user_id;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Track visibility for auto-pause
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= 0.5),
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayName = post.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const hook = post.hook;

  const handleProfileClick = () => {
    navigate(`/u/${post.user_id}`);
  };

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase
        .from("hookfit_posts" as any)
        .delete()
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  // Derived from battle state
  const isBattle = !!(battleState?.hookA && battleState?.hookB);
  const hasVoted = !!battleState?.votedHookId;
  const canVote = (battleState?.tappedSides?.size ?? 0) > 0 && !hasVoted;
  const totalVotes = (battleState?.voteCountA ?? 0) + (battleState?.voteCountB ?? 0);
  const activeLabel = battleState?.activeHookSide === "a"
    ? (battleState?.hookA?.hook_label || "Hook A")
    : (battleState?.hookB?.hook_label || "Hook B");
  const hasTapped = (battleState?.tappedSides?.size ?? 0) > 0;
  const fmlyCount = Math.max(0, totalVotes - 1);

  return (
    <div className="border-b border-border/40" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ProfileHoverCard userId={post.user_id}>
            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={handleProfileClick}
            >
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20">
                  {post.profiles?.avatar_url ? (
                    <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-muted-foreground" />
                  )}
                </div>
                {post.profiles?.is_verified && (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <VerifiedBadge size={14} />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate text-muted-foreground">{displayName}</p>
                <p className="font-mono text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
              </div>
            </div>
          </ProfileHoverCard>
          <TrailblazerBadge userId={post.user_id} compact />
        </div>

        {/* 3-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {hook && (
              <DropdownMenuItem onClick={() => navigate(`/${hook.artist_slug}/${hook.song_slug}/${hook.hook_slug}`)}>
                <ExternalLink size={14} className="mr-2" />
                Open Battle
              </DropdownMenuItem>
            )}
            {isOwnPost && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeletePost}>
                <Trash2 size={14} className="mr-2" />
                Delete Post
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline Battle with Hooked badge overlay */}
      <div className="relative">
        <InlineBattle
          battleId={post.battle_id}
          visible={isVisible}
          onBattleState={setBattleState}
        />
        {/* "Hooked" badge — top-left of canvas, after voting */}
        {hasVoted && isBattle && (
          <button
            onClick={() => setSheetOpen(true)}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 hover:bg-black/70 transition-colors"
          >
            <span
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "rgba(57,255,20,0.7)" }}
            >
              Hooked
            </span>
            {totalVotes > 0 && (
              <span
                className="text-[10px] font-mono uppercase tracking-[0.12em]"
                style={{ color: "rgba(57,255,20,0.5)" }}
              >
                You + {fmlyCount} FMLY
              </span>
            )}
          </button>
        )}
      </div>

      {/* Action row — vote controls in card area */}
      {isBattle && (
        <div className="flex items-center justify-center px-3 py-2">
          <AnimatePresence mode="wait">
            {!hasTapped ? (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-muted-foreground font-mono uppercase tracking-[0.15em]"
              >
                WHICH HOOK FITS? — FMLY DECIDES
              </motion.p>
            ) : canVote ? (
              <motion.button
                key="vote"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  const hookId = battleState?.activeHookSide === "a"
                    ? battleState?.hookA?.id
                    : battleState?.hookB?.id;
                  if (hookId) battleState?.handleVote(hookId);
                }}
                className="text-[11px] font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-accent/50 transition-colors"
              >
                I'm Hooked on {activeLabel}
              </motion.button>
            ) : hasVoted ? (
              <motion.div
                key="voted"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <span
                  className="text-[10px] font-mono uppercase tracking-[0.15em] font-bold"
                  style={{ color: "rgba(57,255,20,0.45)" }}
                >
                  Hooked
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-3 py-2">
          <p className="text-sm text-foreground">
            <span className="font-semibold mr-1.5">{displayName}</span>
            {post.caption}
          </p>
        </div>
      )}

      {/* Minimal meta row */}
      {rank && (
        <div className="flex items-center justify-end px-3 py-1">
          <span className="text-[11px] font-bold text-primary font-mono">#{rank}</span>
        </div>
      )}

      {/* Votes side panel */}
      <HookFitVotesSheet
        battleId={sheetOpen ? post.battle_id : null}
        hookA={battleState?.hookA ?? null}
        hookB={battleState?.hookB ?? null}
        voteCountA={battleState?.voteCountA ?? 0}
        voteCountB={battleState?.voteCountB ?? 0}
        votedHookId={battleState?.votedHookId ?? null}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
