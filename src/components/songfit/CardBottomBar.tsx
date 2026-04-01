import React, { useCallback, useEffect, useRef, useState } from "react";

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

const speechSupported =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

interface CardBottomBarProps {
  onOpenReactions: () => void;
  onClose: () => void;
  panelOpen?: boolean;
  variant?: "embedded" | "fullscreen";
  currentMoment?: {
    index: number;
    total: number;
    label: string | null;
    text?: string;
    startSec?: number;
    endSec?: number;
  } | null;
  accent?: string;
  hasFired?: boolean;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onComment?: (text: string) => void;
  onPauseForInput?: () => void;
  onResumeAfterInput?: () => void;
  isLive?: boolean;
  totalFireCount?: number;
  lastFiredAt?: string | null;
  /** True when the song has ended and closing screen is visible */
  songEnded?: boolean;
}

function FireButton({
  onTap,
  onHoldStart,
  onHoldEnd,
  py,
  hasFired,
  accent,
  iconSize = 18,
  minWidth = "min-w-[52px]",
  baseRingSize = 28,
}: {
  onTap?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: (holdMs: number) => void;
  py: string;
  hasFired?: boolean;
  accent: string;
  iconSize?: number;
  minWidth?: string;
  baseRingSize?: number;
}) {
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const startHold = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      holdStartRef.current = Date.now();
      setIsHolding(true);
      setHoldProgress(0);
      onHoldStart?.();
      holdTimerRef.current = setInterval(() => {
        const ms = Date.now() - (holdStartRef.current ?? Date.now());
        setHoldProgress(Math.min(1, ms / 3000));
      }, 40);
    },
    [onHoldStart],
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
  const ringSize = baseRingSize + tier * 6;
  const isActive = hasFired || isHolding;

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
      onClick={(e) => e.stopPropagation()}
      className={`relative flex items-center justify-center px-4 ${minWidth} ${py} shrink-0`}
      style={{ touchAction: "manipulation" }}
    >
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
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        style={{
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
    </button>
  );
}

export function CardBottomBar({
  onOpenReactions,
  onClose,
  panelOpen = false,
  variant = "embedded",
  currentMoment = null,
  accent = "rgba(255,140,50,1)",
  hasFired = false,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onComment,
  onPauseForInput,
  onResumeAfterInput,
  isLive = false,
  totalFireCount = 0,
  lastFiredAt: _lastFiredAt,
  songEnded = false,
}: CardBottomBarProps) {
  const [commentText, setCommentText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const py = variant === "embedded" ? "py-3" : "py-4";
  const subTextSize = variant === "fullscreen" ? "text-[11px]" : "text-[10px]";
  const fireIconSize = variant === "fullscreen" ? 22 : 18;
  const fireMinWidth = variant === "fullscreen" ? "min-w-[60px]" : "min-w-[52px]";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch h-[48px]"
      : "flex items-stretch mx-1 mt-1 rounded-lg overflow-hidden h-[64px]";

  const wrapperStyle: React.CSSProperties = {
    background: "#0a0a0a",
    borderTop: `1px solid ${isLive ? withAlpha(accent, 0.25) : "rgba(255,255,255,0.06)"}`,
    transition: "border-color 0.6s ease",
    ...(variant === "fullscreen"
      ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" }
      : {}),
  };

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setCommentText((prev) => {
        const base = prev.replace(/\u200B.*$/, "").trimEnd();
        const live = (final || interim).trimStart();
        return base ? `${base} ${live}` : live;
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    onPauseForInput?.();
  }, [onPauseForInput]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    onResumeAfterInput?.();
  }, [onResumeAfterInput]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
  }, []);
  const momentLabel = currentMoment
    ? `Moment ${currentMoment.index + 1}/${currentMoment.total}`
    : null;

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          panelOpen ? onClose() : onOpenReactions();
        }}
        className={`flex items-center gap-1.5 px-3 ${py} shrink-0`}
        style={{ background: "none", border: "none", cursor: "pointer", minWidth: 72 }}
        aria-label={panelOpen ? "Close panel" : "Open reactions"}
      >
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 6"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: panelOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            flexShrink: 0,
          }}
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
        <span
          className={`${subTextSize} font-mono`}
          style={{
            color: momentLabel
              ? "rgba(255,255,255,0.55)"
              : "rgba(255,255,255,0.2)",
            letterSpacing: "0.08em",
            transition: "color 0.4s ease, opacity 0.4s ease",
            opacity: momentLabel ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          {momentLabel ?? (songEnded ? `${totalFireCount} marked` : "—")}
        </span>
      </button>

      <div style={{ width: "0.5px", background: "rgba(255,255,255,0.06)", alignSelf: "stretch", margin: "8px 0" }} />
      <div className={`flex items-center gap-2 flex-1 min-w-0 px-3 ${py}`}>
        {speechSupported && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              isListening ? stopListening() : startListening();
            }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
            aria-label={isListening ? "Stop" : "Voice input"}
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isListening ? "#ff4444" : "rgba(255,255,255,0.25)"}
              style={{ transition: "stroke 0.2s" }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="1" width="6" height="12" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onFocus={() => onPauseForInput?.()}
          onBlur={() => {
            if (!commentText.trim()) onResumeAfterInput?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const text = commentText.trim();
              if (text) onComment?.(text);
              if (isListening) stopListening();
              setCommentText("");
              inputRef.current?.blur();
              onResumeAfterInput?.();
            }
            if (e.key === "Escape") {
              if (isListening) stopListening();
              setCommentText("");
              inputRef.current?.blur();
              onResumeAfterInput?.();
            }
          }}
          placeholder="What hit?"
          className="flex-1 min-w-0 bg-transparent outline-none font-mono"
          style={{
            fontSize: variant === "fullscreen" ? 12 : 11,
            color: "rgba(255,255,255,0.75)",
            caretColor: accent ?? "#ff8c32",
            letterSpacing: "0.02em",
          }}
          autoComplete="off"
        />
      </div>

      <div style={{ width: "0.5px", background: "rgba(255,255,255,0.06)", alignSelf: "stretch", margin: "8px 0" }} />
      <FireButton
        onTap={onFireTap}
        onHoldStart={onFireHoldStart}
        onHoldEnd={onFireHoldEnd}
        py={py}
        hasFired={hasFired}
        accent={accent}
        iconSize={fireIconSize}
        minWidth={fireMinWidth}
        baseRingSize={variant === "fullscreen" ? 34 : 28}
      />
    </div>
  );
}
