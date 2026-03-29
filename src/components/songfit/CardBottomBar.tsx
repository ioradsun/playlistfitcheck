import React, { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

interface CardBottomBarProps {
  votedSide: "a" | "b" | null;
  score: { total: number; replay_yes: number } | null;
  note: string;
  onNoteChange: (note: string) => void;
  onVoteYes: () => void;
  onVoteNo: () => void;
  onSubmit: () => void;
  onOpenReactions: () => void;
  onClose: () => void;
  panelOpen?: boolean;
  topReaction?: { symbol: string; count: number } | null;
  trackTitle?: string;
  variant?: "embedded" | "fullscreen";
  yesLabel?: string;
  noLabel?: string;
  renderVotedContent?: () => React.ReactNode;
  activeLineText?: string | null;
  activeLineFireCount?: number;
  hookPhrase?: string | null;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
}

function FireButton({
  panelOpen,
  onClose,
  count,
  onTap,
  onHoldStart,
  onHoldEnd,
  py,
}: {
  panelOpen: boolean;
  onClose: () => void;
  count: number;
  onTap?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: (holdMs: number) => void;
  py: string;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (panelOpen) return;
    holdStartRef.current = Date.now();
    setIsHolding(true);
    setHoldProgress(0);
    onHoldStart?.();
    holdTimerRef.current = setInterval(() => {
      const ms = Date.now() - (holdStartRef.current ?? Date.now());
      setHoldProgress(Math.min(1, ms / 3000));
    }, 40);
  }, [panelOpen, onHoldStart]);

  const endHold = useCallback(() => {
    if (!holdStartRef.current) return;
    const ms = Date.now() - holdStartRef.current;
    holdStartRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    if (ms < 150) {
      onTap?.();
    } else {
      onHoldEnd?.(ms);
    }
  }, [onTap, onHoldEnd]);

  const tier = holdProgress < 0.1 ? 0
    : holdProgress < 0.33 ? 1
      : holdProgress < 0.66 ? 2 : 3;

  const ringSize = 28 + tier * 6;
  const ringColors = [
    "rgba(255,213,128,0)",
    "rgba(255,159,64,0.5)",
    "rgba(255,94,32,0.65)",
    "rgba(255,32,96,0.8)",
  ];
  const ringColor = isHolding ? ringColors[tier] : "transparent";
  const emojiScale = 1 + (isHolding ? holdProgress * 0.4 : 0);
  const emojiStr = tier >= 3 ? "🔥🔥🔥" : tier >= 2 ? "🔥🔥" : "🔥";

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={(e) => { e.preventDefault(); startHold(e); }}
      onTouchEnd={endHold}
      onClick={(e) => { e.stopPropagation(); if (panelOpen) onClose(); }}
      className={`relative flex items-center justify-center gap-1 px-4 min-w-[60px] ${py} transition-colors group shrink-0`}
      style={{ touchAction: "none" }}
    >
      <div
        style={{
          position: "absolute",
          width: ringSize,
          height: ringSize,
          borderRadius: "50%",
          border: `1.5px solid ${ringColor}`,
          transition: isHolding ? "none" : "all 0.3s",
          pointerEvents: "none",
        }}
      />
      {panelOpen ? (
        <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
      ) : (
        <>
          <span
            style={{
              fontSize: 16,
              display: "block",
              transform: `scale(${emojiScale})`,
              transition: isHolding ? "none" : "transform 0.2s",
            }}
          >
            {emojiStr}
          </span>
          {count > 0 && (
            <span className="text-[9px] font-mono text-white/20">
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function CardBottomBar({
  votedSide,
  score,
  note,
  onNoteChange,
  onVoteYes,
  onVoteNo,
  onSubmit,
  onOpenReactions,
  onClose,
  panelOpen = false,
  topReaction,
  trackTitle,
  variant = "embedded",
  yesLabel,
  noLabel,
  renderVotedContent,
  activeLineText,
  activeLineFireCount,
  hookPhrase,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
}: CardBottomBarProps) {
  void votedSide;
  void score;
  void onVoteYes;
  void onVoteNo;
  void topReaction;
  void trackTitle;
  void yesLabel;
  void noLabel;
  void renderVotedContent;
  void note;
  void onNoteChange;
  void onSubmit;

  const py = variant === "embedded" ? "py-3" : "py-3.5";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch h-[48px]"
      : "flex items-stretch mx-1 mt-1 rounded-md overflow-hidden h-[52px]";
  const wrapperStyle: React.CSSProperties = {
    background: "#0a0a0a",
    ...(variant === "fullscreen"
      ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" }
      : {}),
  };

  return (
    <div
      className={wrapperClass}
      style={wrapperStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`flex-1 flex items-center px-3 ${py} min-w-0 cursor-pointer`}
        onClick={panelOpen ? undefined : onOpenReactions}
      >
        {!panelOpen && activeLineText ? (
          <span
            className="text-[10px] font-mono truncate transition-all duration-300"
            style={{
              color: hookPhrase && activeLineText === hookPhrase
                ? "rgba(255,255,255,0.88)"
                : "rgba(255,255,255,0.32)",
              letterSpacing: "0.03em",
            }}
          >
            {activeLineText}
          </span>
        ) : !panelOpen ? (
          <span className="text-[10px] font-mono text-white/15 tracking-[0.2em]">
            · · ·
          </span>
        ) : null}
      </div>

      <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />

      <FireButton
        panelOpen={panelOpen}
        onClose={onClose}
        count={activeLineFireCount ?? 0}
        onTap={onFireTap}
        onHoldStart={onFireHoldStart}
        onHoldEnd={onFireHoldEnd}
        py={py}
      />
    </div>
  );
}
