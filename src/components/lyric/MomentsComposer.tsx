import { useEffect, useRef, useState } from "react";

const BAR_HEIGHT = 44;

interface MomentsComposerProps {
  activeMomentIdx: number | null;
  activeMomentLabel: string | null;
  replyTargetId: string | null;
  replyTargetAuthor: string | null;
  onSubmit: (text: string) => void;
  onClearReply: () => void;
  totalDuration: number;
  currentTimeSec: number;
  onSeekTo: (sec: number) => void;
}

export function MomentsComposer({
  activeMomentIdx,
  activeMomentLabel,
  replyTargetId,
  replyTargetAuthor,
  onSubmit,
  onClearReply,
  totalDuration,
  currentTimeSec,
  onSeekTo,
}: MomentsComposerProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = activeMomentIdx !== null;

  useEffect(() => {
    setText("");
  }, [activeMomentIdx, replyTargetId]);

  useEffect(() => {
    if (composing) inputRef.current?.focus();
  }, [composing]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  };

  const progressPct = totalDuration > 0
    ? Math.max(0, Math.min(100, (currentTimeSec / totalDuration) * 100))
    : 0;

  return (
    <div
      style={{
        width: "100%",
        background: "#0a0a0f",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        position: "relative",
      }}
    >
      {composing && replyTargetId && replyTargetAuthor && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: -22,
            fontSize: 10,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.5)",
            background: "rgba(20, 20, 24, 0.9)",
            padding: "3px 8px",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>↳ @{replyTargetAuthor}</span>
          <button
            type="button"
            onClick={onClearReply}
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.4)",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ width: "100%", height: BAR_HEIGHT, position: "relative", display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
        {composing ? (
          <>
            {activeMomentLabel && !replyTargetId && (
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap", flexShrink: 0 }}>
                → {activeMomentLabel}
              </span>
            )}
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={replyTargetId ? "reply..." : "add a thought..."}
              maxLength={140}
              style={{
                flex: 1,
                minWidth: 0,
                height: 30,
                border: "none",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 13,
                fontFamily: "monospace",
                padding: "0 10px",
                borderRadius: 999,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={text.trim().length === 0}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "none",
                background: text.trim().length > 0 ? "rgba(74, 222, 128, 0.8)" : "rgba(255,255,255,0.08)",
                color: text.trim().length > 0 ? "#0a0a0f" : "rgba(255,255,255,0.3)",
                fontSize: 14,
                cursor: text.trim().length > 0 ? "pointer" : "default",
                transition: "background 150ms ease",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="send"
            >
              ↑
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                cursor: totalDuration > 0 ? "pointer" : "default",
                touchAction: "none",
              }}
              onPointerDown={(e) => {
                if (totalDuration <= 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onSeekTo(pct * totalDuration);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onSeekTo(pct * totalDuration);
              }}
            />
            <div style={{
              position: "absolute", left: 0, right: 0,
              top: BAR_HEIGHT / 2, height: 1, background: "rgba(255,255,255,0.08)",
            }} />
            {totalDuration > 0 && (
              <div style={{
                position: "absolute",
                left: `${progressPct}%`,
                top: BAR_HEIGHT / 2 - 3.5,
                width: 7, height: 7, borderRadius: "50%",
                background: "rgba(255,255,255,0.95)",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
