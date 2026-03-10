import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getSessionId } from '@/lib/sessionId';
import { formatDistanceToNow } from 'date-fns';
import { PanelShell } from '@/components/shared/panel/PanelShell';
import { PanelHeader } from '@/components/shared/panel/PanelHeader';
import { EmojiBar } from '@/components/shared/panel/EmojiBar';
import { CommentInput } from '@/components/shared/panel/CommentInput';
import { type EmojiKey } from '@/components/shared/panel/panelConstants';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  palette?: string[];
}

export function PostCommentPanel({ postId, isOpen, onClose, palette }: Props) {
  const { user, profile } = useAuth();
  const sessionId = getSessionId();

  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Partial<Record<EmojiKey, number>>>({});
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !postId) return;

    const loadComments = async () => {
      const { data } = await supabase
        .from('songfit_comments')
        .select('id, content, created_at, user_id')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(50);

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

      setComments(rows.map((r) => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
      })));
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

    loadComments();
    loadReactions();
    setHasSubmitted(false);
    setText('');
  }, [isOpen, postId]);

  const handleSubmit = async () => {
    const content = text.trim();
    if (!content || !user || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('songfit_comments')
        .insert({ post_id: postId, user_id: user.id, content })
        .select('id, content, created_at, user_id')
        .single();
      if (!error && data) {
        setComments((prev) => [{
          ...data,
          profiles: {
            display_name: profile?.display_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
          },
        }, ...prev]);
        setText('');
        setHasSubmitted(true);
        setTimeout(() => setHasSubmitted(false), 2000);
      }
    } catch {
      // no-op
    }
    setSubmitting(false);
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

  return (
    <PanelShell isOpen={isOpen} variant="embedded">
      <PanelHeader
        status="live"
        palette={palette}
        onClose={onClose}
        size="compact"
      />

      <EmojiBar
        variant="strip"
        palette={palette}
        counts={reactionCounts}
        reacted={sessionReacted}
        onReact={handleReact}
      />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'none' }}>
        {comments.length === 0 ? (
          <p className="text-[11px] font-mono text-white/20 text-center pt-8">
            No takes yet. Drop the first one.
          </p>
        ) : (
          comments.map((c) => {
            const name = c.profiles?.display_name ?? 'anon';
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full shrink-0 overflow-hidden bg-white/10 flex items-center justify-center mt-0.5">
                  {c.profiles?.avatar_url ? (
                    <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-white/40 font-mono">{name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug text-white/80">
                    <span className="font-semibold text-white/60 mr-1.5">{name}</span>
                    {c.content}
                  </p>
                  <p className="text-[10px] text-white/25 mt-0.5 font-mono">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <CommentInput
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        onClose={onClose}
        hasSubmitted={hasSubmitted}
        size="compact"
      />
    </PanelShell>
  );
}
