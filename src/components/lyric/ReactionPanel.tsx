import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';
import type { LyricSectionLine } from '@/hooks/useLyricSections';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';
import { PanelShell } from '@/components/shared/panel/PanelShell';
import { EMOJIS, type EmojiKey } from '@/components/shared/panel/panelConstants';

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

function ReactionPanel({ displayMode, isOpen, onClose, engagementMode, frozenLineIndex, danceId, activeLine, allLines, audioSections, currentTimeSec, palette, onSeekTo, player, onReactionFired, reactionData, onReactionDataChange, onEngagementStart, onResetEngagement, votedSide, score, onVoteYes, onVoteNo, hideInput = false, refreshKey = 0 }: ReactionPanelProps) {
  const sections = audioSections ?? [];
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [playheadLineIndex, setPlayheadLineIndex] = useState<number | null>(null);
  const [, setAutoFollowEnabled] = useState(true);
  const [isManualSelectionLocked, setIsManualSelectionLocked] = useState(false);
  const [manualPlaybackTargetIndex, setManualPlaybackTargetIndex] = useState<number | null>(null);
  const [manualPlaybackEndTimeSec, setManualPlaybackEndTimeSec] = useState<number | null>(null);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
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
  const userScrollingRef = useRef(false);

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
  const voteAccent = palette[1] ?? 'rgba(255,255,255,0.7)';

  const displayLineIndex = engagedDisplayLineIndex ?? (isManualSelectionLocked
    ? (selectedLineIndex ?? manualPlaybackTargetIndex)
    : (playheadLineIndex ?? activeLine?.lineIndex ?? allLines[0]?.lineIndex ?? null));

  const expandedLineComments = useMemo(() => {
    if (expandedLineIndex == null) return [];
    return comments.filter(c => c.line_index === expandedLineIndex && !c.parent_comment_id);
  }, [comments, expandedLineIndex]);

  const isEmbedded = displayMode === 'embedded';


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

  // Snap active line to top on playback advance
  useEffect(() => {
    if (userScrollingRef.current) return;
    const container = scrollContainerRef.current;
    const row = rowRefs.current[playheadLineIndex ?? -1];
    if (!container || !row) return;
    container.scrollTo({ top: row.offsetTop, behavior: 'smooth' });
  }, [playheadLineIndex]);

  // Reel: scroll stops → seek to nearest line and play
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let debounce: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      userScrollingRef.current = true;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        userScrollingRef.current = false;
        const scrollTop = container.scrollTop;
        let nearest: { lineIndex: number; startSec: number } | null = null;
        let minDist = Infinity;
        for (const [idxStr, row] of Object.entries(rowRefs.current)) {
          if (!row) continue;
          const dist = Math.abs(row.offsetTop - scrollTop);
          if (dist < minDist) {
            minDist = dist;
            const line = allLines.find(l => l.lineIndex === Number(idxStr));
            if (line) nearest = { lineIndex: line.lineIndex, startSec: line.startSec };
          }
        }
        if (!nearest || !player) return;
        setPlayheadLineIndex(nearest.lineIndex);
        setAutoFollowEnabled(true);
        onSeekTo(nearest.startSec);
        player.play();
      }, 400);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      clearTimeout(debounce);
    };
  }, [player, allLines, onSeekTo]);

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
    }
  }, [isOpen, repeatMode, player]);

  useEffect(() => {
    return () => {
      clearLoopTimeout();
      cancelAnimationFrame(repeatRafRef.current);
    };
  }, []);

  const handleLineTap = (line: LyricSectionLine) => {
    onEngagementStart(line.lineIndex);
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

  const displayLine = allLines.find(line => line.lineIndex === displayLineIndex) ?? null;
  const displaySectionLabel = displayLineIndex != null
    ? (sectionMeta.labelByLineIndex.get(displayLineIndex) ?? null)
    : null;

  const handlePanelClose = () => {
    if (replyingTo) setReplyingTo(null);
    else onClose();
  };

  const runItBackCount = score?.replay_yes ?? 0;
  const notForMeCount = score != null ? score.total - score.replay_yes : 0;

  return (
    <PanelShell isOpen={isOpen} variant={displayMode}>
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="text-[7px] font-mono uppercase tracking-[0.2em] text-white/25">{displaySectionLabel ?? ''}</div>
        <p className={`${isEmbedded ? 'text-[13px]' : 'text-[15px]'} font-light leading-relaxed text-white/85`}>
          {displayLine?.text ?? '...'}
        </p>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-2 px-4 py-2">
        {EMOJIS.map(({ key, symbol, label }) => {
          const targetIdx = displayLine?.lineIndex ?? allLines[0]?.lineIndex;
          const count = targetIdx != null ? (reactionData[key]?.line[targetIdx] ?? 0) : 0;
          const reacted = targetIdx != null && sessionReacted.has(`${key}-${targetIdx}`);
          return (
            <button
              key={key}
              onClick={() => {
                if (targetIdx != null) handleReact(key, targetIdx);
              }}
              className="flex flex-col items-center gap-0.5 w-10 py-1"
              style={reacted ? { background: `${palette[1] ?? '#ffffff'}15`, borderRadius: 8 } : undefined}
            >
              <span className="text-[16px]">{symbol}</span>
              <span className="text-[7px] font-mono uppercase tracking-wide text-white/20">{label}</span>
              {count > 0 && (
                <span
                  className="text-[8px] font-mono"
                  style={{ color: reacted ? (palette[1] ?? 'rgba(255,255,255,0.7)') : 'rgba(255,255,255,0.30)' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hideInput && (
        <div
          className="shrink-0 mx-3 mb-2 px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${isInputFocused ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'}`,
          }}
        >
          <input
            className="w-full bg-transparent text-[11px] font-mono text-white placeholder:text-white/35 outline-none"
            placeholder={replyingTo ? 'write your reply...' : 'What hit the hardest?'}
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleTextSubmit();
              }
            }}
            onFocus={() => {
              setIsInputFocused(true);
              onEngagementStart(displayLineIndex ?? undefined);
            }}
            onBlur={() => setIsInputFocused(false)}
          />
        </div>
      )}

      <div
        className="shrink-0 flex items-center"
        style={{
          height: 40,
          background: '#0a0a0a',
          borderTop: '0.5px solid rgba(255,255,255,0.06)',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          onClick={onVoteYes}
          className="flex-1 h-full flex items-center justify-center gap-1.5 text-[10px] font-mono tracking-[0.14em] uppercase"
          style={{
            color: votedSide === null
              ? 'rgba(255,255,255,1)'
              : votedSide === 'a'
                ? voteAccent
                : 'rgba(255,255,255,0.22)',
          }}
        >
          <span>Run it back</span>
          {runItBackCount > 0 && <span className="text-[9px] opacity-60">{runItBackCount}</span>}
        </button>
        <div className="w-[0.5px] bg-white/[0.06] self-stretch my-2" />
        <button
          onClick={onVoteNo}
          className="flex-1 h-full flex items-center justify-center gap-1.5 text-[10px] font-mono tracking-[0.14em] uppercase"
          style={{
            color: votedSide === null
              ? 'rgba(255,255,255,1)'
              : votedSide === 'b'
                ? voteAccent
                : 'rgba(255,255,255,0.22)',
          }}
        >
          <span>Not for me</span>
          {notForMeCount > 0 && <span className="text-[9px] opacity-60">{notForMeCount}</span>}
        </button>
        <div className="w-[0.5px] bg-white/[0.06] self-stretch my-2" />
        <button
          onClick={() => {
            releaseManualSelectionLock();
            setAutoFollowEnabled(true);
            setRepeatMode(false);
            onResetEngagement?.();
            player?.setMuted(false);
            player?.seek(0);
            player?.play();
          }}
          className="px-3 h-full flex items-center text-[13px] text-white/30 hover:text-white/70 transition-colors"
          aria-label="Replay"
        >
          ↺
        </button>
        <div className="w-[0.5px] bg-white/[0.06] self-stretch my-2" />
        <button onClick={handlePanelClose} className="px-3 h-full flex items-center shrink-0" aria-label="Close panel">
          <X size={13} className="text-white/30 hover:text-white/60 transition-colors" />
        </button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
        <div className={isEmbedded ? 'py-1' : 'pb-2'}>
          {allLines.map((line, linePosition) => {
            const currentSection = sectionMeta.sectionForLine.get(line.lineIndex) ?? null;
            const previousSection = linePosition > 0
              ? (sectionMeta.sectionForLine.get(allLines[linePosition - 1].lineIndex) ?? null)
              : null;
            const sectionLabel = sectionMeta.labelByLineIndex.get(line.lineIndex) ?? null;
            const shouldShowSectionHeader = !!currentSection
              && currentSection.sectionIndex !== previousSection?.sectionIndex
              && !!sectionLabel;
            const isActive = line.lineIndex === playheadLineIndex;

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
              <div key={line.lineIndex} className={!isEmbedded && linePosition === 0 ? 'mt-3' : undefined}>
                {shouldShowSectionHeader && (
                  <div className={isEmbedded ? (linePosition === 0 ? 'mb-0.5' : 'mt-2 mb-0.5') : (linePosition === 0 ? 'mb-1' : 'mt-5 mb-1')}>
                    <div className={`flex items-center gap-2 ${isEmbedded ? 'px-3' : 'px-5 mb-1'}`}>
                      <span className={isEmbedded ? 'text-[7px] font-mono uppercase tracking-[0.2em] text-white/15' : 'text-[8px] font-mono uppercase tracking-[0.22em] text-white/18'}>{sectionLabel}</span>
                      <div className={`flex-1 h-px ${isEmbedded ? 'bg-white/[0.03]' : 'bg-white/[0.035]'}`} />
                    </div>
                  </div>
                )}
                <div
                  ref={node => { rowRefs.current[line.lineIndex] = node; }}
                  onClick={() => handleLineTap(line)}
                  className={isEmbedded ? 'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors' : 'relative flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors'}
                  style={{
                    minHeight: isEmbedded ? 30 : 46,
                    background: isActive ? 'rgba(255,255,255,0.03)' : 'transparent',
                    boxShadow: isActive ? `inset 2px 0 0 0 ${palette[1] ?? '#ffffff'}` : 'inset 2px 0 0 0 transparent',
                  }}
                >
                  <span
                    className={isEmbedded ? 'flex-1 text-[11px] font-light leading-relaxed transition-colors duration-100' : 'flex-1 text-[12px] font-light leading-relaxed transition-colors duration-100'}
                    style={{ color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.30)' }}
                  >
                    {line.text}
                  </span>

                  <div className={isEmbedded ? 'min-h-5 shrink-0 flex items-center justify-end gap-1.5' : 'min-h-6 shrink-0 flex items-center justify-end gap-2'}>
                    {lineCommentCount > 0 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setExpandedLineIndex(prev => (prev === line.lineIndex ? null : line.lineIndex));
                        }}
                        className={isEmbedded
                          ? `h-5 px-1.5 rounded-full border text-[9px] font-mono transition-colors inline-flex items-center gap-1 ${isExpanded ? 'border-white/25 text-white/65' : 'border-white/10 text-white/30 hover:text-white/55'}`
                          : `h-6 px-2 rounded-full border text-[10px] font-mono transition-colors inline-flex items-center gap-1 ${isExpanded ? 'border-white/30 text-white/70' : 'border-white/10 text-white/35 hover:text-white/60'}`}
                      >
                        <MessageCircle size={isEmbedded ? 10 : 12} />
                        {lineCommentCount}
                      </button>
                    )}

                    {totalLineReactions > 0 && (
                      <div className={isEmbedded ? 'h-5 min-w-[16px] text-right text-[9px] font-mono text-white/35 inline-flex items-center' : 'h-6 min-w-[20px] text-right text-[10px] font-mono text-white/35 inline-flex items-center'}>
                        <span>
                          {topReaction?.symbol ?? '·'}{totalLineReactions}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div
                    className={isEmbedded ? 'mx-3 mb-1 rounded-xl overflow-hidden' : 'mx-4 mb-2 rounded-xl overflow-hidden'}
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {expandedLineComments.length === 0 ? (
                      <p className={isEmbedded ? 'text-[10px] font-mono text-white/20 text-center py-3' : 'text-[11px] font-mono text-white/20 text-center py-5'}>no comments yet — be first</p>
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
                                className={isReply
                                  ? (isEmbedded ? 'ml-3 border-l border-white/[0.06] pl-2 py-2' : 'ml-4 border-l border-white/[0.06] pl-3 py-2.5')
                                  : (isEmbedded ? 'px-3 py-2.5 border-b border-white/[0.04]' : 'px-4 py-3 border-b border-white/[0.04]')}
                              >
                                {comment.is_pinned && (
                                  <span className={isEmbedded ? 'text-[7px] font-mono uppercase tracking-wider text-white/25 mb-0.5 block' : 'text-[8px] font-mono uppercase tracking-wider text-white/25 mb-1 block'}>📌 pinned</span>
                                )}
                                <p className={isEmbedded ? 'text-[11px] font-light leading-relaxed text-white/60' : 'text-[12px] font-light leading-relaxed text-white/65 mb-2'}>{comment.text}</p>
                                <div className={isEmbedded ? 'mt-1 flex items-center gap-2.5 flex-wrap' : 'flex items-center gap-3 flex-wrap'}>
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
                                      className={isEmbedded
                                        ? 'text-[9px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto focus:outline-none'
                                        : 'text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto focus:outline-none'}
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

                <div className={isEmbedded ? 'h-[1px] mx-3' : 'h-[2px] px-5'}>
                  <div
                    className={isEmbedded ? 'h-full rounded-full' : 'h-full rounded-full transition-opacity'}
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
