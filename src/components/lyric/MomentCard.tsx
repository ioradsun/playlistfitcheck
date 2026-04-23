import { type ReactNode } from "react";

interface MomentCardProps {
  moment: { startSec: number; endSec: number; index: number };
  fireTotal: number;
  isConsensus: boolean;
  isLive: boolean;
  isSelected: boolean;
  commentCount: number;
  latestComment: string | null;
  topReactions: Array<{ emoji: string; count: number }>;
  fireAvatars: Array<{ url: string | null; name: string | null }>;
  fireAnonCount: number;
  onTap: () => void;
  children: ReactNode;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getBorderColor(fireTotal: number, isConsensus: boolean, isSelected: boolean): string {
  if (isSelected) return "rgba(74, 222, 128, 0.65)";
  if (isConsensus) return "rgba(74, 222, 128, 0.25)";
  if (fireTotal >= 10) return "rgba(255, 140, 40, 0.30)";
  if (fireTotal >= 1) return "rgba(255, 140, 40, 0.12)";
  return "rgba(255, 255, 255, 0.05)";
}

export function MomentCard({
  moment,
  fireTotal,
  isConsensus,
  isLive,
  isSelected,
  commentCount,
  latestComment,
  topReactions,
  fireAvatars,
  fireAnonCount,
  onTap,
  children,
}: MomentCardProps) {
  const borderColor = getBorderColor(fireTotal, isConsensus, isSelected);

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        background: "rgba(255, 255, 255, 0.02)",
        padding: 12,
        cursor: "pointer",
        transition: "border-color 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 14 }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.25)" }}>
          {fmtTime(moment.startSec)} <span style={{ opacity: 0.6 }}>→</span> {fmtTime(moment.endSec)}
        </span>
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.5)",
            opacity: isLive ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        />
      </div>

      <div style={{ marginTop: 8, marginBottom: 8 }}>{children}</div>

      {(fireAvatars.length > 0 || fireAnonCount > 0) && (
        <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
          {fireAvatars.map((avatar, i) => (
            <div
              key={`${avatar.url ?? "anon"}-${i}`}
              title={avatar.name ?? undefined}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "1.5px solid #0a0a0a",
                marginLeft: i > 0 ? -6 : 0,
                overflow: "hidden",
                background: "rgba(255, 255, 255, 0.08)",
                flexShrink: 0,
              }}
            >
              {avatar.url ? (
                <img src={avatar.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>
          ))}
          {fireAnonCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255, 255, 255, 0.25)",
                marginLeft: fireAvatars.length > 0 ? 4 : 0,
              }}
            >
              +{fireAnonCount}
            </span>
          )}
        </div>
      )}

      {(commentCount > 0 || topReactions.length > 0) && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {commentCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.35)" }}>
                💬 {commentCount}
              </span>
              {latestComment && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "rgba(255, 255, 255, 0.4)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: 1,
                  }}
                >
                  {latestComment}
                </span>
              )}
            </div>
          )}
          {topReactions.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {topReactions.map((r) => (
                <span
                  key={r.emoji}
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "rgba(255, 255, 255, 0.4)",
                    padding: "1px 5px",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: 999,
                  }}
                >
                  {r.emoji} {r.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
