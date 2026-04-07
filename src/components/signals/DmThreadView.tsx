import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDmThread } from "@/hooks/useDmThread";
import { DmActivityEvent } from "@/components/signals/DmActivityEvent";
import { PartnerAvatar } from "@/components/signals/PartnerAvatar";
import type { DmThreadSummary } from "@/hooks/useDmThreadList";

interface Props {
  partner: DmThreadSummary;
}

export function DmThreadView({ partner }: Props) {
  const { events, loading, sending, sendMessage, markRead, updatePresence } =
    useDmThread(partner.partner_id);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<"all" | "messages">("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const partnerFirstName = partner.partner_name.split(" ")[0];
  const filteredEvents =
    filter === "all"
      ? events
      : events.filter((e) => e.kind === "message");

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
    <div className="flex flex-col h-full bg-background">
      {/* Mobile header */}
      <div className="md:hidden flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
        <PartnerAvatar
          name={partner.partner_name}
          avatarUrl={partner.partner_avatar}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-foreground/85 font-medium overflow-hidden text-ellipsis whitespace-nowrap block">
              {partner.partner_name}
            </span>
            {partner.fmly_number && (
              <span className="text-[9px] font-mono text-muted-foreground/60 border border-border rounded px-1 tracking-wide">
                {partner.fmly_number}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-1">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            padding: "8px 0 4px",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              color:
                filter === "all"
                  ? "rgba(255,255,255,0.6)"
                  : "rgba(255,255,255,0.2)",
              padding: "2px 0",
              transition: "color 150ms",
            }}
          >
            all
          </button>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.1)" }}>
            ·
          </span>
          <button
            type="button"
            onClick={() => setFilter("messages")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              color:
                filter === "messages"
                  ? "rgba(255,255,255,0.6)"
                  : "rgba(255,255,255,0.2)",
              padding: "2px 0",
              transition: "color 150ms",
            }}
          >
            messages
          </button>
        </div>
        {loading && (
          <p className="text-center text-[11px] text-muted-foreground/40 font-mono p-6 m-0">
            Loading…
          </p>
        )}

        {!loading && filteredEvents.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-10">
            <p className="text-[13px] text-muted-foreground/50 text-center leading-relaxed m-0">
              Your shared music history will appear here.
            </p>
            <p className="text-[11px] text-muted-foreground/30 font-mono text-center m-0">
              Be the first to say something.
            </p>
          </div>
        )}

        {filteredEvents.map((event) => {
          if (event.kind === "message") {
            const isMe = event.direction === "outgoing";
            return (
              <div
                key={event.id}
                className={`flex px-3.5 py-0.5 ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[72%] border border-border px-3 py-2 ${
                    isMe
                      ? "bg-primary/10 rounded-xl rounded-br-sm"
                      : "bg-muted/50 rounded-xl rounded-bl-sm"
                  }`}
                >
                  <p className="text-[13px] text-foreground/85 leading-[1.45] m-0 break-words">
                    {event.text}
                  </p>
                  <p
                    className={`text-[9px] text-muted-foreground/40 font-mono mt-1 mb-0 ${
                      isMe ? "text-right" : "text-left"
                    }`}
                  >
                    {formatDistanceToNow(new Date(event.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );
          }
          return (
            <DmActivityEvent
              key={event.id}
              event={event}
              partnerFirstName={partnerFirstName}
            />
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="px-3.5 py-2.5 border-t border-border flex items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <input
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
          className="flex-1 bg-muted/50 border border-border rounded-[10px] px-3 py-2 text-[13px] text-foreground/80 outline-none font-[inherit] placeholder:text-muted-foreground/40"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          className={`bg-transparent border-none flex items-center p-1 transition-colors shrink-0 ${
            input.trim() && !sending
              ? "cursor-pointer text-primary"
              : "cursor-default text-muted-foreground/30"
          }`}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
