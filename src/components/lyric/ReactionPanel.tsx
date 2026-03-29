import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import type { LyricSectionLine } from "@/hooks/useLyricSections";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import { PanelShell } from "@/components/shared/panel/PanelShell";
import {
  EMOJIS,
  type EmojiKey,
} from "@/components/shared/panel/panelConstants";

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
  displayMode: "fullscreen" | "embedded" | "reels";
  isOpen: boolean;
  onClose: () => void;
  danceId: string;
  activeLine: {
    text: string;
    lineIndex: number;
    sectionLabel: string | null;
  } | null;
  allLines: LyricSectionLine[];
  audioSections: CanonicalAudioSection[];
  phrases?: Array<{ wordRange: [number, number] }> | null;
  words?: Array<{ start: number; end: number }> | null;
  currentTimeSec: number;
  palette: string[];
  onSeekTo: (sec: number, endSec?: number) => void;
  player: LyricDancePlayer | null;
  durationSec: number;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange: (
    data:
      | Record<string, { line: Record<number, number>; total: number }>
      | ((
          prev: Record<string, { line: Record<number, number>; total: number }>,
        ) => Record<string, { line: Record<number, number>; total: number }>),
  ) => void;
  onReactionFired: (emoji: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  votedSide?: "a" | "b" | null;
  score?: { total: number; replay_yes: number } | null;
  onVoteYes?: () => void;
  onVoteNo?: () => void;
  hideInput?: boolean;
  refreshKey?: number;
  /** When provided, replaces the default "Run it back / Not for me" bottom bar.
   *  Used by battle cards for Left Hook / Right Hook tab switching. */
  renderBottomBar?: (onClose: () => void) => ReactNode;
  /** Called when panel closes with the last audio position so the caller can resume there. */
  onCloseWithPosition?: (timeSec: number | null) => void;
  maxHeight?: string;
  empowermentPromise?: {
    emotionalJob: string;
    fromState: string;
    toState: string;
    promise: string;
    hooks: string[];
  } | null;
  fmlyHookEnabled?: boolean;
  onFireLine?: (lineIndex: number, holdMs: number) => void;
  onLineVisible?: (lineIndex: number) => void;
}

function FireLineButton({
  lineIndex: _lineIndex,
  fireCount,
  onFire,
  accent,
}: {
  lineIndex: number;
  fireCount: number;
  onFire: (holdMs: number) => void;
  accent: string;
}) {
  const holdRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    holdRef.current = Date.now();
    setHolding(true);
    tickRef.current = setInterval(() => {
      setProgress(
        Math.min(1, (Date.now() - (holdRef.current ?? Date.now())) / 3000),
      );
    }, 40);
  };

  const end = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    if (!holdRef.current) return;
    const ms = Date.now() - holdRef.current;
    holdRef.current = null;
    setHolding(false);
    setProgress(0);
    if (tickRef.current) clearInterval(tickRef.current);
    onFire(ms);
  };

  const scale = 1 + (holding ? progress * 0.35 : 0);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  return (
    <div
      onMouseDown={start}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={(e) => {
        e.preventDefault();
        start(e);
      }}
      onTouchEnd={end}
      style={{
        width: 44,
        height: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        cursor: "pointer",
        borderRadius: 10,
        background: holding ? `${accent}15` : "transparent",
        border: `1px solid ${holding ? `${accent}40` : "transparent"}`,
        transition: "background 0.15s, border 0.15s",
        touchAction: "none",
      }}
    >
      <span
        style={{
          fontSize: 20,
          transform: `scale(${scale})`,
          transition: holding ? "none" : "transform 0.2s",
        }}
      >
        🔥
      </span>
      {fireCount > 0 && (
        <span
          style={{
            fontSize: 8,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.25)",
            marginTop: 1,
          }}
        >
          {fireCount}
        </span>
      )}
    </div>
  );
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
        className="text-[10px] font-mono text-white/18 hover:text-white/45 transition-colors"
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

function ReactionPanel({
  displayMode,
  isOpen,
  onClose,
  danceId,
  activeLine,
  allLines,
  audioSections,
  currentTimeSec: _currentTimeSec,
  palette,
  onSeekTo,
  player,
  onReactionFired,
  reactionData,
  onReactionDataChange: _onReactionDataChange,
  onPause,
  onResume,
  votedSide: _votedSide,
  score: _score,
  onVoteYes: _onVoteYes,
  onVoteNo: _onVoteNo,
  hideInput: _hideInput = false,
  refreshKey = 0,
  renderBottomBar,
  onCloseWithPosition,
  maxHeight,
  empowermentPromise: _empowermentPromise,
  fmlyHookEnabled: _fmlyHookEnabled,
  onFireLine,
  onLineVisible,
}: ReactionPanelProps) {
  const sections = audioSections ?? [];
  const [textInput, setTextInput] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [replyingTo, setReplyingTo] = useState<CommentRow | null>(null);
  const [submittedLineIndex, setSubmittedLineIndex] = useState<number | null>(
    null,
  );
  const [commentReactions, setCommentReactions] = useState<
    Record<string, Record<string, number>>
  >({});
  const [sessionCommentReacted, setSessionCommentReacted] = useState<
    Set<string>
  >(new Set());

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const exposureObserverRef = useRef<IntersectionObserver | null>(null);
  const reportedExposures = useRef<Set<number>>(new Set());
  const userTookControlRef = useRef(false);
  const [pinnedLineIndex, setPinnedLineIndex] = useState<number | null>(null);
  const pinnedLineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveLineRef = useRef<number | null>(null);
  // null = free play (initial open, replay). Set to line.endSec on user tap.
  const stopAtSecRef = useRef<number | null>(null);

  const sectionMeta = useMemo(() => {
    const canonical = sections
      .filter(
        (section) =>
          Number.isFinite(section.startSec) &&
          Number.isFinite(section.endSec) &&
          section.endSec > section.startSec,
      )
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
      labelBySectionIndex.set(
        section.sectionIndex,
        totalCount > 1 ? `${base} ${seenCount}` : base,
      );
    });

    const sectionForLine = new Map<number, CanonicalAudioSection | null>();
    const labelByLineIndex = new Map<number, string | null>();

    allLines.forEach((line) => {
      const lineStart = line.startSec;
      const matchedSection =
        canonical.find((section, index) => {
          const isLast = index === canonical.length - 1;
          return isLast
            ? lineStart >= section.startSec &&
                lineStart <= section.endSec + 0.05
            : lineStart >= section.startSec && lineStart < section.endSec;
        }) ?? null;
      sectionForLine.set(line.lineIndex, matchedSection);
      labelByLineIndex.set(
        line.lineIndex,
        matchedSection
          ? (labelBySectionIndex.get(matchedSection.sectionIndex) ?? null)
          : null,
      );
    });

    return { sectionForLine, labelByLineIndex };
  }, [allLines, sections]);

  const accent = palette[1] ?? "rgba(255,255,255,0.7)";
  const playheadLineIndex = activeLine?.lineIndex ?? null;
  const displayLineIndex = playheadLineIndex ?? allLines[0]?.lineIndex ?? null;

  // Keep last known line while audio plays through silence
  if (playheadLineIndex !== null) lastActiveLineRef.current = playheadLineIndex;
  const heldLineIndex =
    player && !player.audio.paused ? lastActiveLineRef.current : null;
  const effectiveActiveIndex =
    pinnedLineIndex ?? playheadLineIndex ?? heldLineIndex;

  useEffect(() => {
    if (!isOpen || !onLineVisible) return;
    reportedExposures.current.clear();

    exposureObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const lineIndex = Number(
            (entry.target as HTMLElement).dataset.lineIndex,
          );
          if (isNaN(lineIndex) || reportedExposures.current.has(lineIndex))
            return;
          setTimeout(() => {
            if (reportedExposures.current.has(lineIndex)) return;
            reportedExposures.current.add(lineIndex);
            onLineVisible(lineIndex);
          }, 800);
        });
      },
      { threshold: 0.6 },
    );

    Object.entries(rowRefs.current).forEach(([, el]) => {
      if (el) exposureObserverRef.current?.observe(el);
    });

    return () => exposureObserverRef.current?.disconnect();
  }, [isOpen, onLineVisible]);

  useEffect(() => {
    if (!isOpen) return;
    setHasSubmitted(false);
    setTextInput("");
    setReplyingTo(null);
    stopAtSecRef.current = null; // cleared — tapping a line will set it
    userTookControlRef.current = false; // re-enable auto-scroll for this session
  }, [isOpen]);

  // Stop audio when the tapped line ends; clear on replay-from-start
  useEffect(() => {
    if (!player) return;
    const audio = player.audio;
    const onTimeUpdate = () => {
      if (stopAtSecRef.current != null && audio.currentTime >= stopAtSecRef.current) {
        stopAtSecRef.current = null;
        player.pause();
      }
    };
    const onPlay = () => {
      // Replay from start (seek(0) + play()) clears the per-line stop constraint
      if (audio.currentTime <= 0.5) stopAtSecRef.current = null;
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
    };
  }, [player]);

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
      container.scrollBy({ top: nudge, behavior: "smooth" });
      return;
    }

    const targetTop = rowTop - container.clientHeight * 0.3;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, [playheadLineIndex, isOpen, player]);

  // User scroll → permanently stop auto-scroll for this panel session
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      userTookControlRef.current = true;
      if (stopAtSecRef.current != null && player && !player.audio.paused) {
        stopAtSecRef.current = null;
        player.pause();
      }
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [player]);

  // Reset control flag when panel closes so next open starts with auto-scroll
  useEffect(() => {
    if (!isOpen) {
      userTookControlRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!danceId) return;

    supabase
      .from("lyric_dance_comments" as any)
      .select(
        "id, text, line_index, submitted_at, is_pinned, parent_comment_id",
      )
      .eq("dance_id", danceId)
      .order("is_pinned", { ascending: false })
      .order("submitted_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!data) return;
        const rows = data as unknown as CommentRow[];
        const topLevel = rows.filter((c) => !c.parent_comment_id);
        const byParent: Record<string, CommentRow[]> = {};
        rows
          .filter((c) => c.parent_comment_id)
          .forEach((c) => {
            const parentId = c.parent_comment_id!;
            if (!byParent[parentId]) byParent[parentId] = [];
            byParent[parentId].push(c);
          });
        setComments(
          topLevel.map((c) => ({ ...c, replies: byParent[c.id] ?? [] })),
        );
      });

    supabase
      .from("lyric_dance_comment_reactions" as any)
      .select("comment_id, emoji")
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
  }, [danceId, isOpen, refreshKey]);


  const handleLineTap = (line: LyricSectionLine) => {
    if (!player) {
      onSeekTo(line.startSec, line.endSec);
      return;
    }
    // Unmute if muted — tapping a line means the user wants to hear it
    if (player.audio.muted) {
      player.setMuted(false);
    }
    if (line.lineIndex === playheadLineIndex && !player.audio.paused) {
      player.pause();
      return;
    }
    setPinnedLineIndex(line.lineIndex);
    if (pinnedLineTimerRef.current) clearTimeout(pinnedLineTimerRef.current);
    pinnedLineTimerRef.current = setTimeout(
      () => setPinnedLineIndex(null),
      300,
    );
    stopAtSecRef.current = line.endSec;
    player.seek(line.startSec);
    if (player.audio.paused) {
      player.audio.play().catch(() => {});
      player.startRendering();
    }
    userTookControlRef.current = true;
  };

  const handleCommentReact = async (commentId: string, emoji: EmojiKey) => {
    const key = `${commentId}-${emoji}`;
    if (sessionCommentReacted.has(key)) return;
    const sessionId = getSessionId();

    setSessionCommentReacted((prev) => new Set([...prev, key]));
    setCommentReactions((prev) => ({
      ...prev,
      [commentId]: {
        ...(prev[commentId] ?? {}),
        [emoji]: (prev[commentId]?.[emoji] ?? 0) + 1,
      },
    }));

    await supabase
      .from("lyric_dance_comment_reactions" as any)
      .insert({ comment_id: commentId, emoji, session_id: sessionId });
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || !danceId || hasSubmitted) return;
    const text = textInput.trim().slice(0, 200);
    const sessionId = getSessionId();

    const { data: inserted, error } = await supabase
      .from("lyric_dance_comments" as any)
      .insert({
        dance_id: danceId,
        text,
        session_id: sessionId,
        line_index: displayLineIndex,
        parent_comment_id: replyingTo?.id ?? null,
      })
      .select(
        "id, text, line_index, submitted_at, is_pinned, parent_comment_id",
      )
      .single();

    if (error) {
      console.error("Comment insert failed:", error);
      return;
    }

    if (!inserted) return;

    const newComment = inserted as unknown as CommentRow;
    if (replyingTo) {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === replyingTo.id
            ? { ...comment, replies: [...(comment.replies ?? []), newComment] }
            : comment,
        ),
      );
    } else {
      setComments((prev) => {
        const withReplies = { ...newComment, replies: [] };
        const pinned = prev.filter((c) => c.is_pinned);
        const unpinned = prev.filter((c) => !c.is_pinned);
        return [...pinned, withReplies, ...unpinned];
      });
    }

    if (displayLineIndex != null) {
      setSubmittedLineIndex(displayLineIndex);
      setTimeout(() => setSubmittedLineIndex(null), 600);
    }

    setHasSubmitted(true);
    setTextInput("");
    setReplyingTo(null);
    onReactionFired("fire");
    onResume?.();
    setTimeout(() => setHasSubmitted(false), 500);
  };

  const PHRASE_GAP_THRESHOLD = 1.2;

  const displayGroups: Array<{
    lines: LyricSectionLine[];
    isActive: boolean;
    totalFire: number;
    topReaction: { symbol: string; count: number } | null;
    sectionLabel: string | null;
    shouldShowSectionHeader: boolean;
  }> = [];

  let currentGroupLines: LyricSectionLine[] = [];

  const flushGroup = () => {
    if (!currentGroupLines.length) return;
    const firstLine = currentGroupLines[0];
    const groupIsActive = currentGroupLines.some(
      (line) => line.lineIndex === effectiveActiveIndex,
    );
    const groupFire = currentGroupLines.reduce(
      (sum, line) =>
        sum +
        Object.values(reactionData).reduce(
          (lineSum, data) => lineSum + (data.line[line.lineIndex] ?? 0),
          0,
        ),
      0,
    );
    const firstPosition = allLines.indexOf(firstLine);
    const currentSection = sectionMeta.sectionForLine.get(firstLine.lineIndex) ?? null;
    const prevLine = allLines[firstPosition - 1];
    const previousSection = prevLine
      ? (sectionMeta.sectionForLine.get(prevLine.lineIndex) ?? null)
      : null;
    const sectionLabel = sectionMeta.labelByLineIndex.get(firstLine.lineIndex) ?? null;
    const shouldShowSectionHeader =
      !!currentSection &&
      currentSection.sectionIndex !== previousSection?.sectionIndex &&
      !!sectionLabel;

    let topReaction: { symbol: string; count: number } | null = null;
    if (groupFire > 0) {
      let topKey = "";
      let topCount = 0;
      for (const [key, data] of Object.entries(reactionData)) {
        const lineCount = currentGroupLines.reduce(
          (sum, line) => sum + (data.line[line.lineIndex] ?? 0),
          0,
        );
        if (lineCount > topCount) {
          topCount = lineCount;
          topKey = key;
        }
      }
      const symbol = EMOJIS.find((emoji) => emoji.key === topKey)?.symbol ?? "🔥";
      if (topCount > 0) topReaction = { symbol, count: groupFire };
    }

    displayGroups.push({
      lines: [...currentGroupLines],
      isActive: groupIsActive,
      totalFire: groupFire,
      topReaction,
      sectionLabel,
      shouldShowSectionHeader,
    });
    currentGroupLines = [];
  };

  allLines.forEach((line) => {
    if (currentGroupLines.length === 0) {
      currentGroupLines.push(line);
      return;
    }
    const prevLine = currentGroupLines[currentGroupLines.length - 1];
    const gap = line.startSec - prevLine.endSec;
    if (gap > PHRASE_GAP_THRESHOLD) flushGroup();
    currentGroupLines.push(line);
  });
  flushGroup();

  const handlePanelClose = () => {
    if (replyingTo) {
      setReplyingTo(null);
      return;
    }
    const lastTime = player?.audio?.currentTime ?? null;
    onCloseWithPosition?.(lastTime);
    onClose();
  };

  return (
    <PanelShell isOpen={isOpen} variant={displayMode} maxHeight={maxHeight}>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollbarWidth: "none" }}
      >
        <div className={displayMode === "embedded" ? "pt-2 pb-4" : "pt-[max(1rem,env(safe-area-inset-top,12px))] pb-4"}>
          {displayGroups.map((group, groupIdx) => {
            const firstLine = group.lines[0];
            const isActive = group.isActive;
            const isCommentPulsing = group.lines.some(
              (l) => submittedLineIndex === l.lineIndex,
            );

            return (
              <div key={firstLine.lineIndex}>
                {group.shouldShowSectionHeader && (
                  <div className={groupIdx === 0 ? "mb-1" : "mt-6 mb-1"}>
                    <div className="flex items-center gap-2 px-3">
                      <span
                        className="font-mono uppercase tracking-[0.25em] text-white/18"
                        style={{ fontSize: 10 }}
                      >
                        {group.sectionLabel}
                      </span>
                      <div className="flex-1 h-px bg-white/[0.03]" />
                    </div>
                  </div>
                )}
                <div
                  ref={(node) => {
                    group.lines.forEach((l) => {
                      rowRefs.current[l.lineIndex] = node;
                    });
                  }}
                  data-line-index={firstLine.lineIndex}
                  onClick={() => handleLineTap(firstLine)}
                  className="relative flex items-start gap-2 px-3 cursor-pointer transition-colors overflow-hidden"
                  style={{
                    minHeight: 44,
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: isActive
                      ? "rgba(255,255,255,0.03)"
                      : "transparent",
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-full"
                      style={{ background: accent }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {group.lines.map((l) => (
                      <div
                        key={l.lineIndex}
                        style={{
                          fontSize: 15,
                          fontWeight: isActive ? 500 : 300,
                          color:
                            l.lineIndex === effectiveActiveIndex
                              ? "rgba(255,255,255,0.95)"
                              : isActive
                                ? "rgba(255,255,255,0.70)"
                                : "rgba(255,255,255,0.42)",
                          lineHeight: 1.55,
                          transition: "color 0.1s",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        {l.text}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    {isActive && (
                      <FireLineButton
                        lineIndex={firstLine.lineIndex}
                        fireCount={group.totalFire}
                        onFire={(holdMs) => onFireLine?.(firstLine.lineIndex, holdMs)}
                        accent={accent}
                      />
                    )}
                    {group.topReaction && (
                      <span
                        className="text-[8px] font-mono px-1 py-0.5 rounded"
                        style={{
                          color: "rgba(255,255,255,0.25)",
                          background: "rgba(255,255,255,0.025)",
                        }}
                      >
                        {group.topReaction.symbol}
                        {group.totalFire > 1 ? ` ${group.totalFire}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-[1px] mx-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: accent,
                      opacity: isCommentPulsing ? 0.6 : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom comment bar ── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '0.5px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
          padding: '8px 12px',
          paddingBottom: displayMode === 'fullscreen'
            ? 'max(8px, env(safe-area-inset-bottom, 8px))'
            : '8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(255,255,255,0.09)',
            borderRadius: 20,
            padding: '7px 14px',
            minWidth: 0,
          }}
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleTextSubmit();
              }
            }}
            onFocus={() => onPause?.()}
            placeholder={replyingTo ? 'Write a reply...' : 'say something...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: 'rgba(255,255,255,0.75)',
              fontFamily: 'inherit',
              caretColor: accent,
              minWidth: 0,
            }}
          />
          {textInput.trim().length > 0 && (
            <button
              onClick={handleTextSubmit}
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                color: accent,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.1em',
                flexShrink: 0,
              }}
            >
              post
            </button>
          )}
        </div>

        <button
          onClick={handlePanelClose}
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.3)",
            borderRadius: 8,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      {renderBottomBar && renderBottomBar(handlePanelClose)}
    </PanelShell>
  );
}

export { ReactionPanel };
export default ReactionPanel;
