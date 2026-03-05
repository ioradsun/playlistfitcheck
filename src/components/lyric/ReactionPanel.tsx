import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';
import type { LyricSection, LyricSectionLine } from '@/hooks/useLyricSections';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';

interface CommentRow {
  id: string;
  text: string;
  line_index: number | null;
  submitted_at: string;
  is_pinned: boolean;
  parent_comment_id: string | null;
  replies?: CommentRow[];
  reactionCounts?: Record<string, number>;
}

interface ReactionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  danceId: string;
  activeLine: { text: string; lineIndex: number; sectionLabel: string | null } | null;
  allLines: LyricSectionLine[];
  sections: LyricSection[];
  currentTimeSec: number;
  palette: string[];
  onSeekTo: (sec: number) => void;
  player: LyricDancePlayer | null;
  durationSec: number;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange: (data: Record<string, { line: Record<number, number>; total: number }> | ((prev: Record<string, { line: Record<number, number>; total: number }>) => Record<string, { line: Record<number, number>; total: number }>)) => void;
  onReactionFired: (emoji: string) => void;
}

const EMOJIS = [
  { key: 'fire', symbol: '🔥', label: 'fire' },
  { key: 'dead', symbol: '💀', label: 'dead' },
  { key: 'mind_blown', symbol: '🤯', label: 'blown' },
  { key: 'emotional', symbol: '😭', label: 'felt' },
  { key: 'respect', symbol: '🙏', label: 'respect' },
  { key: 'accurate', symbol: '🎯', label: 'accurate' },
] as const;

type EmojiKey = typeof EMOJIS[number]['key'];

function CommentReactPicker({
  commentId,
  onPick,
  sessionReacted,
  palette,
}: {
  commentId: string;
  onPick: (emoji: string) => void;
  sessionReacted: Set<string>;
  palette: string[];
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

function ReactionPanel({ isOpen, onClose, danceId, activeLine, allLines, sections, currentTimeSec, palette, onSeekTo, player, durationSec, onReactionFired, reactionData, onReactionDataChange }: ReactionPanelProps) {
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [repeatTimeSec, setRepeatTimeSec] = useState(0);
  const [loopingLineIndex, setLoopingLineIndex] = useState<number | null>(null);
  const [focusedLineIndex, setFocusedLineIndex] = useState<number | null>(null);
  const [panelView, setPanelView] = useState<'lyrics' | 'comments'>('lyrics');
  const [commentLineIndex, setCommentLineIndex] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [liftingText, setLiftingText] = useState<string | null>(null);
  const [submittedLineIndex, setSubmittedLineIndex] = useState<number | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<Set<string>>(new Set());
  const repeatRafRef = useRef<number>(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedLineIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHasSubmitted(false);
      setTextInput('');
      if (activeLine?.lineIndex != null) {
        setFocusedLineIndex(activeLine.lineIndex);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    focusedLineIndexRef.current = focusedLineIndex;
  }, [focusedLineIndex]);

  useEffect(() => {
    if (!danceId) return;

    supabase
      .from('lyric_dance_comments' as any)
      .select('id, text, line_index, submitted_at, is_pinned, parent_comment_id')
      .eq('dance_id', danceId)
      .order('is_pinned', { ascending: false })
      .order('submitted_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!data) return;
        const rows = data as CommentRow[];
        const topLevel = rows.filter(c => !c.parent_comment_id);
        const byParent: Record<string, CommentRow[]> = {};
        rows.filter(c => c.parent_comment_id).forEach(c => {
          const pid = c.parent_comment_id!;
          if (!byParent[pid]) byParent[pid] = [];
          byParent[pid].push(c);
        });
        const tree = topLevel.map(c => ({
          ...c,
          replies: byParent[c.id] ?? [],
        }));
        setComments(tree);
      });

    supabase
      .from('lyric_dance_comment_reactions' as any)
      .select('comment_id, emoji')
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, Record<string, number>> = {};
        for (const row of data as any[]) {
          if (!counts[row.comment_id]) counts[row.comment_id] = {};
          counts[row.comment_id][row.emoji] =
            (counts[row.comment_id][row.emoji] ?? 0) + 1;
        }
        setCommentReactions(counts);
      });

  }, [danceId, isOpen]);

  useEffect(() => {
    if (!repeatMode || !player) return;

    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      setRepeatTimeSec(audio.currentTime);
      const currentLine = allLines.find(
        l => audio.currentTime >= l.startSec && audio.currentTime < l.endSec + 0.1,
      );
      if (currentLine && currentLine.lineIndex !== focusedLineIndexRef.current) {
        setFocusedLineIndex(currentLine.lineIndex);
      }
      if (!audio.paused) {
        rafId = requestAnimationFrame(tick);
        repeatRafRef.current = rafId;
      }
    };

    const onPlay = () => {
      rafId = requestAnimationFrame(tick);
      repeatRafRef.current = rafId;
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      repeatRafRef.current = 0;
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    if (!audio.paused) onPlay();

    return () => {
      cancelAnimationFrame(rafId);
      repeatRafRef.current = 0;
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [repeatMode, player, allLines]);

  useEffect(() => {
    if (!isOpen && repeatMode) {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      player?.pause();
      setRepeatMode(false);
      setLoopingLineIndex(null);
      setRepeatTimeSec(0);
      setFocusedLineIndex(null);
    }
  }, [isOpen, repeatMode, player]);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      cancelAnimationFrame(repeatRafRef.current);
    };
  }, []);

  const hotLines = useMemo(() => {
    const perLine: Record<number, { total: number; emojis: Record<string, number> }> = {};
    Object.entries(reactionData).forEach(([emoji, v]) => {
      Object.entries(v.line).forEach(([idx, count]) => {
        const n = Number(idx);
        if (!perLine[n]) perLine[n] = { total: 0, emojis: {} };
        perLine[n].total += count;
        perLine[n].emojis[emoji] = (perLine[n].emojis[emoji] ?? 0) + count;
      });
    });
    return Object.entries(perLine)
      .map(([lineIndex, info]) => {
        const line = allLines.find(l => l.lineIndex === Number(lineIndex));
        const topEmoji = Object.entries(info.emojis).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'fire';
        return { lineIndex: Number(lineIndex), text: line?.text ?? '...', total: info.total, topEmoji };
      })
      .sort((a, b) => b.total - a.total);
  }, [reactionData, allLines]);

  const commentCountByLine = useMemo(() => {
    const counts: Record<number, number> = {};
    comments.forEach(c => {
      if (c.line_index != null && !c.parent_comment_id) {
        counts[c.line_index] = (counts[c.line_index] ?? 0) + 1;
      }
    });
    return counts;
  }, [comments]);

  const repeatActiveLine = useMemo(() => {
    if (!repeatMode) return null;
    return allLines.find(
      l => repeatTimeSec >= l.startSec && repeatTimeSec < l.endSec + 0.1,
    ) ?? null;
  }, [repeatMode, repeatTimeSec, allLines]);

  const focusedLine = useMemo(() => {
    if (focusedLineIndex == null) return activeLine ?? allLines[0] ?? null;
    return allLines.find(l => l.lineIndex === focusedLineIndex) ?? activeLine ?? null;
  }, [focusedLineIndex, activeLine, allLines]);

  const focusedSectionLabel = useMemo(() => {
    if (!focusedLine) return null;
    return sections.find(s =>
      s.lines.some(l => l.lineIndex === focusedLine.lineIndex),
    )?.label ?? null;
  }, [focusedLine, sections]);

  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repeatMode || !activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [repeatActiveLine?.lineIndex, repeatMode]);

  const handleStartRepeat = () => {
    if (!player || durationSec <= 0) return;
    setRepeatMode(true);
    setLoopingLineIndex(null);
    setFocusedLineIndex(null);
    player.seek(0);
    player.play();
  };

  const handleLineTap = (line: LyricSectionLine) => {
    setFocusedLineIndex(line.lineIndex);

    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);

    if (player) {
      player.setMuted(false);
      player.seek(line.startSec);
      player.play();

      if (!repeatMode) {
        const lineDuration = line.endSec - line.startSec;
        const stopAfterMs = Math.max(lineDuration + 0.3, 1.5) * 1000;
        loopTimeoutRef.current = setTimeout(() => {
          player.pause();
          loopTimeoutRef.current = null;
        }, stopAfterMs);
      }
    } else {
      onSeekTo(line.startSec);
    }

    if (loopingLineIndex != null) {
      setLoopingLineIndex(null);
    }
  };

  const handleReplay = (line: LyricSectionLine, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!player) return;

    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);

    const lineDuration = line.endSec - line.startSec;
    const playDuration = Math.max(lineDuration + 0.3, 2.5) * 1000;

    if (repeatMode) {
      setLoopingLineIndex(line.lineIndex);
      player.seek(line.startSec);
      player.play();

      const loop = () => {
        player.seek(line.startSec);
        player.play();
        loopTimeoutRef.current = setTimeout(loop, playDuration);
      };
      loopTimeoutRef.current = setTimeout(loop, playDuration);
    } else {
      setLoopingLineIndex(line.lineIndex);
      player.seek(line.startSec);
      player.play();
      loopTimeoutRef.current = setTimeout(() => {
        player.pause();
        setLoopingLineIndex(null);
      }, playDuration);
    }
  };

  const handleReact = async (emoji: EmojiKey, lineIndex?: number) => {
    if (!danceId) return;
    const sessionId = getSessionId();
    const targetLineIndex = lineIndex ?? activeLine?.lineIndex ?? null;
    const reactionKey = `${emoji}-${targetLineIndex ?? 'song'}`;
    if (sessionReacted.has(reactionKey)) return;

    if (repeatMode && player && !player.audio.paused) {
      player.pause();
    }

    setSessionReacted(prev => new Set([...prev, reactionKey]));
    onReactionFired(emoji);

    await supabase.from('lyric_dance_reactions' as any).insert({
      dance_id: danceId,
      line_index: targetLineIndex,
      section_index: null,
      emoji,
      session_id: sessionId,
    });

    onReactionDataChange(prev => {
      const updated = { ...prev };
      if (!updated[emoji]) updated[emoji] = { line: {}, total: 0 };
      updated[emoji].total++;
      if (targetLineIndex != null) {
        updated[emoji].line[targetLineIndex] =
          (updated[emoji].line[targetLineIndex] ?? 0) + 1;
      }
      return updated;
    });
  };

  const handleStopRepeat = () => {
    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    player?.pause();
    setRepeatMode(false);
    setLoopingLineIndex(null);
    setRepeatTimeSec(0);
  };

  const handleOpenComments = (lineIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentLineIndex(lineIndex);
    setFocusedLineIndex(lineIndex);
    setPanelView('comments');
    setReplyingTo(null);
  };

  const handleCommentReact = async (commentId: string, emoji: EmojiKey) => {
    const key = `${commentId}-${emoji}`;
    if (sessionCommentReacted.has(key)) return;
    const sessionId = getSessionId();

    setSessionCommentReacted(prev => new Set([...prev, key]));

    setCommentReactions(prev => ({
      ...prev,
      [commentId]: {
        ...(prev[commentId] ?? {}),
        [emoji]: (prev[commentId]?.[emoji] ?? 0) + 1,
      },
    }));

    await supabase
      .from('lyric_dance_comment_reactions' as any)
      .insert({ comment_id: commentId, emoji, session_id: sessionId });
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || !danceId || hasSubmitted) return;
    const text = textInput.trim().slice(0, 200);
    const sessionId = getSessionId();

    setLiftingText(text);
    setTimeout(() => setLiftingText(null), 400);

    const { data: inserted, error } = await supabase
      .from('lyric_dance_comments' as any)
      .insert({
        dance_id: danceId,
        text,
        session_id: sessionId,
        line_index: focusedLine?.lineIndex ?? null,
        parent_comment_id: replyingTo?.id ?? null,
      })
      .select('id, text, line_index, submitted_at, is_pinned, parent_comment_id')
      .single();

    if (error) {
      console.error('Comment insert failed:', error);
      setLiftingText(null);
      return;
    }

    if (inserted) {
      const newComment = inserted as CommentRow;

      if (replyingTo) {
        setComments(prev => prev.map(c =>
          c.id === replyingTo.id
            ? { ...c, replies: [...(c.replies ?? []), newComment] }
            : c
        ));
      } else {
        setComments(prev => {
          const withReplies = { ...newComment, replies: [] };
          const pinned = prev.filter(c => c.is_pinned);
          const unpinned = prev.filter(c => !c.is_pinned);
          return [...pinned, withReplies, ...unpinned];
        });
      }

      if (focusedLine?.lineIndex != null) {
        setSubmittedLineIndex(focusedLine.lineIndex);
        setTimeout(() => setSubmittedLineIndex(null), 600);
      }

      setHasSubmitted(true);
      setTextInput('');
      setReplyingTo(null);
      onReactionFired('fire');

      setTimeout(() => setHasSubmitted(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="fixed left-0 right-0 bottom-[48px] z-40 max-h-[72vh] overflow-y-auto"
          style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05] sticky top-0 z-10"
            style={{ background: '#0d0d0d' }}
          >
            <div className="flex items-center gap-2">
              {panelView === 'comments' ? (
                <button
                  onClick={() => { setPanelView('lyrics'); setReplyingTo(null); }}
                  className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="7,2 3,6 7,10"/>
                  </svg>
                  lyrics
                </button>
              ) : repeatMode ? (
                <button
                  onClick={handleStopRepeat}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 animate-pulse" />
                  LIVE · stop
                </button>
              ) : (
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25">
                  full lyrics
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {panelView === 'lyrics' && !repeatMode && (
                <button
                  onClick={handleStartRepeat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono uppercase tracking-wider text-white/35 hover:text-white/65 hover:border-white/25 hover:bg-white/[0.04] transition-all"
                >
                  <span>↺</span>
                  <span>Repeat</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-white/25 hover:text-white/60 transition-colors ml-1"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10"/>
                  <line x1="10" y1="2" x2="2" y2="10"/>
                </svg>
              </button>
            </div>
          </div>

          <div
            className="sticky top-[49px] z-10 border-b border-white/[0.07]"
            style={{ background: '#111111' }}
          >
            <div className="px-5 pt-4 pb-3">
              <p className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/25 mb-2">
                {panelView === 'comments'
                  ? 'comments on'
                  : focusedSectionLabel
                  ? `now playing · ${focusedSectionLabel}`
                  : 'now playing'}
              </p>
              <p className="text-[15px] font-light leading-relaxed text-white/85">
                {focusedLine?.text ?? '...'}
              </p>
            </div>

            <div className="flex items-stretch justify-between px-3 pb-3">
              {EMOJIS.map(({ key, symbol, label }) => {
                const count = focusedLine
                  ? (reactionData[key]?.line[focusedLine.lineIndex] ?? 0)
                  : 0;
                const reacted = focusedLine
                  ? sessionReacted.has(`${key}-${focusedLine.lineIndex}`)
                  : false;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (focusedLine) handleReact(key as EmojiKey, focusedLine.lineIndex);
                    }}
                    className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all active:scale-95 flex-1"
                    style={{
                      background: reacted ? `${palette[1] ?? '#ffffff'}1a` : 'transparent',
                      transform: reacted ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    <span className="text-lg leading-none">{symbol}</span>
                    <span
                      className="text-[8px] font-mono uppercase tracking-wide"
                      style={{
                        color: reacted
                          ? (palette[1] ?? 'rgba(255,255,255,0.7)')
                          : 'rgba(255,255,255,0.22)',
                      }}
                    >
                      {label}
                    </span>
                    {count > 0 && (
                      <span
                        className="text-[9px] font-mono leading-none"
                        style={{
                          color: reacted
                            ? (palette[1] ?? 'rgba(255,255,255,0.8)')
                            : 'rgba(255,255,255,0.35)',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-4 pb-4 relative">
              {replyingTo && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-mono text-white/25 uppercase tracking-wide">
                    replying to
                  </span>
                  <span className="text-[10px] font-mono text-white/40 truncate max-w-[180px]">
                    "{replyingTo.text.slice(0, 40)}"
                  </span>
                  <button
                    onClick={() => setReplyingTo(null)}
                    className="text-white/20 hover:text-white/50 transition-colors ml-auto shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                    </svg>
                  </button>
                </div>
              )}

              {liftingText && (
                <div
                  className="absolute left-4 right-4 pointer-events-none"
                  style={{
                    bottom: '100%',
                    animation: 'liftFade 400ms ease-out forwards',
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.6)',
                    fontFamily: 'monospace',
                    zIndex: 20,
                  }}
                >
                  {liftingText}
                </div>
              )}

              {!hasSubmitted ? (
                <div className="relative">
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleTextSubmit();
                      if (e.key === 'Escape') {
                        setReplyingTo(null);
                        if (panelView === 'lyrics') onClose();
                      }
                    }}
                    placeholder={replyingTo ? 'write your reply...' : 'drop your take on this line...'}
                    maxLength={200}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/15 pointer-events-none">
                    ↵
                  </span>
                </div>
              ) : (
                <p className="text-[10px] font-mono text-white/30 py-2 text-center">✓ take dropped</p>
              )}
            </div>
          </div>

          {panelView === 'lyrics' && (
            <div className="pb-6">
              {sections.map((section, si) => (
                <div key={section.sectionIndex} className={si === 0 ? 'mt-3 mb-1' : 'mt-5 mb-1'}>

                  <div className="flex items-center gap-2 px-5 mb-1">
                    <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/18">
                      {section.label}
                    </span>
                    <div className="flex-1 h-px bg-white/[0.035]" />
                  </div>

                  {section.lines.map((line) => {
                    const isFocused = focusedLine?.lineIndex === line.lineIndex;
                    const isRepeatActive = repeatMode && repeatActiveLine?.lineIndex === line.lineIndex;
                    const isActive = isFocused || isRepeatActive;

                    const lineReactionsByEmoji = EMOJIS
                      .map(({ key, symbol }) => ({
                        key, symbol,
                        count: reactionData[key]?.line[line.lineIndex] ?? 0,
                      }))
                      .filter(r => r.count > 0)
                      .sort((a, b) => b.count - a.count);

                    const topReaction = lineReactionsByEmoji[0] ?? null;
                    const totalLineReactions = lineReactionsByEmoji.reduce((s, r) => s + r.count, 0);
                    const commentCount = commentCountByLine[line.lineIndex] ?? 0;
                    const isCommentPulsing = submittedLineIndex === line.lineIndex;

                    return (
                      <div
                        key={line.lineIndex}
                        ref={isRepeatActive ? activeLineRef : undefined}
                        onClick={() => handleLineTap(line)}
                        className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-all"
                        style={{
                          background: isActive ? 'rgba(255,255,255,0.03)' : 'transparent',
                          borderLeft: isActive
                            ? `2px solid ${palette[1] ?? '#ffffff'}`
                            : '2px solid transparent',
                        }}
                      >
                        <span
                          className="flex-1 text-[12px] font-light leading-relaxed transition-colors duration-100"
                          style={{
                            color: isActive
                              ? 'rgba(255,255,255,0.80)'
                              : 'rgba(255,255,255,0.35)',
                          }}
                        >
                          {line.text}
                        </span>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {topReaction && (
                            <span
                              className="flex items-center gap-0.5 text-[9px] font-mono"
                              style={{ color: 'rgba(255,255,255,0.28)' }}
                            >
                              <span className="text-[10px] leading-none">{topReaction.symbol}</span>
                              <span>{totalLineReactions}</span>
                            </span>
                          )}

                          {commentCount > 0 && (
                            <button
                              onClick={(e) => handleOpenComments(line.lineIndex, e)}
                              className="flex items-center gap-0.5 text-[9px] font-mono transition-all"
                              style={{
                                color: 'rgba(255,255,255,0.28)',
                                transform: isCommentPulsing ? 'scale(1.4)' : 'scale(1)',
                                transition: 'transform 200ms ease, color 120ms',
                              }}
                            >
                              <span className="text-[10px] leading-none">💬</span>
                              <span>{commentCount}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {panelView === 'comments' && (
            <div className="pb-6">
              {(() => {
                const lineComments = comments.filter(
                  c => c.line_index === commentLineIndex && !c.parent_comment_id
                );

                if (lineComments.length === 0) {
                  return (
                    <p className="text-[11px] font-mono text-white/20 text-center py-8">
                      no takes yet — be first
                    </p>
                  );
                }

                const emojiMap: Record<string, string> = {
                  fire:'🔥', dead:'💀', mind_blown:'🤯',
                  emotional:'😭', respect:'🙏', accurate:'🎯',
                };

                const renderComment = (comment: CommentRow, isReply = false) => {
                  const reactions = commentReactions[comment.id] ?? {};
                  const reactionEntries = Object.entries(reactions)
                    .filter(([, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1]);

                  return (
                    <div
                      key={comment.id}
                      className={`${isReply ? 'ml-6 border-l border-white/[0.06] pl-4' : 'px-5'} py-3`}
                    >
                      {comment.is_pinned && (
                        <span className="text-[8px] font-mono uppercase tracking-wider text-white/25 mb-1 block">
                          📌 pinned
                        </span>
                      )}

                      <p className="text-[13px] font-light leading-relaxed text-white/70 mb-2">
                        {comment.text}
                      </p>

                      <div className="flex items-center gap-3 flex-wrap">
                        {reactionEntries.map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => handleCommentReact(comment.id, emoji as EmojiKey)}
                            className="flex items-center gap-0.5 text-[10px] font-mono transition-all active:scale-95"
                            style={{
                              color: sessionCommentReacted.has(`${comment.id}-${emoji}`)
                                ? (palette[1] ?? 'rgba(255,255,255,0.7)')
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
                          palette={palette}
                        />

                        {!isReply && (
                          <button
                            onClick={() => setReplyingTo(comment)}
                            className="text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto"
                          >
                            reply
                          </button>
                        )}
                      </div>

                      {!isReply && comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2">
                          {comment.replies.map(reply => renderComment(reply, true))}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div>
                    {lineComments.map(c => (
                      <div key={c.id} className="border-b border-white/[0.04]">
                        {renderComment(c)}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          <style>{`
            @keyframes liftFade {
              0%   { transform: translateY(0);    opacity: 0.7; }
              100% { transform: translateY(-36px); opacity: 0;   }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { ReactionPanel };
export default ReactionPanel;
