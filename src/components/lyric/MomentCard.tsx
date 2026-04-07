import { useState, type ReactNode } from "react";
import { Flame } from "lucide-react";
import type { Moment } from "@/lib/buildMoments";

interface MomentCardProps {
  moment: Moment;
  fireTotal: number;
  isConsensus: boolean;
  isLive: boolean;
  latestComment: string | null;
  onPlay: () => void;
  onFireDown: () => void;
  onFireUp: () => void;
  onExpandComments: () => void;
  onSubmitComment: (text: string) => void;
  firedByUser: boolean;
  pressing: boolean;
  fireScale: number;
  children: ReactNode;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getHeatColors(fireTotal: number, isConsensus: boolean) {
  const iconColor = fireTotal >= 10
    ? "rgba(255,160,40,0.9)"
    : fireTotal >= 1
      ? "rgba(255,140,40,0.5)"
      : "rgba(255,255,255,0.15)";

  const borderColor = isConsensus
    ? "rgba(74, 222, 128, 0.25)"
    : fireTotal >= 10
      ? "rgba(255,140,40,0.30)"
      : fireTotal >= 1
        ? "rgba(255,140,40,0.12)"
        : "rgba(255,255,255,0.05)";

  return { iconColor, borderColor };
}

export function MomentCard({
  moment,
  fireTotal,
  isConsensus,
  isLive,
  latestComment,
  onPlay,
  onFireDown,
  onFireUp,
  onExpandComments,
  onSubmitComment,
  firedByUser,
  pressing,
  fireScale,
  children,
}: MomentCardProps) {
  const [text, setText] = useState("");
  const { iconColor, borderColor } = getHeatColors(fireTotal, isConsensus);

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        background: "rgba(255,255,255,0.02)",
        padding: 12,
        transition: "border-color 200ms ease",
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        style={{
          width: "100%",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>
          {fmtTime(moment.startSec)} <span style={{ opacity: 0.6 }}>→</span> {fmtTime(moment.endSec)}
        </span>
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.5)",
            opacity: isLive ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        />
      </button>

      <div style={{ marginTop: 8, marginBottom: 8 }}>{children}</div>

      <button
        type="button"
        onPointerDown={onFireDown}
        onPointerUp={onFireUp}
        onPointerLeave={onFireUp}
        style={{
          minHeight: 44,
          width: 44,
          borderRadius: 10,
          border: `1px solid ${pressing ? "rgba(255,140,40,0.35)" : "rgba(255,255,255,0.08)"}`,
          background: pressing
            ? "radial-gradient(circle, rgba(255,140,40,0.18) 0%, transparent 70%)"
            : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "border-color 200ms ease, background 200ms ease",
        }}
      >
        <Flame
          size={16}
          style={{
            color: iconColor,
            transform: `scale(${fireScale})`,
            transition: pressing ? "none" : "transform 200ms ease",
          }}
        />
      </button>

      {latestComment && (
        <button
          type="button"
          onClick={onExpandComments}
          style={{
            marginTop: 10,
            width: "100%",
            border: "none",
            background: "none",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.35)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {latestComment}
        </button>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateRows: firedByUser ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease",
          marginTop: firedByUser ? 10 : 0,
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginBottom: 4, fontFamily: "monospace" }}>
            what hit here?
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="say it"
              style={{
                flex: 1,
                minHeight: 32,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "rgba(255,255,255,0.75)",
                fontSize: 11,
                fontFamily: "monospace",
                padding: "0 10px",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const trimmed = text.trim();
                if (!trimmed) return;
                onSubmitComment(trimmed);
                setText("");
              }}
              style={{
                minHeight: 32,
                minWidth: 32,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
