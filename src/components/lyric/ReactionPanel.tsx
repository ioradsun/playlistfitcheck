import {
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import type { LyricSectionLine } from "@/hooks/useLyricSections";
import { buildMoments, type Moment } from "@/lib/buildMoments";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import type { CanonicalAudioSection } from "@/types/audioSections";
import { PanelShell } from "@/components/shared/panel/PanelShell";
import {
  EMOJIS,
  type EmojiKey,
} from "@/components/shared/panel/panelConstants";

export type { CanonicalAudioSection } from "@/types/audioSections";

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
  displayMode: "fullscreen" | "embedded";
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
  beatGrid?: { bpm: number; beats: number[] } | null;
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
  /** Called when panel closes with the last audio position so the caller can resume there. */
  onCloseWithPosition?: (timeSec: number | null) => void;
  maxHeight?: string;
  bottomOffset?: number;
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
  renderBottomBar?: (onClose: () => void) => React.ReactNode;
  /** Signals a fire from the bottom bar — triggers pulse on the matching line */
  lastBarFireEvent?: { lineIndex: number; ts: number } | null;
  /** Line index of the most recent bar comment — auto-expands that window's comments */
  lastBarCommentLineIndex?: number | null;
  onCommentSubmitted?: { text: string; lineIndex: number | null; ts: number } | null;
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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function FireLineButton({
  lineIndex,
  fireCount,
  onFire,
  accent,
}: {
  lineIndex: number;
  fireCount: number;
  onFire: (holdMs: number) => void;
  accent: string;
}) {
  const holdStartRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const startHold = () => {
    holdStartRef.current = performance.now();
    firedRef.current = false;
  };

  const endHold = () => {
    if (firedRef.current) return;
    const start = holdStartRef.current;
    holdStartRef.current = null;
    firedRef.current = true;
    const holdMs = start ? Math.max(0, performance.now() - start) : 0;
    onFire(holdMs);
  };

  return (
    <button
      onMouseDown={(e) => {
        e.stopPropagation();
        startHold();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        endHold();
      }}
      onMouseLeave={() => {
        holdStartRef.current = null;
        firedRef.current = false;
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        startHold();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        endHold();
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        fontSize: 9,
        fontFamily: "monospace",
        color: "rgba(255,255,255,0.5)",
        border: `0.5px solid ${accent}40`,
        borderRadius: 999,
        background: "rgba(255,255,255,0.02)",
        padding: "2px 8px",
        cursor: "pointer",
        lineHeight: 1.3,
      }}
      aria-label={`Fire line ${lineIndex}`}
      type="button"
    >
      🔥 {fireCount}
    </button>
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
  phrases,
  words,
  beatGrid,
  currentTimeSec,
  palette,
  onSeekTo,
  player,
  durationSec,
  onReactionFired: _onReactionFired,
  reactionData,
  onReactionDataChange: _onReactionDataChange,
  onPause: _onPause,
  onResume: _onResume,
  votedSide: _votedSide,
  score: _score,
  onVoteYes: _onVoteYes,
  onVoteNo: _onVoteNo,
  hideInput: _hideInput = false,
  refreshKey = 0,
  onCloseWithPosition,
  maxHeight,
  bottomOffset,
  empowermentPromise: _empowermentPromise,
  fmlyHookEnabled: _fmlyHookEnabled,
  onFireLine,
  onLineVisible,
  renderBottomBar,
  lastBarFireEvent,
  lastBarCommentLineIndex,
  onCommentSubmitted,
}: ReactionPanelProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [collapsedWindows, setCollapsedWindows] = useState<Set<number>>(new Set());
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
  const lastActiveLineRef = useRef<number | null>(null);
  // null = free play (initial open, replay). Set to line.endSec on user tap.
  const stopAtSecRef = useRef<number | null>(null);


  const accent = palette[1] ?? "rgba(255,255,255,0.7)";
  const playheadLineIndex = activeLine?.lineIndex ?? null;
  // Keep last known line while audio plays through silence
  if (playheadLineIndex !== null) lastActiveLineRef.current = playheadLineIndex;
  const heldLineIndex =
    player && !player.audio.paused ? lastActiveLineRef.current : null;
  const effectiveActiveIndex = playheadLineIndex ?? heldLineIndex;

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
    setCollapsedWindows(new Set());
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

  // Fire pulse from bar
  useEffect(() => {
    if (!lastBarFireEvent) return;
    setSubmittedLineIndex(lastBarFireEvent.lineIndex);
    const timer = setTimeout(() => setSubmittedLineIndex(null), 800);
    return () => clearTimeout(timer);
  }, [lastBarFireEvent?.ts]);

  useEffect(() => {
    if (!onCommentSubmitted) return;
    const optimistic: CommentRow = {
      id: `optimistic-${onCommentSubmitted.ts}`,
      text: onCommentSubmitted.text,
      line_index: onCommentSubmitted.lineIndex,
      submitted_at: new Date().toISOString(),
      is_pinned: false,
      parent_comment_id: null,
    };
    setComments((prev) => [...prev, optimistic]);
  }, [onCommentSubmitted?.ts]);

  // Scroll fired line into view when panel is open.
  useEffect(() => {
    if (!lastBarFireEvent || !isOpen) return;
    const row = rowRefs.current[lastBarFireEvent.lineIndex];
    const container = scrollContainerRef.current;
    if (!row || !container) return;

    const rowTop = row.offsetTop;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;

    if (rowTop < containerTop || rowTop > containerBottom - 40) {
      container.scrollTo({
        top: Math.max(0, rowTop - container.clientHeight * 0.3),
        behavior: "smooth",
      });
    }
  }, [lastBarFireEvent?.ts, isOpen]);

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

  // ── Build moments from AI phrases (never breaks mid-phrase) ──
  const phraseInputs = (phrases ?? []).map((p: any) => {
    // AI phrases use milliseconds for start/end, convert to seconds
    const isMs = p.start > 500;
    const startSec = isMs ? p.start / 1000 : p.start;
    const endSec = isMs ? p.end / 1000 : p.end;
    return { start: startSec, end: endSec, text: p.text ?? "" };
  });

  const moments: Moment[] = buildMoments(
    phraseInputs,
    audioSections,
    allLines,
    durationSec,
  );

  interface ClipWindow {
    startSec: number;
    endSec: number;
    label: string | null;
    lines: typeof allLines;
    isActive: boolean;
    totalFire: number;
    shouldShowSectionHeader: boolean;
    momentIndex: number;
  }

  const clipWindows: ClipWindow[] = moments.map((m, i) => {
    const isActive = currentTimeSec >= m.startSec && currentTimeSec < m.endSec;
    const totalFire = m.lines.reduce(
      (sum, l) =>
        sum +
        Object.values(reactionData).reduce((s, d) => s + (d.line[l.lineIndex] ?? 0), 0),
      0,
    );
    const prevLabel = i > 0 ? moments[i - 1].label : null;
    const shouldShowSectionHeader = !!m.label && m.label !== prevLabel;
    return {
      startSec: m.startSec,
      endSec: m.endSec,
      label: m.label,
      lines: m.lines,
      isActive,
      totalFire,
      shouldShowSectionHeader,
      momentIndex: m.index,
    };
  });

  const commentsByWindow = clipWindows.map((win) => {
    const lineIndices = new Set(win.lines.map((l) => l.lineIndex));
    return comments.filter(
      (c) => c.line_index != null && lineIndices.has(c.line_index),
    );
  });

  useEffect(() => {
    if (lastBarCommentLineIndex == null || !isOpen) return;
    const wi = clipWindows.findIndex((win) =>
      win.lines.some((l) => l.lineIndex === lastBarCommentLineIndex),
    );
    if (wi >= 0) {
      setCollapsedWindows((prev) => {
        const next = new Set(prev);
        next.delete(wi);
        return next;
      });
      setSubmittedLineIndex(lastBarCommentLineIndex);
      const timer = setTimeout(() => setSubmittedLineIndex(null), 800);
      return () => clearTimeout(timer);
    }
  }, [refreshKey, lastBarCommentLineIndex, isOpen, clipWindows]);

  const previewingWindowRef = useRef<number | null>(null);

  const handlePanelClose = () => {
    player?.setRegion(undefined, undefined);
    previewingWindowRef.current = null;
    const lastTime = player?.audio?.currentTime ?? null;
    onCloseWithPosition?.(lastTime);
    onClose();
  };

  return (
    <PanelShell isOpen={isOpen} variant={displayMode} maxHeight={maxHeight} bottomOffset={bottomOffset}>
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollbarWidth: "none" }}
      >
        <div className={displayMode === "embedded" ? "pt-2 pb-4" : "pt-[max(1rem,env(safe-area-inset-top,12px))] pb-4"}>

          {clipWindows.map((win, wi) => {
            const isCommentPulsing = win.lines.some(
              (l) => submittedLineIndex === l.lineIndex,
            );
            return (
              <div
                key={wi}
                style={{
                  backgroundColor: isCommentPulsing ? `${accent}10` : "transparent",
                  transition: "background-color 0.6s ease-out",
                  borderRadius: 8,
                }}
              >
                {win.shouldShowSectionHeader && (
                  <div className={wi === 0 ? "mb-1" : "mt-6 mb-1"}>
                    <div className="flex items-center gap-2 px-3">
                      <span
                        className="font-mono uppercase tracking-[0.25em] text-white/18"
                        style={{ fontSize: 10 }}
                      >
                        {win.label}
                      </span>
                      <span
                        className="font-mono text-white/10"
                        style={{ fontSize: 9, letterSpacing: "0.05em" }}
                      >
                        Moment {win.momentIndex + 1}
                      </span>
                      <div className="flex-1 h-px bg-white/[0.03]" />
                    </div>
                  </div>
                )}

                <div
                  ref={(node) => {
                    win.lines.forEach((l) => {
                      rowRefs.current[l.lineIndex] = node;
                    });
                  }}
                  data-line-index={win.lines[0]?.lineIndex}
                  className="relative px-3 cursor-pointer"
                  style={{
                    paddingTop: 10,
                    paddingBottom: 10,
                    background: win.isActive
                      ? "rgba(255,255,255,0.03)"
                      : "transparent",
                  }}
                  onClick={() => {
                    if (previewingWindowRef.current === wi) {
                      if (player?.audio.paused || player?.audio.muted) {
                        player?.setMuted(false);
                        player?.play();
                      } else {
                        player?.pause();
                      }
                      return;
                    }
                    if (player?.audio.muted) player.setMuted(false);
                    player?.setRegion(win.startSec, win.endSec);
                    player?.seek(win.startSec);
                    player?.play();
                    previewingWindowRef.current = wi;
                  }}
                >
                  {win.isActive && (
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-full"
                      style={{ background: accent }}
                    />
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: "monospace",
                        color: "rgba(255,255,255,0.22)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Moment {win.momentIndex + 1}/{moments.length}
                      {" · "}
                      {formatTime(win.startSec)} – {formatTime(win.endSec)}
                      <span style={{ opacity: 0.5 }}>
                        {" "}({Math.round(win.endSec - win.startSec)}s)
                      </span>
                    </span>
                    <div className="flex-1" />
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FireLineButton
                        lineIndex={win.lines[0]?.lineIndex ?? 0}
                        fireCount={win.totalFire}
                        onFire={(holdMs) => {
                          const targetLine =
                            win.lines.find(
                              (l) => l.lineIndex === effectiveActiveIndex,
                            ) ?? win.lines[0];
                          if (targetLine) onFireLine?.(targetLine.lineIndex, holdMs);
                        }}
                        accent={accent}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {win.lines.map((l) => (
                      <div
                        key={l.lineIndex}
                        style={{
                          fontSize: win.isActive ? 15 : 14,
                          fontWeight: win.isActive ? 500 : 300,
                          color:
                            l.lineIndex === effectiveActiveIndex
                              ? "rgba(255,255,255,0.95)"
                              : win.isActive
                                ? "rgba(255,255,255,0.70)"
                                : "rgba(255,255,255,0.55)",
                          lineHeight: 1.5,
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          transition: "color 0.1s",
                        }}
                      >
                        {l.text}
                      </div>
                    ))}
                  </div>

                  {commentsByWindow[wi].length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollapsedWindows((prev) => {
                          const next = new Set(prev);
                          if (next.has(wi)) next.delete(wi);
                          else next.add(wi);
                          return next;
                        });
                      }}
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: collapsedWindows.has(wi) ? "rgba(255,255,255,0.40)" : accent,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        letterSpacing: "0.08em",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: 0,
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 11 11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      >
                        <path d="M1 1.5h9M1 5h6M1 8.5h4" />
                      </svg>
                      {commentsByWindow[wi].length} {commentsByWindow[wi].length === 1 ? "thought" : "thoughts"}
                    </button>
                  )}

                  {!collapsedWindows.has(wi) && commentsByWindow[wi].length > 0 && (
                    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {commentsByWindow[wi].map((comment) => (
                          <div key={comment.id} style={{ display: "flex", gap: 8 }}>
                            <div
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: accent,
                                opacity: 0.4,
                                flexShrink: 0,
                                marginTop: 8,
                              }}
                            />
                            <p
                              style={{
                                fontSize: 13,
                                color: "rgba(255,255,255,0.60)",
                                lineHeight: 1.4,
                                flex: 1,
                              }}
                            >
                              {comment.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-[1px] mx-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: accent,
                      opacity: isCommentPulsing ? 0.6 : 0,
                      transition: "opacity 0.6s ease-out",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {renderBottomBar?.(onClose)}
    </PanelShell>
  );
}

export { ReactionPanel };
export default ReactionPanel;
