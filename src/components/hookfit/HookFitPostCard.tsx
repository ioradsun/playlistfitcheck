import { useState, useCallback, useRef, useEffect } from "react";
import { User, MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
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
  const [restartSignal, setRestartSignal] = useState(0);

  // Track visibility for auto-pause
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
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

  const handleShare = useCallback(async () => {
    if (!hook) return;
    const url = `${window.location.origin}/${hook.artist_slug}/${hook.song_slug}/${hook.hook_slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Battle link copied!");
    } catch {
      toast.error("Failed to copy link");
    }
  }, [hook]);

  const handleVote = useCallback(() => {
    if (!battleState?.hookA) return;
    const hookId = battleState.activeHookSide === "a" ? battleState.hookA.id : battleState.hookB?.id;
    if (!hookId) return;
    const handler = (window as any).__hookfit_vote_handlers?.[post.battle_id];
    if (handler) handler(hookId);
  }, [battleState, post.battle_id]);

  // Derived from battle state
  const hasVoted = !!battleState?.votedHookId;
  const totalVotes = (battleState?.voteCountA || 0) + (battleState?.voteCountB || 0);
  const canVote = battleState && battleState.tappedSides.size > 0 && !hasVoted;
  const activeLabel = battleState?.activeHookSide === "a"
    ? (battleState?.hookA?.hook_label || "Hook A")
    : (battleState?.hookB?.hook_label || "Hook B");

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

      {/* Inline Battle */}
      <InlineBattle
        battleId={post.battle_id}
        visible={isVisible}
        onBattleState={setBattleState}
        restartSignal={restartSignal}
      />

      {/* Caption */}
      {post.caption && (
        <div className="px-3 py-2">
          <p className="text-sm text-foreground">
            <span className="font-semibold mr-1.5">{displayName}</span>
            {post.caption}
          </p>
        </div>
      )}

      {/* ── Action Row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
        {/* Left: action triggers */}
        <div className="flex items-center gap-4">
          {/* Vote / Hooked */}
          {canVote ? (
            <button
              onClick={handleVote}
              className="text-[13px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
            >
              I'm Hooked
            </button>
          ) : hasVoted ? (
            <span
              className="text-[13px] font-mono uppercase tracking-[0.15em]"
              style={{ color: 'rgba(57,255,20,0.45)' }}
            >
              Hooked
            </span>
          ) : null}

          {/* Replay */}
          <button
            onClick={() => setRestartSignal(s => s + 1)}
            className="text-[13px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
          >
            Run it back
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="text-[13px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
          >
            Share
          </button>
        </div>

        {/* Right: meta */}
        <div className="flex items-center gap-2">
          {totalVotes > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
            </span>
          )}
          {rank && (
            <span className="text-[11px] font-bold text-primary font-mono">#{rank}</span>
          )}
        </div>
      </div>
    </div>
  );
}