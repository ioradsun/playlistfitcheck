import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDmThread } from "@/hooks/useDmThread";
import { DmActivityEvent } from "@/components/signals/DmActivityEvent";
import type { DmThreadSummary } from "@/hooks/useDmThreadList";

interface Props {
  partner: DmThreadSummary;
  myId: string;
}

export function DmThreadView({ partner, myId }: Props) {
  void myId;
  const { events, loading, sending, sendMessage, markRead, updatePresence } =
    useDmThread(partner.partner_id);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  useEffect(() => {
    void markRead();
    void updatePresence();
  }, [markRead, updatePresence]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0a0a0a",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            overflow: "hidden",
            background: "rgba(255,255,255,0.08)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {partner.partner_avatar ? (
            <img
              src={partner.partner_avatar}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {(partner.partner_name?.[0] ?? "?").toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {partner.partner_name}
            </span>
            {partner.fmly_number && (
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.4)",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  letterSpacing: "0.05em",
                }}
              >
                {partner.fmly_number}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 0",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {loading && (
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              fontFamily: "monospace",
              padding: 24,
              margin: 0,
            }}
          >
            Loading…
          </p>
        )}

        {!loading && events.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 40,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.25)",
                textAlign: "center",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Your shared music history will appear here.
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.15)",
                fontFamily: "monospace",
                textAlign: "center",
                margin: 0,
              }}
            >
              Be the first to say something.
            </p>
          </div>
        )}

        {events.map((event) => {
          if (event.kind === "message") {
            const isMe = event.direction === "outgoing";
            return (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  justifyContent: isMe ? "flex-end" : "flex-start",
                  padding: "2px 14px",
                }}
              >
                <div
                  style={{
                    maxWidth: "72%",
                    background: isMe
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: isMe
                      ? "12px 12px 2px 12px"
                      : "12px 12px 12px 2px",
                    padding: "8px 12px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.85)",
                      lineHeight: 1.45,
                      margin: 0,
                      wordBreak: "break-word",
                    }}
                  >
                    {event.text}
                  </p>
                  <p
                    style={{
                      fontSize: 9,
                      color: "rgba(255,255,255,0.2)",
                      fontFamily: "monospace",
                      margin: "4px 0 0",
                      textAlign: isMe ? "right" : "left",
                    }}
                  >
                    {formatDistanceToNow(
                      new Date(event.created_at),
                      { addSuffix: true },
                    )}
                  </p>
                </div>
              </div>
            );
          }
          return <DmActivityEvent key={event.id} event={event} />;
        })}

        <div ref={bottomRef} />
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="say something…"
          maxLength={2000}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            color: "rgba(255,255,255,0.8)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          style={{
            background: "none",
            border: "none",
            cursor: input.trim() && !sending ? "pointer" : "default",
            color: input.trim() && !sending
              ? "rgba(255,255,255,0.55)"
              : "rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            padding: 4,
            transition: "color 150ms",
            flexShrink: 0,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
