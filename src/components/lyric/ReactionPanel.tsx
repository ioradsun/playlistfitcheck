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
  onPause?: () => void;
  onResume?: () => void;
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

function ReactionPanel({ displayMode, isOpen, onClose, danceId, activeLine, allLines, audioSections, currentTimeSec: _currentTimeSec, palette, onSeekTo, player, onReactionFired, reactionData, onReactionDataChange, onPause, onResume, votedSide, score, onVoteYes, onVoteNo, hideInput = false, refreshKey = 0 }: ReactionPanelProps) {
  const sections = audioSections ?? [];
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [submittedLineIndex, setSubmittedLineIndex] = useState<number | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<Set<string>>(new Set());

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const userTookControlRef = useRef(false);
  const [pinnedLineIndex, setPinnedLineIndex] = useState<number | null>(null);
  const pinnedLineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveLineRef = useRef<number | null>(null);

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

  const voteAccent = palette[1] ?? 'rgba(255,255,255,0.7)';
  const playheadLineIndex = activeLine?.lineIndex ?? null;
  const displayLineIndex = playheadLineIndex ?? allLines[0]?.lineIndex ?? null;

  // Keep last known line while audio plays through silence
  if (playheadLineIndex !== null) lastActiveLineRef.current = playheadLineIndex;
  const heldLineIndex = (player && !player.audio.paused) ? lastActiveLineRef.current : null;
  const effectiveActiveIndex = pinnedLineIndex ?? playheadLineIndex ?? heldLineIndex;

  const expandedLineComments = useMemo(() => {
    if (expandedLineIndex == null) return [];
    return comments.filter(c => c.line_index === expandedLineIndex && !c.parent_comment_id);
  }, [comments, expandedLineIndex]);

  useEffect(() => {
    if (!isOpen) return;
    setHasSubmitted(false);
    setTextInput('');
    setReplyingTo(null);
    setExpandedLineIndex(null);
  }, [isOpen]);

  // Auto-scroll: follows playhead until user takes control
  useEffect(() => {
    if (!isOpen) return;
    if (userTookControlRef.current) return;
    if (playheadLineIndex == null) return;
    if (!player || player.audio.paused) return;

    const container = scrollContainerRef.current;
    const row = rowRefs.current[playheadLineIndex];
    if (!container || !row) return;

    const block = row.parentElement ?? row;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const rowTop = row.offsetTop;
    const blockBottom = block.offsetTop + block.offsetHeight;

    const rowVisible = rowTop >= containerTop && rowTop < containerBottom;
    const blockFullyVisible = blockBottom <= containerBottom;

    if (rowVisible && blockFullyVisible) return;

    if (rowVisible && !blockFullyVisible) {
      const nudge = blockBottom - containerBottom + 12;
      container.scrollBy({ top: nudge, behavior: 'smooth' });
      return;
    }

    const targetTop = rowTop - container.clientHeight * 0.30;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [playheadLineIndex, isOpen, player]);

  // User scroll → permanently stop auto-scroll for this panel session
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      userTookControlRef.current = true;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Reset control flag when panel closes so next open starts with auto-scroll
  useEffect(() => {
    if (!isOpen) {
      userTookControlRef.current = false;
    }
  }, [isOpen]);

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
  const lastActiveLineRef = useRef<number | null>(null);


  const handleLineTap = (line: LyricSectionLine) => {
    if (!player) {
      onSeekTo(line.startSec);
      return;
    }
    if (line.lineIndex === playheadLineIndex && !player.audio.paused) {
      player.pause();
      return;
    }
    setPinnedLineIndex(line.lineIndex);
    if (pinnedLineTimerRef.current) clearTimeout(pinnedLineTimerRef.current);
    pinnedLineTimerRef.current = setTimeout(() => setPinnedLineIndex(null), 300);
    player.seek(line.startSec);
    if (player.audio.paused) {
      player.audio.play().catch(() => {});
      player.startRendering();
    }
    userTookControlRef.current = true;
  };

  const handleReact = async (emoji: EmojiKey, lineIndex?: number) => {
    if (!danceId) return;
    const sessionId = getSessionId();
    const targetLineIndex = lineIndex ?? activeLine?.lineIndex ?? null;
    const reactionKey = `${emoji}-${targetLineIndex ?? 'song'}`;
    if (sessionReacted.has(reactionKey)) return;


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
    onResume?.();
    setTimeout(() => setHasSubmitted(false), 500);
  };

  const handlePanelClose = () => {
    if (replyingTo) setReplyingTo(null);
    else onClose();
  };

  const runItBackCount = score?.replay_yes ?? 0;
  const notForMeCount = score != null ? score.total - score.replay_yes : 0;

  return (
    <PanelShell isOpen={isOpen} variant={displayMode}>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'none' }}>
        <div className="pt-3 pb-32">
          {allLines.map((line, linePosition) => {
            const currentSection = sectionMeta.sectionForLine.get(line.lineIndex) ?? null;
            const previousSection = linePosition > 0
              ? (sectionMeta.sectionForLine.get(allLines[linePosition - 1].lineIndex) ?? null)
              : null;
            const sectionLabel = sectionMeta.labelByLineIndex.get(line.lineIndex) ?? null;
            const shouldShowSectionHeader = !!currentSection
              && currentSection.sectionIndex !== previousSection?.sectionIndex
              && !!sectionLabel;
            const isActive = line.lineIndex === effectiveActiveIndex;

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
              <div
                key={line.lineIndex}
              >
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
                    boxShadow: isActive ? `inset 2px 0 0 0 ${palette[1] ?? '#ffffff'}` : 'none',
                  }}
                >
                  <span
                    className="flex-1 text-[11px] font-light leading-relaxed transition-colors duration-100"
                    style={{ color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)' }}
                  >
                    {line.text}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {topReaction && (
                      <span
                        className="text-[9px] font-mono px-1 py-0.5 rounded"
                        style={{
                          color: 'rgba(255,255,255,0.45)',
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        {topReaction.symbol}
                        {totalLineReactions > 1 ? ` ${totalLineReactions}` : ''}
                      </span>
                    )}

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (expandedLineIndex === line.lineIndex) {
                          setExpandedLineIndex(null);
                          if (replyingTo?.line_index === line.lineIndex) setReplyingTo(null);
                        } else {
                          setExpandedLineIndex(line.lineIndex);
                        }
                      }}
                      className={`relative transition-all ${lineCommentCount > 0 ? 'opacity-90' : 'opacity-45 hover:opacity-70'} ${isCommentPulsing ? 'scale-110' : ''}`}
                      aria-label="Toggle comments"
                    >
                      <MessageCircle size={11} className="text-white/30" />
                      {lineCommentCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 text-[7px] font-mono text-white/50 min-w-[10px] text-center">
                          {lineCommentCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {isActive && (
                  <>
                    {/* Emoji bar — inline under active line */}
                    <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-white/[0.04]">
                      {EMOJIS.map(({ key, symbol, label }) => {
                        const count = reactionData[key]?.line[line.lineIndex] ?? 0;
                        const reacted = sessionReacted.has(`${key}-${line.lineIndex}`);
                        return (
                          <button
                            key={key}
                            onClick={() => handleReact(key, line.lineIndex)}
                            className="flex flex-col items-center gap-0.5 w-9"
                            style={reacted ? { background: `${palette[1] ?? '#fff'}18`, borderRadius: '8px' } : undefined}
                          >
                            <span className="text-[15px]">{symbol}</span>
                            <span className="text-[7px] font-mono uppercase tracking-wide text-white/20">{label}</span>
                            <span
                              className="text-[8px] font-mono min-h-[10px]"
                              style={{
                                color: reacted ? (palette[1] ?? 'rgba(255,255,255,0.7)') : 'rgba(255,255,255,0.30)',
                                visibility: count > 0 ? 'visible' : 'hidden',
                              }}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Comment input — inline under emoji bar */}
                    {!hideInput && (
                      <div
                        className="mx-3 my-2"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', padding: '8px 12px' }}
                      >
                        <input
                          className="w-full bg-transparent text-[11px] font-mono text-white placeholder:text-white/35 outline-none"
                          placeholder={replyingTo ? 'reply...' : 'This line'}
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTextSubmit(); } }}
                          onFocus={() => onPause?.()}
                        />
                      </div>
                    )}
                  </>
                )}

                {isExpanded && (
                  <div
                    className="mx-3 mb-1 rounded-xl overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {expandedLineComments.length === 0 ? (
                      <p className="text-[10px] font-mono text-white/20 text-center py-3">no comments yet — be first</p>
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
                                  ? 'ml-3 border-l border-white/[0.06] pl-2 py-2'
                                  : 'px-3 py-2.5 border-b border-white/[0.04]'}
                              >
                                {comment.is_pinned && (
                                  <span className="text-[7px] font-mono uppercase tracking-wider text-white/25 mb-0.5 block">📌 pinned</span>
                                )}
                                <p className="text-[11px] font-light leading-relaxed text-white/60">{comment.text}</p>
                                <div className="mt-1 flex items-center gap-2.5 flex-wrap">
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
                                      className="text-[9px] font-mono text-white/18 hover:text-white/45 transition-colors ml-auto focus:outline-none"
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

                <div className="h-[1px] mx-3">
                  <div
                    className="h-full rounded-full"
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

      <div
        className="shrink-0 flex"
        style={{ background: '#0a0a0a', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-full max-w-2xl mx-auto flex items-stretch"
          style={{ height: displayMode === 'fullscreen' ? 44 : 48 }}
        >
          <button
            onClick={onVoteYes}
            className={`flex-1 flex items-center justify-center gap-2 hover:bg-white/[0.04] transition-colors ${displayMode === 'fullscreen' ? 'py-2.5' : 'py-3'}`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors"
              style={{
                color: votedSide === null ? 'rgba(255,255,255,1)'
                  : votedSide === 'a' ? voteAccent
                  : 'rgba(255,255,255,0.22)',
              }}
            >
              Run it back
            </span>
            {runItBackCount > 0 && (
              <span className="text-[9px] font-mono text-white/25">{runItBackCount}</span>
            )}
          </button>

          <div style={{ width: '0.5px' }} className="bg-white/[0.06] self-stretch my-2" />

          <button
            onClick={onVoteNo}
            className={`flex-1 flex items-center justify-center gap-2 hover:bg-white/[0.04] transition-colors ${displayMode === 'fullscreen' ? 'py-2.5' : 'py-3'}`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors"
              style={{
                color: votedSide === null ? 'rgba(255,255,255,1)'
                  : votedSide === 'b' ? voteAccent
                  : 'rgba(255,255,255,0.22)',
              }}
            >
              Not for me
            </span>
            {notForMeCount > 0 && (
              <span className="text-[9px] font-mono text-white/25">{notForMeCount}</span>
            )}
          </button>

          <div style={{ width: '0.5px' }} className="bg-white/[0.06] self-stretch my-2" />

          <button
            onClick={handlePanelClose}
            aria-label="Close"
            className={`group flex items-center justify-center min-w-[56px] px-4 ${displayMode === 'fullscreen' ? 'py-2.5' : 'py-3'} hover:bg-white/[0.04] transition-colors focus:outline-none shrink-0`}
          >
            <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
          </button>
        </div>
      </div>
    </PanelShell>
  );
}

export { ReactionPanel };
export default ReactionPanel;
