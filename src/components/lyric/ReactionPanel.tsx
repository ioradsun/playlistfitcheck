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

function isLineOutsideViewport(container: HTMLElement, row: HTMLElement, threshold = 20) {
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return rowRect.top < containerRect.top + threshold || rowRect.bottom > containerRect.bottom - threshold;
}

function ReactionPanel({ isOpen, onClose, danceId, activeLine, allLines, sections, currentTimeSec, palette, onSeekTo, player, durationSec, onReactionFired, reactionData, onReactionDataChange }: ReactionPanelProps) {
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [repeatTimeSec, setRepeatTimeSec] = useState(0);
  const [loopingLineIndex, setLoopingLineIndex] = useState<number | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [playheadLineIndex, setPlayheadLineIndex] = useState<number | null>(null);
  const [isManualSelectionLocked, setIsManualSelectionLocked] = useState(false);
  const [manualPlaybackTargetIndex, setManualPlaybackTargetIndex] = useState<number | null>(null);
  const [manualPlaybackEndTimeSec, setManualPlaybackEndTimeSec] = useState<number | null>(null);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [liftingText, setLiftingText] = useState<string | null>(null);
  const [submittedLineIndex, setSubmittedLineIndex] = useState<number | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<Set<string>>(new Set());

  const repeatRafRef = useRef<number>(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualSelectionLockedRef = useRef(false);
  const manualPlaybackTargetIndexRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const clearLoopTimeout = () => {
    if (!loopTimeoutRef.current) return;
    clearTimeout(loopTimeoutRef.current);
    loopTimeoutRef.current = null;
  };

  const releaseManualSelectionLock = () => {
    isManualSelectionLockedRef.current = false;
    manualPlaybackTargetIndexRef.current = null;
    setIsManualSelectionLocked(false);
    setManualPlaybackTargetIndex(null);
    setManualPlaybackEndTimeSec(null);
  };

  const stopManualSingleLinePlayback = (seekToSec?: number) => {
    clearLoopTimeout();
    player?.pause();

    const targetIndex = manualPlaybackTargetIndexRef.current;
    if (targetIndex != null) {
      setSelectedLineIndex(targetIndex);
      setPlayheadLineIndex(targetIndex);
    }

    if (seekToSec != null && player) {
      player.seek(seekToSec);
    }

    setLoopingLineIndex(null);
    setAutoFollowEnabled(false);
    setManualPlaybackEndTimeSec(null);
  };

  const lineByIndex = useMemo(() => {
    const map = new Map<number, LyricSectionLine>();
    allLines.forEach(line => map.set(line.lineIndex, line));
    return map;
  }, [allLines]);

  const sectionLabelByLineIndex = useMemo(() => {
    const map = new Map<number, string | null>();
    sections.forEach(section => {
      section.lines.forEach(line => map.set(line.lineIndex, section.label ?? null));
    });
    return map;
  }, [sections]);

  const commentCountByLine = useMemo(() => {
    const counts: Record<number, number> = {};
    comments.forEach(comment => {
      if (comment.line_index != null && !comment.parent_comment_id) {
        counts[comment.line_index] = (counts[comment.line_index] ?? 0) + 1;
      }
    });
    return counts;
  }, [comments]);

  const displayLineIndex = (isManualSelectionLocked || !autoFollowEnabled)
    ? (selectedLineIndex ?? manualPlaybackTargetIndex)
    : (playheadLineIndex ?? activeLine?.lineIndex ?? allLines[0]?.lineIndex ?? null);

  const displayLine = displayLineIndex != null
    ? (lineByIndex.get(displayLineIndex) ?? activeLine)
    : (activeLine ?? allLines[0] ?? null);

  const displaySectionLabel = displayLine?.lineIndex != null
    ? (sectionLabelByLineIndex.get(displayLine.lineIndex) ?? activeLine?.sectionLabel ?? null)
    : null;

  const displayLineComments = useMemo(() => {
    if (displayLineIndex == null) return [];
    return comments.filter(c => c.line_index === displayLineIndex && !c.parent_comment_id);
  }, [comments, displayLineIndex]);

  const expandedLineComments = useMemo(() => {
    if (expandedLineIndex == null) return [];
    return comments.filter(c => c.line_index === expandedLineIndex && !c.parent_comment_id);
  }, [comments, expandedLineIndex]);

  const repeatActiveLineIndex = useMemo(() => {
    if (!repeatMode) return null;
    const currentLine = allLines.find(l => repeatTimeSec >= l.startSec && repeatTimeSec < l.endSec + 0.1);
    return currentLine?.lineIndex ?? null;
  }, [repeatMode, repeatTimeSec, allLines]);

  useEffect(() => {
    if (!isOpen) {
      releaseManualSelectionLock();
      return;
    }

    const startingLineIndex = activeLine?.lineIndex ?? allLines[0]?.lineIndex ?? null;
    setHasSubmitted(false);
    setTextInput('');
    setReplyingTo(null);
    setExpandedLineIndex(null);
    setSelectedLineIndex(startingLineIndex);
    setPlayheadLineIndex(startingLineIndex);
    setAutoFollowEnabled(true);
  }, [isOpen, allLines]);

  // playhead tracking is intentionally separate from manual selection/lock
  useEffect(() => {
    if (repeatMode) return;

    const nextFromActive = activeLine?.lineIndex;
    if (nextFromActive != null) {
      setPlayheadLineIndex(prev => (prev === nextFromActive ? prev : nextFromActive));
      return;
    }

    const fallbackLine = allLines.find(
      line => currentTimeSec >= line.startSec && currentTimeSec < line.endSec + 0.1,
    );
    if (fallbackLine?.lineIndex != null) {
      setPlayheadLineIndex(prev => (prev === fallbackLine.lineIndex ? prev : fallbackLine.lineIndex));
    }
  }, [activeLine?.lineIndex, allLines, currentTimeSec, repeatMode]);

  useEffect(() => {
    if (!isManualSelectionLocked) return;
    if (manualPlaybackTargetIndex == null) return;
    if (selectedLineIndex === manualPlaybackTargetIndex) return;
    setSelectedLineIndex(manualPlaybackTargetIndex);
  }, [isManualSelectionLocked, manualPlaybackTargetIndex, selectedLineIndex]);

  useEffect(() => {
    if (!isManualSelectionLocked) return;
    if (manualPlaybackEndTimeSec == null) return;
    if (!player || player.audio.paused) return;
    if (currentTimeSec < manualPlaybackEndTimeSec) return;

    const manualTargetLine = lineByIndex.get(manualPlaybackTargetIndex ?? -1);
    const safeStopSec = manualTargetLine
      ? Math.max(manualTargetLine.startSec, manualTargetLine.endSec - 0.02)
      : undefined;
    stopManualSingleLinePlayback(safeStopSec);
  }, [
    currentTimeSec,
    isManualSelectionLocked,
    lineByIndex,
    manualPlaybackEndTimeSec,
    manualPlaybackTargetIndex,
    player,
  ]);

  // repeat loop only updates playhead state when line actually changes
  useEffect(() => {
    if (!repeatMode || !player) return;
    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      setRepeatTimeSec(prev => (prev === audio.currentTime ? prev : audio.currentTime));
      const nextLine = allLines.find(
        line => audio.currentTime >= line.startSec && audio.currentTime < line.endSec + 0.1,
      )?.lineIndex ?? null;
      setPlayheadLineIndex(prev => (prev === nextLine ? prev : nextLine));

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

  // guarded passive live-follow scrolling: no smooth stacking and no manual lock fights
  useEffect(() => {
    if (!autoFollowEnabled) return;
    if (displayLineIndex == null) return;

    const container = scrollContainerRef.current;
    const row = rowRefs.current[displayLineIndex];
    if (!container || !row) return;
    if (!isLineOutsideViewport(container, row)) return;

    row.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [autoFollowEnabled, displayLineIndex]);

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
        const rows = data as unknown as CommentRow[];
        const topLevel = rows.filter(c => !c.parent_comment_id);
        const byParent: Record<string, CommentRow[]> = {};
        rows.filter(c => c.parent_comment_id).forEach(c => {
          const parentId = c.parent_comment_id!;
          if (!byParent[parentId]) byParent[parentId] = [];
          byParent[parentId].push(c);
        });
        setComments(topLevel.map(c => ({ ...c, replies: byParent[c.id] ?? [] })));
      });

    supabase
      .from('lyric_dance_comment_reactions' as any)
      .select('comment_id, emoji')
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, Record<string, number>> = {};
        for (const row of data as any[]) {
          if (!counts[row.comment_id]) counts[row.comment_id] = {};
          counts[row.comment_id][row.emoji] = (counts[row.comment_id][row.emoji] ?? 0) + 1;
        }
        setCommentReactions(counts);
      });
  }, [danceId, isOpen]);

  useEffect(() => {
    if (!isOpen && repeatMode) {
      clearLoopTimeout();
      player?.pause();
      setRepeatMode(false);
      setLoopingLineIndex(null);
      setRepeatTimeSec(0);
    }
  }, [isOpen, repeatMode, player]);

  useEffect(() => {
    return () => {
      clearLoopTimeout();
      cancelAnimationFrame(repeatRafRef.current);
    };
  }, []);

  const handleStartRepeat = () => {
    if (!player || durationSec <= 0) return;
    releaseManualSelectionLock();
    clearLoopTimeout();
    setRepeatMode(true);
    setLoopingLineIndex(null);
    setAutoFollowEnabled(true);
    player.seek(0);
    player.play();
  };

  const handleStopRepeat = () => {
    clearLoopTimeout();
    player?.pause();
    setRepeatMode(false);
    setLoopingLineIndex(null);
    setRepeatTimeSec(0);
  };

  const handleLineTap = (line: LyricSectionLine) => {
    setSelectedLineIndex(line.lineIndex);
    setPlayheadLineIndex(line.lineIndex);
    isManualSelectionLockedRef.current = true;
    manualPlaybackTargetIndexRef.current = line.lineIndex;
    setIsManualSelectionLocked(true);
    setManualPlaybackTargetIndex(line.lineIndex);
    setManualPlaybackEndTimeSec(line.endSec);
    setAutoFollowEnabled(false);

    clearLoopTimeout();
    if (loopingLineIndex != null) setLoopingLineIndex(null);

    // defer seek/play side effects so selected highlight paints first
    requestAnimationFrame(() => {
      if (player) {
        player.setMuted(false);
        player.seek(line.startSec);
        player.play();

        const safeStopSec = Math.max(line.startSec, line.endSec - 0.02);
        const stopAfterMs = Math.max((safeStopSec - line.startSec) * 1000, 50);
        loopTimeoutRef.current = setTimeout(() => {
          stopManualSingleLinePlayback(safeStopSec);
        }, stopAfterMs);
      } else {
        onSeekTo(line.startSec);
      }
    });
  };

  const handleReplay = (line: LyricSectionLine, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!player) return;
    releaseManualSelectionLock();

    clearLoopTimeout();

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
      return;
    }

    setLoopingLineIndex(line.lineIndex);
    player.seek(line.startSec);
    player.play();
    loopTimeoutRef.current = setTimeout(() => {
      player.pause();
      setLoopingLineIndex(null);
    }, playDuration);
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
        updated[emoji].line[targetLineIndex] = (updated[emoji].line[targetLineIndex] ?? 0) + 1;
      }
      return updated;
    });
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
        line_index: displayLineIndex,
        parent_comment_id: replyingTo?.id ?? null,
      })
      .select('id, text, line_index, submitted_at, is_pinned, parent_comment_id')
      .single();

    if (error) {
      console.error('Comment insert failed:', error);
      setLiftingText(null);
      return;
    }

    if (!inserted) return;

    const newComment = inserted as unknown as CommentRow;
    if (replyingTo) {
      setComments(prev => prev.map(comment => (
        comment.id === replyingTo.id
          ? { ...comment, replies: [...(comment.replies ?? []), newComment] }
          : comment
      )));
    } else {
      setComments(prev => {
        const withReplies = { ...newComment, replies: [] };
        const pinned = prev.filter(c => c.is_pinned);
        const unpinned = prev.filter(c => !c.is_pinned);
        return [...pinned, withReplies, ...unpinned];
      });
    }

    if (displayLineIndex != null) {
      setSubmittedLineIndex(displayLineIndex);
      setTimeout(() => setSubmittedLineIndex(null), 600);
    }

    setHasSubmitted(true);
    setTextInput('');
    setReplyingTo(null);
    onReactionFired('fire');
    setTimeout(() => setHasSubmitted(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="fixed left-0 right-0 bottom-[48px] z-40 h-[88vh] flex flex-col overflow-hidden"
          style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05] shrink-0"
            style={{ background: '#0d0d0d' }}
          >
            <div className="flex items-center gap-1.5 min-w-[46px]">
              {repeatMode ? (
                <button
                  onClick={handleStopRepeat}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 animate-pulse" />
                  LIVE · stop
                </button>
              ) : (
                <>
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                    style={{
                      background: palette[1] ?? 'rgba(255,255,255,0.4)',
                      opacity: autoFollowEnabled ? 0.45 : 0,
                    }}
                  />
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25">
                    {autoFollowEnabled ? 'live' : 'locked'}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!repeatMode && (
                <button
                  onClick={handleStartRepeat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono uppercase tracking-wider text-white/35 hover:text-white/65 hover:border-white/25 hover:bg-white/[0.04] transition-all"
                >
                  <span>↺</span>
                  <span>Repeat</span>
                </button>
              )}
              {!autoFollowEnabled && !repeatMode && (
                <button
                  onClick={() => {
                    releaseManualSelectionLock();
                    setAutoFollowEnabled(true);
                  }}
                  className="px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider text-white/35 border border-white/10 hover:text-white/60"
                >
                  resume live
                </button>
              )}
              <button
                onClick={onClose}
                className="text-white/25 hover:text-white/60 transition-colors ml-1 focus:outline-none"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10" />
                  <line x1="10" y1="2" x2="2" y2="10" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-b border-white/[0.07] shrink-0" style={{ background: '#111111' }}>
            <div className="px-5 pt-4 pb-2 h-8 flex items-center justify-between gap-3">
              <p className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/25 truncate">
                {displaySectionLabel ? `now playing · ${displaySectionLabel}` : 'now playing'}
              </p>
              <span className="text-[8px] font-mono uppercase tracking-[0.16em] text-white/22 shrink-0 min-w-[54px] text-right">
                {displayLineComments.length} takes
              </span>
            </div>

            <div className="px-5 pb-3 h-[78px]">
              <p className="text-[15px] font-light leading-relaxed text-white/85 line-clamp-3 min-h-[66px]">
                {displayLine?.text ?? '...'}
              </p>
            </div>

            <div className="grid grid-cols-6 gap-1 px-3 pb-3 min-h-[74px]">
              {EMOJIS.map(({ key, symbol, label }) => {
                const count = displayLine?.lineIndex != null ? (reactionData[key]?.line[displayLine.lineIndex] ?? 0) : 0;
                const reacted = displayLine?.lineIndex != null ? sessionReacted.has(`${key}-${displayLine.lineIndex}`) : false;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (displayLine?.lineIndex != null) handleReact(key as EmojiKey, displayLine.lineIndex);
                    }}
                    className="flex flex-col items-center py-2 rounded-xl transition-all active:scale-95 focus:outline-none"
                    style={{
                      background: reacted ? `${palette[1] ?? '#ffffff'}12` : 'transparent',
                      boxShadow: reacted ? `inset 0 -2px 0 0 ${palette[1] ?? 'rgba(255,255,255,0.5)'}` : 'inset 0 -2px 0 0 transparent',
                    }}
                  >
                    <span className="text-lg leading-none">{symbol}</span>
                    <span className="text-[8px] font-mono uppercase tracking-wide text-white/22">{label}</span>
                    <span
                      className="text-[9px] font-mono leading-none min-h-[11px]"
                      style={{
                        opacity: count > 0 ? 1 : 0,
                        color: reacted ? (palette[1] ?? 'rgba(255,255,255,0.8)') : 'rgba(255,255,255,0.35)',
                      }}
                    >
                      {count || 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-4 pb-3 relative min-h-[78px]">
              <div className="h-5 mb-2 flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/25 uppercase tracking-wide shrink-0">replying to</span>
                <span className={`text-[10px] font-mono text-white/40 truncate ${replyingTo ? 'opacity-100' : 'opacity-0'}`}>
                  {replyingTo ? `"${replyingTo.text.slice(0, 40)}"` : 'placeholder'}
                </span>
                <button
                  onClick={() => setReplyingTo(null)}
                  className={`text-white/20 hover:text-white/50 transition-colors ml-auto shrink-0 focus:outline-none ${replyingTo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                  </svg>
                </button>
              </div>

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

              <div className="h-11 relative">
                <div className={`absolute inset-0 transition-opacity ${hasSubmitted ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleTextSubmit();
                      if (e.key === 'Escape') {
                        if (replyingTo) setReplyingTo(null);
                        else onClose();
                      }
                    }}
                    placeholder={replyingTo ? 'write your reply...' : 'drop your take on this line...'}
                    maxLength={200}
                    className="w-full h-11 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/15 pointer-events-none">↵</span>
                </div>
                <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono text-white/30 transition-opacity ${hasSubmitted ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  ✓ take dropped
                </div>
              </div>
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <div className="pb-2">
              {sections.map((section, sectionIndex) => (
                <div key={section.sectionIndex} className={sectionIndex === 0 ? 'mt-3 mb-1' : 'mt-5 mb-1'}>
                  <div className="flex items-center gap-2 px-5 mb-1">
                    <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/18">{section.label}</span>
                    <div className="flex-1 h-px bg-white/[0.035]" />
                  </div>

                  {section.lines.map(line => {
                    const isSelected = selectedLineIndex === line.lineIndex;
                    const isPlayhead = playheadLineIndex === line.lineIndex;
                    const isRepeatActive = repeatMode && repeatActiveLineIndex === line.lineIndex;
                    const isActive = (autoFollowEnabled && isPlayhead) || (!autoFollowEnabled && isSelected) || isRepeatActive;

                    const lineReactionsByEmoji = EMOJIS
                      .map(({ key, symbol }) => ({ key, symbol, count: reactionData[key]?.line[line.lineIndex] ?? 0 }))
                      .filter(item => item.count > 0)
                      .sort((a, b) => b.count - a.count);

                    const topReaction = lineReactionsByEmoji[0] ?? null;
                    const totalLineReactions = lineReactionsByEmoji.reduce((sum, item) => sum + item.count, 0);
                    const lineCommentCount = commentCountByLine[line.lineIndex] ?? 0;
                    const isCommentPulsing = submittedLineIndex === line.lineIndex;
                    const isExpanded = expandedLineIndex === line.lineIndex;

                    return (
                      <div key={line.lineIndex}>
                        <div
                          ref={node => {
                            rowRefs.current[line.lineIndex] = node;
                          }}
                          onClick={() => handleLineTap(line)}
                          className="relative flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors"
                          style={{
                            minHeight: 46,
                            background: isActive ? 'rgba(255,255,255,0.03)' : 'transparent',
                            boxShadow: isActive ? `inset 2px 0 0 0 ${palette[1] ?? '#ffffff'}` : 'inset 2px 0 0 0 transparent',
                          }}
                        >
                          <span
                            className="flex-1 text-[12px] font-light leading-relaxed transition-colors duration-100"
                            style={{ color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.35)' }}
                          >
                            {line.text}
                          </span>

                          <div className="w-[82px] shrink-0 flex items-center justify-end gap-1.5">
                            <button
                              onClick={e => handleReplay(line, e)}
                              className="h-6 w-6 rounded-full text-[10px] font-mono text-white/28 hover:text-white/58 transition-colors"
                            >
                              ↺
                            </button>

                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedLineIndex(prev => (prev === line.lineIndex ? null : line.lineIndex));
                              }}
                              className={`h-6 min-w-[52px] px-2 rounded-full border text-[9px] font-mono transition-colors ${isExpanded ? 'border-white/30 text-white/70' : 'border-white/10 text-white/28 hover:text-white/55'}`}
                            >
                              <span className="inline-flex items-center justify-center gap-1">
                                <span style={{ opacity: lineCommentCount > 0 ? 1 : 0.25 }}>{lineCommentCount > 0 ? lineCommentCount : 0}</span>
                                <span>takes</span>
                              </span>
                            </button>

                            <div className="h-6 min-w-[20px] text-right text-[10px] font-mono text-white/35">
                              <span className={totalLineReactions > 0 ? 'opacity-100' : 'opacity-0'}>
                                {topReaction?.symbol ?? '·'}{totalLineReactions > 0 ? totalLineReactions : ''}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className="mx-4 mb-2 rounded-xl overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            {expandedLineComments.length === 0 ? (
                              <p className="text-[11px] font-mono text-white/20 text-center py-5">no takes yet — be first</p>
                            ) : (
                              <div>
                                {(() => {
                                  const emojiMap: Record<string, string> = {
                                    fire: '🔥',
                                    dead: '💀',
                                    mind_blown: '🤯',
                                    emotional: '😭',
                                    respect: '🙏',
                                    accurate: '🎯',
                                  };

                                  const renderComment = (comment: CommentRow, isReply = false) => {
                                    const reactions = commentReactions[comment.id] ?? {};
                                    const reactionEntries = Object.entries(reactions)
                                      .filter(([, count]) => count > 0)
                                      .sort((a, b) => b[1] - a[1]);

                                    return (
                                      <div
                                        key={comment.id}
                                        className={isReply ? 'ml-4 border-l border-white/[0.06] pl-3 py-2.5' : 'px-4 py-3 border-b border-white/[0.04]'}
                                      >
                                        {comment.is_pinned && (
                                          <span className="text-[8px] font-mono uppercase tracking-wider text-white/25 mb-1 block">📌 pinned</span>
                                        )}
                                        <p className="text-[12px] font-light leading-relaxed text-white/65 mb-2">{comment.text}</p>
                                        <div className="flex items-center gap-3 flex-wrap">
                                          {reactionEntries.map(([emoji, count]) => (
                                            <button
                                              key={emoji}
                                              onClick={() => handleCommentReact(comment.id, emoji as EmojiKey)}
                                              className="flex items-center gap-0.5 text-[10px] font-mono transition-all active:scale-95 focus:outline-none"
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
                                          />
                                          {!isReply && (
                                            <button
                                              onClick={() => {
                                                setReplyingTo(comment);
                                                setExpandedLineIndex(line.lineIndex);
                                              }}
                                              className="text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto focus:outline-none"
                                            >
                                              reply
                                            </button>
                                          )}
                                        </div>
                                        {!isReply && comment.replies && comment.replies.length > 0 && (
                                          <div className="mt-1">{comment.replies.map(reply => renderComment(reply, true))}</div>
                                        )}
                                      </div>
                                    );
                                  };

                                  return expandedLineComments.map(comment => renderComment(comment));
                                })()}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="h-[2px] px-5">
                          <div
                            className="h-full rounded-full transition-opacity"
                            style={{
                              background: palette[1] ?? 'rgba(255,255,255,0.4)',
                              opacity: isCommentPulsing ? 0.6 : 0,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <style>{`
            @keyframes liftFade {
              0%   { transform: translateY(0);     opacity: 0.7; }
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
