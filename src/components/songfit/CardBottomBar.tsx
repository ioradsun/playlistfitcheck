import React, { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

// Applies alpha to a hex (#rrggbb) or rgba(...) accent string.
// Falls back to the original string if format is unrecognised.
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex.split("").map((c) => c + c).join("")
        : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  // rgba(r,g,b,x) — replace the alpha channel
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return color;
}

/** Format a UTC ISO timestamp as a short relative label if < 48h, else null */
function formatRecency(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (h < 1) return "just now";
    if (h < 48) return `${h}h ago`;
    return null;
  } catch {
    return null;
  }
}

interface CardBottomBarProps {
  onOpenReactions: () => void;
  onClose: () => void;
  panelOpen?: boolean;
  variant?: "embedded" | "fullscreen";
  activeLineText?: string | null;
  activeLineFireCount?: number;
  hookPhrase?: string | null;
  accent?: string;
  hasFired?: boolean;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  isLive?: boolean;
  totalFireCount?: number;
  lastFiredAt?: string | null;
  // Legacy props accepted but unused — kept so existing call sites don't error
  votedSide?: "a" | "b" | null;
  score?: { total: number; replay_yes: number } | null;
  note?: string;
  onNoteChange?: (note: string) => void;
  onVoteYes?: () => void;
  onVoteNo?: () => void;
  onSubmit?: () => void;
  topReaction?: { symbol: string; count: number } | null;
  trackTitle?: string;
  yesLabel?: string;
  noLabel?: string;
  renderVotedContent?: () => React.ReactNode;
}

function FireButton({
  panelOpen,
  onClose,
  onTap,
  onHoldStart,
  onHoldEnd,
  py,
  hasFired,
  accent,
}: {
  panelOpen: boolean;
  onClose: () => void;
  onTap?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: (holdMs: number) => void;
  py: string;
  hasFired?: boolean;
  accent: string;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const startHold = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
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
    },
    [panelOpen, onHoldStart],
  );

  const endHold = useCallback(() => {
    if (!holdStartRef.current) return;
    const ms = Date.now() - holdStartRef.current;
    holdStartRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    if (ms < 150) onTap?.();
    else onHoldEnd?.(ms);
  }, [onTap, onHoldEnd]);

  const tier = holdProgress < 0.1 ? 0 : holdProgress < 0.33 ? 1 : holdProgress < 0.66 ? 2 : 3;
  const ringSize = 28 + tier * 6;
  const isActive = hasFired || isHolding;

  // Fired/holding: always warm orange — unmistakable confirmation regardless of palette.
  // Unfired outline: accent-tinted so the button still breathes with section color.
  const FIRE_ORANGE = "#FF6B2B";
  const strokeColor = isActive ? FIRE_ORANGE : withAlpha(accent, 0.35);
  const fillColor = isActive ? FIRE_ORANGE : "none";
  const glowFilter =
    isHolding && tier >= 2
      ? `drop-shadow(0 0 ${4 + tier * 3}px ${FIRE_ORANGE})`
      : "none";

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={(e) => {
        e.preventDefault();
        startHold(e);
      }}
      onTouchEnd={endHold}
      onClick={(e) => {
        e.stopPropagation();
        if (panelOpen) onClose();
      }}
      className={`relative flex items-center justify-center px-4 min-w-[52px] ${py} shrink-0`}
      style={{ touchAction: "none" }}
    >
      {/* Hold ring */}
      <div
        style={{
          position: "absolute",
          width: ringSize,
          height: ringSize,
          borderRadius: "50%",
          border: `1.5px solid ${isHolding ? withAlpha(accent, 0.4 + tier * 0.15) : "transparent"}`,
          transition: isHolding ? "none" : "all 0.3s",
          pointerEvents: "none",
        }}
      />

      {panelOpen ? (
        <X
          size={14}
          style={{
            color: withAlpha(accent, 0.45),
            transition: "color 0.6s ease",
          }}
        />
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          style={{
            // All color applied via style, never via SVG presentation attributes
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: 1.8,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            transform: `scale(${isHolding ? 1 + holdProgress * 0.5 : 1})`,
            transition: isHolding
              ? "none"
              : "transform 0.2s, fill 0.15s, stroke 0.15s",
            filter: glowFilter,
          }}
        >
          <path d="M12 2c0 0-5.5 5-5.5 10.5a5.5 5.5 0 0 0 11 0C17.5 9 15 6.5 15 6.5c0 0 .5 3-1.5 4.5C13.5 8 12 2 12 2z" />
        </svg>
      )}
    </button>
  );
}

export function CardBottomBar({
  onOpenReactions,
  onClose,
  panelOpen = false,
  variant = "embedded",
  activeLineText,
  activeLineFireCount = 0,
  hookPhrase,
  accent = "rgba(255,140,50,1)",
  hasFired = false,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  isLive = false,
  totalFireCount = 0,
  lastFiredAt,
}: CardBottomBarProps) {
  const py = variant === "embedded" ? "py-3" : "py-3.5";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch h-[48px]"
      : "flex items-stretch mx-1 mt-1 rounded-md overflow-hidden h-[52px]";

  const wrapperStyle: React.CSSProperties = {
    background: "#0a0a0a",
    // Top border shifts to accent when live — single pixel of color = "active now"
    borderTop: `1px solid ${isLive ? withAlpha(accent, 0.25) : "rgba(255,255,255,0.06)"}`,
    transition: "border-color 0.6s ease",
    ...(variant === "fullscreen"
      ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" }
      : {}),
  };

  const recency = formatRecency(lastFiredAt);

  // ── Left side state machine ────────────────────────────────────────
  // Priority 1: playing — show active lyric line + section fire count
  // Priority 2: pre-play with marks — show social proof
  // Priority 3: pre-play, isLive (Now Streaming active, no lyric) — "mark your moment"
  // Priority 4: zero marks — invite
  let leftContent: React.ReactNode;

  if (!panelOpen && activeLineText) {
    // Playing state (In Studio) — active lyric line + optional section count
    // hookPhrase gets full white + bold to signal the song's core moment
    const isHook = !!(hookPhrase && activeLineText === hookPhrase);
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Animated white dot — song is live */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            flexShrink: 0,
            animation: "cfBlink 1.4s ease-in-out infinite",
          }}
        />
        <span
          className="text-[10px] font-mono truncate"
          style={{
            color: isHook ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
            fontWeight: isHook ? 600 : 400,
            letterSpacing: "0.03em",
          }}
        >
          {activeLineText}
        </span>
        {activeLineFireCount > 0 && (
          <span
            className="text-[9px] font-mono shrink-0"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            🔥{activeLineFireCount}
          </span>
        )}
      </div>
    );
  } else if (!panelOpen && totalFireCount > 0) {
    // Pre-play with FMLY marks — social proof
    const label = recency
      ? `${totalFireCount} marks · ${recency}`
      : `${totalFireCount} marks`;
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Static dim white dot — tappable, not yet live */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        />
        <span
          className="text-[10px] font-mono truncate"
          style={{ letterSpacing: "0.05em" }}
        >
          {/* 🔥 renders in native emoji color — no override needed */}
          <span style={{ marginRight: 2 }}>🔥</span>
          <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>
            FMLY
          </span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>
            {" · "}{label}
          </span>
        </span>
      </div>
    );
  } else if (!panelOpen && isLive) {
    // Now Streaming active — no lyric context, prompt the fire mechanic
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Animated white dot — listening now */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            flexShrink: 0,
            animation: "cfBlink 1.4s ease-in-out infinite",
          }}
        />
        <span
          className="text-[10px] font-mono truncate"
          style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}
        >
          mark your moment
        </span>
      </div>
    );
  } else if (!panelOpen) {
    // Zero marks, not live — invitation
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
        <span
          className="text-[10px] font-mono truncate"
          style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}
        >
          be the first to mark a moment
        </span>
      </div>
    );
  }

  return (
    <div
      className={wrapperClass}
      style={wrapperStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes cfBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
      `}</style>

      {/* Left — tap to open reaction panel */}
      <div
        className={`flex-1 flex items-center px-3 ${py} min-w-0 cursor-pointer`}
        onClick={panelOpen ? undefined : onOpenReactions}
      >
        {leftContent}
      </div>

      {/* Divider */}
      <div
        style={{
          width: "0.5px",
          background: "rgba(255,255,255,0.08)",
          alignSelf: "stretch",
          margin: "8px 0",
        }}
      />

      <FireButton
        panelOpen={panelOpen}
        onClose={onClose}
        onTap={onFireTap}
        onHoldStart={onFireHoldStart}
        onHoldEnd={onFireHoldEnd}
        py={py}
        hasFired={hasFired}
        accent={accent}
      />
    </div>
  );
}
