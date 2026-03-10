import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getSessionId } from '@/lib/sessionId';
import { formatDistanceToNow } from 'date-fns';
import { PanelShell } from '@/components/shared/panel/PanelShell';
import { EmojiBar } from '@/components/shared/panel/EmojiBar';
import { CommentInput } from '@/components/shared/panel/CommentInput';
import { VoteStrip } from '@/components/shared/panel/VoteStrip';
import { EMOJIS, type EmojiKey } from '@/components/shared/panel/panelConstants';

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
  onClose: () => void;
  palette?: string[];
  votedSide: 'a' | 'b' | null;
  score: { total: number; replay_yes: number } | null;
  onVoteYes: () => void;
  onVoteNo: () => void;
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
        onClick={() => setOpen(o => !o)}
        className="text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors"
      >
        + react
      </button>
      {open && (
        <span
          className="absolute bottom-full left-0 mb-1 flex items-center gap-1 rounded-lg px-1.5 py-1 z-50"
          style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {EMOJIS.map(({ key, symbol }) => {
            const reacted = sessionReacted.has(`${commentId}-${key}`);
            return (
              <button
                key={key}
                onClick={() => { onPick(key); setOpen(false); }}
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

export function PostCommentPanel({ postId, isOpen, onClose, palette, votedSide, score, onVoteYes, onVoteNo }: Props) {
  const { user, profile } = useAuth();
  const sessionId = getSessionId();

  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Partial<Record<EmojiKey, number>>>({});
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !postId) return;

    const loadComments = async () => {
      const { data } = await supabase
        .from('songfit_comments')
        .select('id, content, created_at, user_id, parent_comment_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(200);

      const rows = data ?? [];
      const userIds = [...new Set(rows.filter((r) => r.user_id).map((r) => r.user_id!))];
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', userIds);
        for (const p of profiles ?? []) profileMap[p.id] = p;
      }

      const withProfiles: Comment[] = rows.map((r) => ({
        ...(r as any),
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

      setComments(topLevel.map((c) => ({ ...c, replies: byParent[c.id] ?? [] })));
    };

    const loadReactions = async () => {
      const { data } = await supabase
        .from('songfit_post_reactions' as any)
        .select('emoji')
        .eq('post_id', postId);
      const counts: Partial<Record<EmojiKey, number>> = {};
      for (const row of (data ?? []) as any[]) {
        const key = row.emoji as EmojiKey;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      setReactionCounts(counts);
      setSessionReacted(new Set());
    };

    const loadCommentReactions = async () => {
      const commentIds = (
        await supabase
          .from('songfit_comments')
          .select('id')
          .eq('post_id', postId)
      ).data?.map((r: any) => r.id) ?? [];

      if (commentIds.length === 0) {
        setCommentReactions({});
        return;
      }

      const { data } = await supabase
        .from('songfit_comment_reactions' as any)
        .select('comment_id, emoji')
        .in('comment_id', commentIds);
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
    loadReactions();
    loadCommentReactions();
    setHasSubmitted(false);
    setText('');
    setReplyingTo(null);
  }, [isOpen, postId]);

  const handleSubmit = async () => {
    const content = text.trim();
    if (!content || !user || submitting) return;
    setSubmitting(true);
    const parentCommentId = replyingTo?.id ?? null;

    const optimisticComment: Comment = {
      id: `optimistic-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      user_id: user.id,
      parent_comment_id: parentCommentId,
      profiles: {
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      replies: [],
    };

    if (replyingTo) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === replyingTo.id
            ? { ...c, replies: [...(c.replies ?? []), optimisticComment] }
            : c,
        ),
      );
    } else {
      setComments((prev) => [...prev, optimisticComment]);
    }
    setText('');
    setReplyingTo(null);
    setHasSubmitted(true);
    setTimeout(() => setHasSubmitted(false), 500);

    try {
      await supabase
        .from('songfit_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_comment_id: parentCommentId,
        });
    } catch {
      // no-op — comment already shown optimistically
    } finally {
      setSubmitting(false);
    }
  };

  const handleReact = async (key: EmojiKey) => {
    if (sessionReacted.has(key)) return;
    setSessionReacted((prev) => new Set([...prev, key]));
    setReactionCounts((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    await supabase.from('songfit_post_reactions' as any).insert({
      post_id: postId,
      emoji: key,
      session_id: sessionId,
      user_id: user?.id ?? null,
    });
  };

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
    await supabase.from('songfit_comment_reactions' as any).insert({
      comment_id: commentId,
      emoji,
      session_id: sessionId,
      user_id: user?.id ?? null,
    });
  };

  const emojiMap: Record<string, string> = {
    fire: '🔥', dead: '💀', mind_blown: '🤯',
    emotional: '😭', respect: '🙏', accurate: '🎯',
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const name = comment.profiles?.display_name ?? 'anon';
    const reactions = commentReactions[comment.id] ?? {};
    const reactionEntries = Object.entries(reactions)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    return (
      <div
        key={comment.id}
        className={
          isReply
            ? 'ml-4 border-l border-white/[0.06] pl-3 py-2.5'
            : 'px-4 py-3 border-b border-white/[0.04]'
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
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
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
                  ? (palette?.[1] ?? 'rgba(255,255,255,0.7)')
                  : 'rgba(255,255,255,0.28)',
              }}
            >
              <span>{emojiMap[emoji] ?? emoji}</span>
              <span className="ml-0.5">{count}</span>
            </button>
          ))}
          <CommentReactPicker
            commentId={comment.id}
            onPick={(emoji) => handleCommentReact(comment.id, emoji as EmojiKey)}
            sessionReacted={sessionCommentReacted}
          />
          {!isReply && (
            <button
              onClick={() => setReplyingTo(comment)}
              className="text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto focus:outline-none"
            >
              reply
            </button>
          )}
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
    <PanelShell isOpen={isOpen} variant="embedded" topOffset={52} bottomOffset={40}>
      <VoteStrip
        votedSide={votedSide}
        score={score}
        onVoteYes={onVoteYes}
        onVoteNo={onVoteNo}
        palette={palette}
      />

      <EmojiBar
        variant="strip"
        palette={palette}
        counts={reactionCounts}
        reacted={sessionReacted}
        onReact={handleReact}
      />

      {replyingTo && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 shrink-0 border-b border-white/[0.04]"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <span className="text-[10px] font-mono text-white/35 truncate flex-1">
            replying to{' '}
            <span className="text-white/50">
              {replyingTo.profiles?.display_name ?? 'anon'}
            </span>
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-white/20 hover:text-white/50 transition-colors shrink-0 focus:outline-none"
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollbarWidth: 'none' }}
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

      <CommentInput
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        onClose={onClose}
        hasSubmitted={hasSubmitted}
        placeholder={replyingTo ? 'write your reply...' : 'What hit the hardest?'}
        size="compact"
      />
    </PanelShell>
  );
}
