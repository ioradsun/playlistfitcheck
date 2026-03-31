import React, { useCallback, useEffect, useRef, useState } from "react";
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
  currentMoment?: {
    index: number;
    total: number;
    label: string | null;
  } | null;
  activeLineText?: string | null;
  activeLineFireCount?: number;
  hookPhrase?: string | null;
  accent?: string;
  hasFired?: boolean;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onComment?: (text: string) => void;
  onVoiceNote?: (audioBlob: Blob) => void;
  onPauseForInput?: () => void;
  onResumeAfterInput?: () => void;
  isLive?: boolean;
  totalFireCount?: number;
  lastFiredAt?: string | null;
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
  iconSize = 18,
  minWidth = "min-w-[52px]",
  baseRingSize = 28,
}: {
  panelOpen: boolean;
  onClose: () => void;
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
      onClick={(e) => {
        e.stopPropagation();
        if (panelOpen) onClose();
      }}
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
      )}
    </button>
  );
}

type BarState = "lyrics" | "fired" | "typing" | "recording";

export function CardBottomBar({
  onOpenReactions,
  onClose,
  panelOpen = false,
  variant = "embedded",
  currentMoment = null,
  activeLineText,
  activeLineFireCount = 0,
  hookPhrase,
  accent = "rgba(255,140,50,1)",
  hasFired = false,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onComment,
  onVoiceNote,
  onPauseForInput,
  onResumeAfterInput,
  isLive = false,
  totalFireCount = 0,
  lastFiredAt,
}: CardBottomBarProps) {
  const [barState, setBarState] = useState<BarState>("lyrics");
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordingSec, setRecordingSec] = useState(0);
  const prevMomentIndexRef = useRef<number | null>(null);

  const py = variant === "embedded" ? "py-3" : "py-4";
  const textSize = variant === "fullscreen" ? "text-[13px]" : "text-[10px]";
  const subTextSize = variant === "fullscreen" ? "text-[11px]" : "text-[9px]";
  const dotSize = variant === "fullscreen" ? 6 : 5;
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

  const stopRecording = useCallback((save: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setBarState("lyrics");
      setRecordingSec(0);
      onResumeAfterInput?.();
      return;
    }
    mediaRecorderRef.current = null;

    if (save) {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          onVoiceNote?.(blob);
        }
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
    } else {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
    }
    recorder.stop();
    setBarState("lyrics");
    setRecordingSec(0);
    onResumeAfterInput?.();
  }, [onResumeAfterInput, onVoiceNote]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setBarState("recording");
      setRecordingSec(0);
      onPauseForInput?.();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSec((s) => {
          if (s >= 9) {
            stopRecording(true);
            return 10;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      // Mic permission denied: stay in fired/typing.
    }
  }, [onPauseForInput, stopRecording]);

  useEffect(() => {
    const momentIdx = currentMoment?.index ?? null;
    if (prevMomentIndexRef.current !== null && momentIdx !== prevMomentIndexRef.current) {
      if (barState === "recording") {
        stopRecording(false);
      } else if (barState === "typing") {
        onResumeAfterInput?.();
      }
      setBarState("lyrics");
      setCommentText("");
      setRecordingSec(0);
    }
    prevMomentIndexRef.current = momentIdx;
  }, [barState, currentMoment?.index, onResumeAfterInput, stopRecording]);

  useEffect(() => {
    if (barState === "fired" || barState === "typing") {
      inputRef.current?.focus();
    }
  }, [barState]);

  useEffect(() => () => {
    if (mediaRecorderRef.current) {
      stopRecording(false);
    }
  }, [stopRecording]);

  const handleFireComplete = useCallback(() => {
    setBarState("fired");
    setCommentText("");
  }, []);

  const handleInputFocus = useCallback(() => {
    setBarState("typing");
    onPauseForInput?.();
  }, [onPauseForInput]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = commentText.trim();
      if (text) {
        onComment?.(text);
      }
      setCommentText("");
      setBarState("lyrics");
      onResumeAfterInput?.();
    }
  }, [commentText, onComment, onResumeAfterInput]);

  const recency = formatRecency(lastFiredAt);
  const momentLabel = currentMoment ? `Moment ${currentMoment.index + 1}` : null;

  let leftContent: React.ReactNode;

  if (barState === "recording") {
    leftContent = (
      <div className="flex items-center gap-2 min-w-0">
        {momentLabel && (
          <span className={`${subTextSize} font-mono shrink-0`} style={{ color: accent ?? "rgba(255,140,50,0.8)" }}>
            🔥 {momentLabel}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff4444", animation: "cfBlink 0.8s ease-in-out infinite" }} />
          <span className={`${textSize} font-mono`} style={{ color: "rgba(255,255,255,0.6)" }}>
            {recordingSec}s
          </span>
          <div className="flex items-center gap-px" style={{ height: 16 }}>
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: 2,
                  height: 4 + Math.random() * 12,
                  background: "rgba(255,255,255,0.3)",
                  borderRadius: 1,
                  transition: "height 0.1s",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  } else if (barState === "fired" || barState === "typing") {
    leftContent = (
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {momentLabel && (
          <span className={`${subTextSize} font-mono shrink-0`} style={{ color: accent ?? "rgba(255,140,50,0.8)" }}>
            🔥 {momentLabel}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          placeholder="What hit?"
          className="flex-1 min-w-0 bg-transparent outline-none font-mono"
          style={{
            fontSize: variant === "fullscreen" ? 12 : 11,
            color: "rgba(255,255,255,0.8)",
            caretColor: accent ?? "#ff8c32",
            letterSpacing: "0.02em",
          }}
          autoComplete="off"
        />
      </div>
    );
  } else if (!panelOpen && activeLineText) {
    const isHook = !!(hookPhrase && activeLineText === hookPhrase);
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          style={{
            height: dotSize,
            width: dotSize,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            flexShrink: 0,
            animation: "cfBlink 1.4s ease-in-out infinite",
          }}
        />
        {momentLabel && (
          <span className={`${subTextSize} font-mono shrink-0`} style={{ color: "rgba(255,255,255,0.30)", letterSpacing: "0.05em" }}>
            {momentLabel}
          </span>
        )}
        <span
          className={`${textSize} font-mono truncate`}
          style={{
            color: isHook ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
            fontWeight: isHook ? 600 : 400,
            letterSpacing: "0.03em",
          }}
        >
          {activeLineText}
        </span>
        {activeLineFireCount > 0 && (
          <span className={`${subTextSize} font-mono shrink-0`} style={{ color: "rgba(255,255,255,0.35)" }}>
            🔥{activeLineFireCount}
          </span>
        )}
      </div>
    );
  } else if (!panelOpen && totalFireCount > 0) {
    const label = recency ? `${totalFireCount} marks · ${recency}` : `${totalFireCount} marks`;
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
        <span className={`${textSize} font-mono truncate`} style={{ letterSpacing: "0.05em" }}>
          <span style={{ marginRight: 2 }}>🔥</span>
          <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>FMLY</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>{" · "}{label}</span>
        </span>
      </div>
    );
  } else if (!panelOpen && isLive) {
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            flexShrink: 0,
            animation: "cfBlink 1.4s ease-in-out infinite",
          }}
        />
        <span className={`${textSize} font-mono truncate`} style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}>
          mark your moment
        </span>
      </div>
    );
  } else if (!panelOpen) {
    leftContent = (
      <div className="flex items-center gap-1.5 min-w-0">
        <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
        <span className={`${textSize} font-mono truncate`} style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
          be the first to mark a moment
        </span>
      </div>
    );
  }

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      <style>{`
        @keyframes cfBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
      `}</style>

      <div
        className={`flex-1 flex items-center px-3 ${py} min-w-0 cursor-pointer`}
        onClick={barState === "lyrics" && !panelOpen ? onOpenReactions : undefined}
      >
        {leftContent}
      </div>

      {barState === "lyrics" ? (
        <>
          <div style={{ width: "0.5px", background: "rgba(255,255,255,0.08)", alignSelf: "stretch", margin: "8px 0" }} />
          <FireButton
            panelOpen={panelOpen}
            onClose={onClose}
            onTap={() => { onFireTap?.(); handleFireComplete(); }}
            onHoldStart={onFireHoldStart}
            onHoldEnd={(ms) => { onFireHoldEnd?.(ms); handleFireComplete(); }}
            py={py}
            hasFired={hasFired}
            accent={accent}
            iconSize={fireIconSize}
            minWidth={fireMinWidth}
            baseRingSize={variant === "fullscreen" ? 34 : 28}
          />
        </>
      ) : (
        <>
          <div style={{ width: "0.5px", background: "rgba(255,255,255,0.08)", alignSelf: "stretch", margin: "8px 0" }} />
          <button
            className={`flex items-center justify-center ${py} ${fireMinWidth}`}
            style={{ touchAction: "manipulation" }}
            onTouchStart={(e) => {
              e.preventDefault();
              if (barState === "fired" || barState === "typing") startRecording();
            }}
            onTouchEnd={() => {
              if (barState === "recording") stopRecording(true);
            }}
            onMouseDown={() => {
              if (barState === "fired" || barState === "typing") startRecording();
            }}
            onMouseUp={() => {
              if (barState === "recording") stopRecording(true);
            }}
            onMouseLeave={() => {
              if (barState === "recording") stopRecording(true);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              width={fireIconSize}
              height={fireIconSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke={barState === "recording" ? "#ff4444" : "rgba(255,255,255,0.45)"}
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
        </>
      )}
    </div>
  );
}
