import { formatDistanceToNow } from "date-fns";
import type { DmThreadSummary } from "@/hooks/useDmThreadList";

interface Props {
  threads: DmThreadSummary[];
  loading: boolean;
  activePartnerId: string | null;
  onSelect: (thread: DmThreadSummary) => void;
}

export function DmThreadList({
  threads,
  loading,
  activePartnerId,
  onSelect,
}: Props) {
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        background: "#0a0a0a",
      }}
    >
      <div
        style={{
          padding: "14px 14px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <p
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            color: "rgba(255,255,255,0.25)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            margin: 0,
          }}
        >
          connections
        </p>
      </div>

      {loading && (
        <p
          style={{
            padding: 20,
            fontSize: 11,
            color: "rgba(255,255,255,0.2)",
            fontFamily: "monospace",
            textAlign: "center",
          }}
        >
          Loading…
        </p>
      )}

      {!loading && threads.length === 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.2)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            When someone fires your music, they'll appear here.
          </p>
        </div>
      )}

      {threads.map((thread) => {
        const isActive = thread.partner_id === activePartnerId;
        const hasUnread = thread.unread_count > 0;

        return (
          <button
            key={thread.partner_id}
            onClick={() => onSelect(thread)}
            style={{
              width: "100%",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: isActive
                ? "rgba(255,255,255,0.05)"
                : "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {thread.partner_avatar ? (
                  <img
                    src={thread.partner_avatar}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                    {(thread.partner_name?.[0] ?? "?").toUpperCase()}
                  </span>
                )}
              </div>
              {hasUnread && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.7)",
                    border: "1.5px solid #0a0a0a",
                  }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: hasUnread
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.65)",
                    fontWeight: hasUnread ? 500 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {thread.partner_name}
                </span>
                {thread.fmly_number && (
                  <span
                    style={{
                      fontSize: 8,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.3)",
                      border: "0.5px solid rgba(255,255,255,0.12)",
                      borderRadius: 2,
                      padding: "0 3px",
                      flexShrink: 0,
                    }}
                  >
                    {thread.fmly_number}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  margin: 0,
                }}
              >
                {thread.last_message_preview
                  ? `${thread.last_message_is_mine ? "you: " : ""}${thread.last_message_preview}`
                  : formatDistanceToNow(
                      new Date(thread.last_activity_at),
                      { addSuffix: true },
                    )}
              </p>
            </div>

            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.18)",
                flexShrink: 0,
                alignSelf: "flex-start",
                paddingTop: 2,
              }}
            >
              {formatDistanceToNow(
                new Date(thread.last_activity_at),
                { addSuffix: false },
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
