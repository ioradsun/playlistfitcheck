import { useState, useEffect, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";
import { logEngagementEvent } from "@/lib/engagementTracking";
import { formatDistanceToNow } from "date-fns";
import {
  EMOJIS,
  type EmojiKey,
} from "@/components/shared/panel/panelConstants";
import { CardBottomBar } from "@/components/fmly/CardBottomBar";
import { liveCard } from "@/lib/liveCard";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_comment_id: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  replies?: Comment[];
}

interface Props {
  postId: string;
  isOpen: boolean;
  onOpen?: () => void;
  onClose: () => void;
  trackTitle?: string;
  reelsMode?: boolean;
  variant?: "embedded" | "reels";
  palette?: string[];
  caption?: string;
}

function CommentReactPicker({
  commentId,
  onPick,
  sessionReacted,
}: {
  commentId: string;
  onPick: (emoji: string) => void;
  sessionReacted: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] font-mono text-white/30 hover:text-white/55 transition-colors focus:outline-none"
      >
        + react
      </button>
      {open && (
        <span
          className="absolute bottom-full left-0 mb-1 flex items-center gap-1 rounded-lg px-1.5 py-1 z-50"
          style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {EMOJIS.map(({ key, symbol }) => {
            const reacted = sessionReacted.has(`${commentId}-${key}`);
            return (
              <button
                key={key}
                onClick={() => {
                  onPick(key);
                  setOpen(false);
                }}
                className="text-base px-0.5 hover:scale-125 transition-transform active:scale-95"
                style={{ opacity: reacted ? 0.4 : 1 }}
              >
                {symbol}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

export function PostCommentPanel({
  postId,
  isOpen,
  onOpen,
  onClose,
  trackTitle,
  reelsMode = false,
  variant = "embedded",
  palette,
  caption,
}: Props) {
  const { user } = useAuth();
  const sessionId = getSessionId();
  const currentLiveCardId = useSyncExternalStore(
    liveCard.subscribe,
    liveCard.getSnapshot,
    liveCard.getSnapshot,
  );
  const isLive = currentLiveCardId === postId;

  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [hasFired, setHasFired] = useState(false);
  const [totalFireCount, setTotalFireCount] = useState(0);
  const [lastFiredAt, setLastFiredAt] = useState<string | null>(null);
  const [commentReactions, setCommentReactions] = useState<
    Record<string, Record<string, number>>
  >({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    if (!isOpen || !postId) return;

    const loadComments = async () => {
      const { data } = await supabase
        .from("feed_comments" as any)
        .select("id, content, created_at, user_id, parent_comment_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(200);

      const rows = (data ?? []) as any[];
      const userIds = [
        ...new Set(rows.filter((r: any) => r.user_id).map((r: any) => r.user_id!)),
      ];
      const profileMap: Record<
        string,
        { display_name: string | null; avatar_url: string | null }
      > = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles ?? []) profileMap[p.id] = p;
      }

      const withProfiles: Comment[] = rows.map((r: any) => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
      }));

      const topLevel = withProfiles.filter((c) => !c.parent_comment_id);
      const byParent: Record<string, Comment[]> = {};
      withProfiles
        .filter((c) => c.parent_comment_id)
        .forEach((c) => {
          const pid = c.parent_comment_id!;
          if (!byParent[pid]) byParent[pid] = [];
          byParent[pid].push(c);
        });

      setComments(
        topLevel.map((c) => ({ ...c, replies: byParent[c.id] ?? [] })),
      );
    };

    const loadCommentReactions = async () => {
      const commentIds =
        (
          await supabase
            .from("feed_comments" as any)
            .select("id")
            .eq("post_id", postId)
        ).data?.map((r: any) => r.id) ?? [];

      if (commentIds.length === 0) {
        setCommentReactions({});
        return;
      }

      const { data } = await supabase
        .from("lyric_dance_comment_reactions")
        .select("comment_id, emoji")
        .in("comment_id", commentIds);
      const counts: Record<string, Record<string, number>> = {};
      for (const row of (data ?? []) as any[]) {
        if (!counts[row.comment_id]) counts[row.comment_id] = {};
        counts[row.comment_id][row.emoji] =
          (counts[row.comment_id][row.emoji] ?? 0) + 1;
      }
      setCommentReactions(counts);
      setSessionCommentReacted(new Set());
    };

    loadComments();
    loadCommentReactions();
  }, [isOpen, postId, commentRefreshKey]);


  useEffect(() => {
    if (!postId) return;
    supabase
      .from("songfit_engagement_events" as any)
      .select("created_at")
      .eq("post_id", postId)
      .eq("event_type", "fire")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setTotalFireCount(data.length);
        if (data.length > 0) setLastFiredAt((data[0] as any).created_at ?? null);
      });
  }, [postId]);

  const handleCommentReact = async (commentId: string, emoji: EmojiKey) => {
    const key = `${commentId}-${emoji}`;
    if (sessionCommentReacted.has(key)) return;
    setSessionCommentReacted((prev) => new Set([...prev, key]));
    setCommentReactions((prev) => ({
      ...prev,
      [commentId]: {
        ...(prev[commentId] ?? {}),
        [emoji]: (prev[commentId]?.[emoji] ?? 0) + 1,
      },
    }));
    await supabase.from("lyric_dance_comment_reactions").insert({
      comment_id: commentId,
      emoji,
      session_id: sessionId,
    });
  };

  const emojiMap: Record<string, string> = {
    fire: "🔥",
    dead: "💀",
    mind_blown: "🤯",
    emotional: "😭",
    respect: "🙏",
    accurate: "🎯",
  };
  const accent = palette?.[1] ?? palette?.[0] ?? "rgba(255,140,50,1)";

  const renderComment = (comment: Comment, isReply = false) => {
    const name = comment.profiles?.display_name ?? "anon";
    const reactions = commentReactions[comment.id] ?? {};
    const reactionEntries = Object.entries(reactions)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    return (
      <div
        key={comment.id}
        className={
          isReply
            ? "ml-4 border-l border-white/[0.06] pl-3 py-2.5"
            : "px-4 py-3 border-b border-white/[0.04]"
        }
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded-full shrink-0 overflow-hidden bg-white/10 flex items-center justify-center">
            {comment.profiles?.avatar_url ? (
              <img
                src={comment.profiles.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[8px] text-white/40 font-mono">
                {name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-white/35">{name}</span>
          <span className="text-[9px] font-mono text-white/20 ml-auto">
            {formatDistanceToNow(new Date(comment.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>

        <p className="text-[12px] font-light leading-relaxed text-white/65 mb-2">
          {comment.content}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {reactionEntries.map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => handleCommentReact(comment.id, emoji as EmojiKey)}
              className="flex items-center gap-0.5 text-[10px] font-mono transition-all active:scale-95 focus:outline-none"
              style={{
                color: sessionCommentReacted.has(`${comment.id}-${emoji}`)
                  ? (palette?.[1] ?? "rgba(255,255,255,0.7)")
                  : "rgba(255,255,255,0.28)",
              }}
            >
              <span>{emojiMap[emoji] ?? emoji}</span>
              <span className="ml-0.5">{count}</span>
            </button>
          ))}
          <CommentReactPicker
            commentId={comment.id}
            onPick={(emoji) =>
              handleCommentReact(comment.id, emoji as EmojiKey)
            }
            sessionReacted={sessionCommentReacted}
          />
        </div>

        {!isReply && comment.replies && comment.replies.length > 0 && (
          <div className="mt-1">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-[300] pointer-events-none flex flex-col justify-end">
      {/* ── Panel overlay (animated) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-x-0 flex flex-col pointer-events-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(10,10,10,0.97)",
              backdropFilter: "blur(12px)",
              top: 0,
              bottom: 48,
              borderTop: "0.5px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="flex-1 overflow-y-auto min-h-0"
              style={{ scrollbarWidth: "none" }}
            >
              {comments.length === 0 ? (
                <p className="text-[11px] font-mono text-white/20 text-center pt-8 px-4">
                  No takes yet. Drop the first one.
                </p>
              ) : (
                <div className="pb-2">
                  {comments.map((c) => renderComment(c))}
                </div>
              )}
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Caption + CardBottomBar ── */}
      <div className="pointer-events-auto relative z-[10]">
        {!isOpen && caption && caption.trim() && (
          <div className="px-3 pt-1.5 pb-1" style={{ background: "#0a0a0a" }}>
            <p className="text-[13px] leading-snug text-white/50 line-clamp-2">
              {caption}
            </p>
          </div>
        )}
        <CardBottomBar
          variant={variant === "reels" ? "fullscreen" : "embedded"}
          onOpenReactions={onOpen ?? (() => {})}
          onClose={onClose}
          panelOpen={isOpen}
          hasFired={hasFired}
          onFireTap={() => {
            if (!hasFired) {
              setHasFired(true);
              setTotalFireCount((c) => c + 1);
              setLastFiredAt(new Date().toISOString());
              if (postId) {
                logEngagementEvent(postId, user?.id ?? sessionId, "fire");
              }
            }
          }}
          accent={accent}
          isLive={isLive}
          totalFireCount={totalFireCount}
        />
      </div>
    </div>
  );
}
