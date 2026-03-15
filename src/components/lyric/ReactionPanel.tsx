import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';
import type { LyricSectionLine } from '@/hooks/useLyricSections';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';
import { PanelShell } from '@/components/shared/panel/PanelShell';
import { EmojiBar } from '@/components/shared/panel/EmojiBar';
import { CommentInput } from '@/components/shared/panel/CommentInput';
import { EMOJIS, type EmojiKey } from '@/components/shared/panel/panelConstants';
import { VoteStrip } from '@/components/shared/panel/VoteStrip';

export interface CanonicalAudioSection {
  sectionIndex: number;
  startSec: number;
  endSec: number;
  role: string | null;
}

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
  displayMode: 'fullscreen' | 'embedded';
  engagementMode: 'spectator' | 'freezing' | 'engaged';
  frozenLineIndex: number | null;
  isOpen: boolean;
  onClose: () => void;
  danceId: string;
  activeLine: { text: string; lineIndex: number; sectionLabel: string | null } | null;
  allLines: LyricSectionLine[];
  audioSections: CanonicalAudioSection[];
  currentTimeSec: number;
  palette: string[];
  onSeekTo: (sec: number) => void;
  player: LyricDancePlayer | null;
  durationSec: number;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange: (data: Record<string, { line: Record<number, number>; total: number }> | ((prev: Record<string, { line: Record<number, number>; total: number }>) => Record<string, { line: Record<number, number>; total: number }>)) => void;
  onReactionFired: (emoji: string) => void;
  onEngagementStart: (targetLineIndex?: number) => void;
  onResetEngagement?: () => void;
  votedSide: 'a' | 'b' | null;
  score: { total: number; replay_yes: number } | null;
  onVoteYes: () => void;
  onVoteNo: () => void;
  hideInput?: boolean;
  refreshKey?: number;
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

function ReactionPanel({ displayMode, isOpen, onClose, engagementMode, frozenLineIndex, danceId, activeLine, allLines, audioSections, currentTimeSec, palette, onSeekTo, player, durationSec, onReactionFired, reactionData, onReactionDataChange, onEngagementStart, onResetEngagement, votedSide, score, onVoteYes, onVoteNo, hideInput = false, refreshKey = 0 }: ReactionPanelProps) {
  const sections = audioSections ?? [];
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [repeatTimeSec, setRepeatTimeSec] = useState(0);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [playheadLineIndex, setPlayheadLineIndex] = useState<number | null>(null);
  const [isManualSelectionLocked, setIsManualSelectionLocked] = useState(false);
  const [manualPlaybackTargetIndex, setManualPlaybackTargetIndex] = useState<number | null>(null);
  const [manualPlaybackEndTimeSec, setManualPlaybackEndTimeSec] = useState<number | null>(null);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const [isUserScrollingLyrics, setIsUserScrollingLyrics] = useState(false);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [lyricsTransitionMs, setLyricsTransitionMs] = useState(200);
  const [activeRowHeight, setActiveRowHeight] = useState(46);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [submittedLineIndex, setSubmittedLineIndex] = useState<number | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<Set<string>>(new Set());

  const repeatRafRef = useRef<number>(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualSelectionLockedRef = useRef(false);
  const manualPlaybackTargetIndexRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const manualOffsetRef = useRef(0);
  const userScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchYRef = useRef<number | null>(null);

  const clearLoopTimeout = () => {
    if (!loopTimeoutRef.current) return;
    clearTimeout(loopTimeoutRef.current);
    loopTimeoutRef.current = null;
  };

  const clearUserScrollTimeout = () => {
    if (!userScrollTimeoutRef.current) return;
    clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = null;
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

    setManualPlaybackEndTimeSec(null);
  };

  const lineByIndex = useMemo(() => {
    const map = new Map<number, LyricSectionLine>();
    allLines.forEach(line => map.set(line.lineIndex, line));
    return map;
  }, [allLines]);

  const sectionMeta = useMemo(() => {
    const canonical = sections
      .filter((section) => Number.isFinite(section.startSec) && Number.isFinite(section.endSec) && section.endSec > section.startSec)
      .slice()
      .sort((a, b) => a.startSec - b.startSec);

    const totalByRole = new Map<string, number>();
    canonical.forEach((section) => {
      const role = section.role?.trim().toLowerCase();
      if (!role) return;
      totalByRole.set(role, (totalByRole.get(role) ?? 0) + 1);
    });

    const seenByRole = new Map<string, number>();
    const labelBySectionIndex = new Map<number, string | null>();
    canonical.forEach((section) => {
      const role = section.role?.trim().toLowerCase();
      if (!role) {
        labelBySectionIndex.set(section.sectionIndex, null);
        return;
      }
      const seenCount = (seenByRole.get(role) ?? 0) + 1;
      seenByRole.set(role, seenCount);
      const totalCount = totalByRole.get(role) ?? 0;
      const base = role.toUpperCase();
      labelBySectionIndex.set(section.sectionIndex, totalCount > 1 ? `${base} ${seenCount}` : base);
    });

    const sectionForLine = new Map<number, CanonicalAudioSection | null>();
    const labelByLineIndex = new Map<number, string | null>();

    allLines.forEach((line) => {
      const lineStart = line.startSec;
      const matchedSection = canonical.find((section, index) => {
        const isLast = index === canonical.length - 1;
        return isLast
          ? lineStart >= section.startSec && lineStart <= section.endSec + 0.05
          : lineStart >= section.startSec && lineStart < section.endSec;
      }) ?? null;
      sectionForLine.set(line.lineIndex, matchedSection);
      labelByLineIndex.set(
        line.lineIndex,
        matchedSection ? (labelBySectionIndex.get(matchedSection.sectionIndex) ?? null) : null,
      );
    });

    return { sectionForLine, labelByLineIndex };
  }, [allLines, sections]);

  const commentCountByLine = useMemo(() => {
    const counts: Record<number, number> = {};
    comments.forEach(comment => {
      if (comment.line_index != null && !comment.parent_comment_id) {
        counts[comment.line_index] = (counts[comment.line_index] ?? 0) + 1;
      }
    });
    return counts;
  }, [comments]);

  const engagedDisplayLineIndex = engagementMode === 'engaged' ? frozenLineIndex : null;

  const displayLineIndex = engagedDisplayLineIndex ?? (isManualSelectionLocked
    ? (selectedLineIndex ?? manualPlaybackTargetIndex)
    : (playheadLineIndex ?? activeLine?.lineIndex ?? allLines[0]?.lineIndex ?? null));

  const getCenteredLyricsOffset = useCallback((lineIndex: number | null) => {
    if (lineIndex == null) return null;
    const container = scrollContainerRef.current;
    const row = rowRefs.current[lineIndex];
    if (!container || !row) return null;
    const containerMidpoint = container.clientHeight / 2;
    return containerMidpoint - row.offsetTop - row.offsetHeight / 2;
  }, []);

  const applyCenteredLyricsOffset = useCallback((lineIndex: number | null) => {
    const centeredOffset = getCenteredLyricsOffset(lineIndex);
    if (centeredOffset == null) return;
    setLyricsOffset(centeredOffset + manualOffsetRef.current);
  }, [getCenteredLyricsOffset]);

  const resetManualScrollOverride = useCallback((mode: 'snap' | 'animate' = 'snap') => {
    clearUserScrollTimeout();
    userScrollingRef.current = false;
    manualOffsetRef.current = 0;
    setIsUserScrollingLyrics(false);
    setLyricsTransitionMs(mode === 'animate' ? 400 : 0);
    applyCenteredLyricsOffset(displayLineIndex);
  }, [applyCenteredLyricsOffset, displayLineIndex]);

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
    resetManualScrollOverride('snap');
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

  useEffect(() => {
    if (userScrollingRef.current) return;
    setLyricsTransitionMs(200);
    applyCenteredLyricsOffset(displayLineIndex);
  }, [applyCenteredLyricsOffset, displayLineIndex]);

  useEffect(() => {
    if (displayLineIndex == null) {
      setActiveRowHeight(46);
      return;
    }
    const activeRow = rowRefs.current[displayLineIndex];
    if (!activeRow) {
      setActiveRowHeight(46);
      return;
    }
    setActiveRowHeight(activeRow.offsetHeight || 46);
  }, [displayLineIndex, lyricsOffset]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const beginManualScroll = () => {
      if (!userScrollingRef.current) {
        userScrollingRef.current = true;
        setIsUserScrollingLyrics(true);
      }
      setLyricsTransitionMs(0);
      clearUserScrollTimeout();
      userScrollTimeoutRef.current = setTimeout(() => {
        resetManualScrollOverride('animate');
      }, 2500);
    };

    const applyManualDelta = (deltaY: number) => {
      beginManualScroll();
      manualOffsetRef.current -= deltaY;
      applyCenteredLyricsOffset(displayLineIndex);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      applyManualDelta(event.deltaY);
      onEngagementStart(displayLineIndex ?? undefined);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchYRef.current = event.touches[0]?.clientY ?? null;
      onEngagementStart(displayLineIndex ?? undefined);
    };

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      if (currentY == null || touchYRef.current == null) return;
      event.preventDefault();
      applyManualDelta(touchYRef.current - currentY);
      touchYRef.current = currentY;
    };

    const onTouchEnd = () => {
      touchYRef.current = null;
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyCenteredLyricsOffset, displayLineIndex, onEngagementStart, resetManualScrollOverride]);

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
  }, [danceId, isOpen, refreshKey]);

  useEffect(() => {
    if (!isOpen && repeatMode) {
      clearLoopTimeout();
      player?.pause();
      setRepeatMode(false);
      setRepeatTimeSec(0);
    }
  }, [isOpen, repeatMode, player]);

  useEffect(() => {
    return () => {
      clearLoopTimeout();
      cancelAnimationFrame(repeatRafRef.current);
      clearUserScrollTimeout();
    };
  }, []);

  const handleStartRepeat = () => {
    if (!player || durationSec <= 0 || engagementMode !== 'spectator') return;
    releaseManualSelectionLock();
    clearLoopTimeout();
    setRepeatMode(true);
    resetManualScrollOverride('snap');
    player.seek(0);
    player.play();
  };

  const handleStopRepeat = () => {
    clearLoopTimeout();
    player?.pause();
    setRepeatMode(false);
    setRepeatTimeSec(0);
  };

  const handleLineTap = (line: LyricSectionLine) => {
    onEngagementStart(line.lineIndex);
    resetManualScrollOverride('snap');
    setSelectedLineIndex(line.lineIndex);
    setPlayheadLineIndex(line.lineIndex);

    // Always release any prior lock before starting a new one
    releaseManualSelectionLock();

    isManualSelectionLockedRef.current = true;
    manualPlaybackTargetIndexRef.current = line.lineIndex;
    setIsManualSelectionLocked(true);
    setManualPlaybackTargetIndex(line.lineIndex);
    setManualPlaybackEndTimeSec(line.endSec);

    clearLoopTimeout();
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

  const handleReact = async (emoji: EmojiKey, lineIndex?: number) => {
    if (!danceId) return;
    onEngagementStart(lineIndex);
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
    onEngagementStart(displayLineIndex ?? undefined);
    const text = textInput.trim().slice(0, 200);
    const sessionId = getSessionId();


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
    setTimeout(() => setHasSubmitted(false), 500);
  };

  // ── Embedded compact layout ──────────────────────────────────────────
  if (displayMode === 'embedded') {
    return (
      <PanelShell isOpen={isOpen} variant="embedded" topOffset={52}>
        <VoteStrip
          votedSide={votedSide}
          score={score}
          onVoteYes={onVoteYes}
          onVoteNo={onVoteNo}
          onReplay={() => {
            if (!player) return;
            releaseManualSelectionLock();
            resetManualScrollOverride('snap');
            setRepeatMode(false);
            onResetEngagement?.();
            player.setMuted(false);
            player.seek(0);
            player.play();
          }}
          palette={palette}
        />

        <EmojiBar
          variant="strip"
          palette={palette}
          counts={Object.fromEntries(
            EMOJIS.map(({ key }) => [
              key,
              displayLineIndex != null ? (reactionData[key]?.line[displayLineIndex] ?? 0) : 0,
            ]),
          ) as any}
          reacted={new Set(
            EMOJIS
              .filter(({ key }) =>
                displayLineIndex != null && sessionReacted.has(`${key}-${displayLineIndex}`),
              )
              .map(({ key }) => key),
          )}
          onReact={(key) => {
            const targetIdx = displayLineIndex ?? activeLine?.lineIndex ?? allLines[0]?.lineIndex ?? null;
            if (targetIdx != null) handleReact(key, targetIdx);
          }}
        />

            {/* ── Lyrics scroll: fills remaining space ── */}
          <div
              ref={scrollContainerRef}
              className="relative flex-1 overflow-hidden min-h-0"
            >
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 border-y border-white/10" />
              <div className="py-1" style={{ transform: `translateY(${lyricsOffset}px)`, transition: `transform ${lyricsTransitionMs}ms ease` }}>
                {allLines.map((line, linePosition) => {
                  const currentSection = sectionMeta.sectionForLine.get(line.lineIndex) ?? null;
                  const previousSection = linePosition > 0
                    ? (sectionMeta.sectionForLine.get(allLines[linePosition - 1].lineIndex) ?? null)
                    : null;
                  const sectionLabel = sectionMeta.labelByLineIndex.get(line.lineIndex) ?? null;
                  const shouldShowSectionHeader = !!currentSection
                    && currentSection.sectionIndex !== previousSection?.sectionIndex
                    && !!sectionLabel;
                  const isSelected = selectedLineIndex === line.lineIndex;
                  const isPlayhead = playheadLineIndex === line.lineIndex;
                  const isRepeatActive = repeatMode && repeatActiveLineIndex === line.lineIndex;
                  const isActive = (!isManualSelectionLocked && isPlayhead) || (isManualSelectionLocked && isSelected) || isRepeatActive;
                  const lineCommentCount = commentCountByLine[line.lineIndex] ?? 0;
                  const isCommentPulsing = submittedLineIndex === line.lineIndex;
                  const isExpanded = expandedLineIndex === line.lineIndex;

                  const lineExpandedComments = isExpanded
                    ? comments.filter(c => c.line_index === line.lineIndex && !c.parent_comment_id)
                    : [];

                  return (
                    <div key={line.lineIndex}>
                      {shouldShowSectionHeader && (
                        <div className={linePosition === 0 ? 'mb-0.5' : 'mt-2 mb-0.5'}>
                          <div className="flex items-center gap-2 px-3">
                            <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-white/15">{sectionLabel}</span>
                            <div className="flex-1 h-px bg-white/[0.03]" />
                          </div>
                        </div>
                      )}
                      <div
                        ref={node => { rowRefs.current[line.lineIndex] = node; }}
                        onClick={() => handleLineTap(line)}
                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
                        style={{
                          minHeight: 30,
                          background: isActive ? 'rgba(255,255,255,0.03)' : 'transparent',
                          boxShadow: isActive ? `inset 2px 0 0 0 ${palette[1] ?? '#ffffff'}` : 'inset 2px 0 0 0 transparent',
                        }}
                      >
                        <span
                          className="flex-1 text-[11px] font-light leading-snug transition-colors duration-100"
                          style={{ color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.30)' }}
                        >
                          {line.text}
                        </span>
                        {(() => {
                          // Find top emoji for this line
                          let topEmoji: string | null = null;
                          let topCount = 0;
                          for (const { key, symbol } of EMOJIS) {
                            const c = reactionData[key]?.line[line.lineIndex] ?? 0;
                            if (c > topCount) { topCount = c; topEmoji = symbol; }
                          }
                          const showBadge = lineCommentCount > 0 || topCount > 0;
                          if (!showBadge) return null;
                          return (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedLineIndex(prev => (prev === line.lineIndex ? null : line.lineIndex));
                              }}
                              className={`text-[9px] font-mono shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-colors ${isExpanded ? 'border-white/25 text-white/60' : 'border-white/10 text-white/25 hover:text-white/50'}`}
                            >
                              {topEmoji && <span className="text-[10px]">{topEmoji}</span>}
                              {topCount > 0 && <span className="text-white/20">{topCount}</span>}
                              {lineCommentCount > 0 && (
                                <>
                                  <MessageCircle size={9} className="ml-0.5" />
                                  <span>{lineCommentCount}</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </div>

                      {/* Expanded comment thread */}
                      {isExpanded && (
                        <div
                          className="mx-3 mb-1 rounded-lg overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {lineExpandedComments.length === 0 ? (
                            <p className="text-[10px] font-mono text-white/20 text-center py-3">no comments yet</p>
                          ) : (
                            lineExpandedComments.map(comment => (
                              <div key={comment.id} className="px-3 py-2 border-b border-white/[0.04] last:border-b-0">
                                {comment.is_pinned && (
                                  <span className="text-[7px] font-mono uppercase tracking-wider text-white/25 mb-0.5 block">📌 pinned</span>
                                )}
                                <p className="text-[11px] font-light leading-relaxed text-white/60">{comment.text}</p>
                                {comment.replies && comment.replies.length > 0 && (
                                  <div className="mt-1 ml-3 border-l border-white/[0.06] pl-2">
                                    {comment.replies.map(reply => (
                                      <p key={reply.id} className="text-[10px] font-light text-white/45 py-1">{reply.text}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {isCommentPulsing && (
                        <div className="h-[1px] mx-3">
                          <div className="h-full rounded-full" style={{ background: palette[1] ?? 'rgba(255,255,255,0.4)', opacity: 0.5 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

        {!hideInput && (
          <CommentInput
            value={textInput}
            onChange={setTextInput}
            onSubmit={handleTextSubmit}
            onClose={onClose}
            onFocus={() => onEngagementStart(displayLineIndex ?? undefined)}
            hasSubmitted={hasSubmitted}
            size="compact"
          />
        )}
      </PanelShell>
    );
  }

  return (
    <PanelShell isOpen={isOpen} variant="fullscreen">
      <div className="flex items-center justify-end gap-2 px-4 pt-2 pb-1 shrink-0">
        {repeatMode ? (
          <button
            onClick={handleStopRepeat}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 animate-pulse" />
            ■ Stop
          </button>
        ) : (
          isUserScrollingLyrics && (
            <button
              onClick={() => resetManualScrollOverride('animate')}
              className="px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider text-white/35 border border-white/10 hover:text-white/60"
            >
              recenter
            </button>
          )
        )}
      </div>

      <VoteStrip
        votedSide={votedSide}
        score={score}
        onVoteYes={onVoteYes}
        onVoteNo={onVoteNo}
        onReplay={() => {
          if (!player) return;
          releaseManualSelectionLock();
          resetManualScrollOverride('snap');
          setRepeatMode(false);
          onResetEngagement?.();
          player.setMuted(false);
          player.seek(0);
          player.play();
        }}
        palette={palette}
      />

      <div
        ref={scrollContainerRef}
        className="relative flex-1 min-h-0 overflow-hidden"
      >
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2">
          <div
            className="w-full"
            style={{
              height: activeRowHeight,
              background: 'rgba(255,255,255,0.03)',
              boxShadow: `inset 2px 0 0 0 ${palette[1] ?? '#ffffff'}`,
            }}
          />
          <div className="pointer-events-auto" style={{ background: '#111111' }}>
            <EmojiBar
              variant="grid"
              palette={palette}
              counts={Object.fromEntries(
                EMOJIS.map(({ key }) => [
                  key,
                  displayLineIndex != null ? (reactionData[key]?.line[displayLineIndex] ?? 0) : 0,
                ]),
              ) as any}
              reacted={new Set(
                EMOJIS
                  .filter(({ key }) =>
                    displayLineIndex != null &&
                    sessionReacted.has(`${key}-${displayLineIndex}`),
                  )
                  .map(({ key }) => key),
              )}
              onReact={(key) => {
                if (displayLineIndex != null) handleReact(key, displayLineIndex);
              }}
            />

            <CommentInput
              value={textInput}
              onChange={setTextInput}
              onSubmit={handleTextSubmit}
              onClose={() => {
                if (replyingTo) setReplyingTo(null);
                else onClose();
              }}
              onFocus={() => onEngagementStart(displayLineIndex ?? undefined)}
              hasSubmitted={hasSubmitted}
              placeholder={replyingTo ? 'write your reply...' : 'What hit the hardest?'}
              size="full"
            />
          </div>
        </div>

        <div className="pb-2" style={{ transform: `translateY(${lyricsOffset}px)`, transition: `transform ${lyricsTransitionMs}ms ease` }}>
              {allLines.map((line, linePosition) => {
                    const currentSection = sectionMeta.sectionForLine.get(line.lineIndex) ?? null;
                    const previousSection = linePosition > 0
                      ? (sectionMeta.sectionForLine.get(allLines[linePosition - 1].lineIndex) ?? null)
                      : null;
                    const sectionLabel = sectionMeta.labelByLineIndex.get(line.lineIndex) ?? null;
                    const shouldShowSectionHeader = !!currentSection
                      && currentSection.sectionIndex !== previousSection?.sectionIndex
                      && !!sectionLabel;
                    const isSelected = selectedLineIndex === line.lineIndex;
                    const isPlayhead = playheadLineIndex === line.lineIndex;
                    const isRepeatActive = repeatMode && repeatActiveLineIndex === line.lineIndex;
                    const isActive = (!isManualSelectionLocked && isPlayhead) || (isManualSelectionLocked && isSelected) || isRepeatActive;

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
                      <div key={line.lineIndex} className={linePosition === 0 ? 'mt-3' : undefined}>
                        {shouldShowSectionHeader && (
                          <div className={linePosition === 0 ? 'mb-1' : 'mt-5 mb-1'}>
                            <div className="flex items-center gap-2 px-5 mb-1">
                              <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/18">{sectionLabel}</span>
                              <div className="flex-1 h-px bg-white/[0.035]" />
                            </div>
                          </div>
                        )}
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

                          <div className="min-h-6 shrink-0 flex items-center justify-end gap-2">
                            {lineCommentCount > 0 && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setExpandedLineIndex(prev => (prev === line.lineIndex ? null : line.lineIndex));
                                }}
                                className={`h-6 px-2 rounded-full border text-[10px] font-mono transition-colors inline-flex items-center gap-1 ${isExpanded ? 'border-white/30 text-white/70' : 'border-white/10 text-white/35 hover:text-white/60'}`}
                              >
                                <MessageCircle size={12} />
                                {lineCommentCount}
                              </button>
                            )}

                            {totalLineReactions > 0 && (
                              <div className="h-6 min-w-[20px] text-right text-[10px] font-mono text-white/35 inline-flex items-center">
                                <span>
                                  {topReaction?.symbol ?? '·'}{totalLineReactions}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className="mx-4 mb-2 rounded-xl overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            {expandedLineComments.length === 0 ? (
                              <p className="text-[11px] font-mono text-white/20 text-center py-5">no comments yet — be first</p>
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
      </div>

    </PanelShell>
  );
}

export { ReactionPanel };
export default ReactionPanel;
