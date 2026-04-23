import { type ReactNode } from "react";

interface MomentCardProps {
  moment: { startSec: number; endSec: number; index: number };
  fireTotal: number;
  isConsensus: boolean;
  isLive: boolean;
  commentCount: number;
  onTap: () => void;
  children: ReactNode;
}

export function MomentCard({
  fireTotal,
  isConsensus,
  isLive,
  commentCount,
  onTap,
  children,
}: MomentCardProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        cursor: "pointer",
        background: isLive ? "rgba(255,255,255,0.03)" : "transparent",
        borderTop: "none",
        borderLeft: "none",
        borderRight: "none",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 0,
        gap: 10,
        transition: "background 200ms ease",
      }}
    >
      <span style={{
        width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
        background: isConsensus ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.5)",
        opacity: isLive || isConsensus ? 1 : 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)",
      }}>
        {fireTotal > 0 && <span>🔥 {fireTotal}</span>}
        {commentCount > 0 && <span>💬 {commentCount}</span>}
      </div>
    </button>
  );
}
