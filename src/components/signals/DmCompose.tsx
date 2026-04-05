import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronUp, Minus, Send, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDmContext } from "@/hooks/useDmContext";
import { useDmThread } from "@/hooks/useDmThread";
import { DmActivityEvent } from "@/components/signals/DmActivityEvent";
import { PartnerAvatar } from "@/components/signals/PartnerAvatar";
import { supabase } from "@/integrations/supabase/client";

interface ProfileResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  trailblazer_number: number | null;
}

const iconBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.3)",
  display: "flex",
  alignItems: "center",
  padding: 3,
  borderRadius: 4,
};

export function DmCompose() {
  const { composePartnerId, closeCompose, openCompose } = useDmContext();
  const [minimized, setMinimized] = useState(false);
  const { events, loading, sending, sendMessage } = useDmThread(composePartnerId ?? "");
  const [input, setInput] = useState("");
  const [partnerProfile, setPartnerProfile] = useState<ProfileResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [editingPartner, setEditingPartner] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (composePartnerId) {
      setMinimized(false);
      setInput("");
      setEditingPartner(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [composePartnerId]);

  useEffect(() => {
    if (!composePartnerId) return;
    void supabase
      .from("profiles")
      .select("id, display_name, avatar_url, trailblazer_number")
      .eq("id", composePartnerId)
      .single()
      .then(({ data }) => {
        if (data) setPartnerProfile(data as ProfileResult);
      });
  }, [composePartnerId]);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length, minimized]);

  useEffect(() => {
    if (!editingPartner) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, trailblazer_number")
        .ilike("display_name", `%${q}%`)
        .limit(8);
      setSearchResults((data as ProfileResult[]) ?? []);
    }, 220);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, editingPartner]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text);
  };

  const partnerFirstName =
    (partnerProfile?.display_name ?? "them").split(" ")[0];
  const fmlyBadge = partnerProfile?.trailblazer_number != null
    ? String(partnerProfile.trailblazer_number).padStart(4, "0")
    : null;

  if (!composePartnerId) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: 320,
        background: "#111",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height 200ms ease",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: minimized
            ? "none"
            : "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer",
          flexShrink: 0,
        }}
        onClick={() => setMinimized((m) => !m)}
      >
        {editingPartner ? (
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingPartner(false);
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
            placeholder="Search by name…"
            autoFocus
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              color: "rgba(255,255,255,0.8)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <>
            <PartnerAvatar
              name={partnerProfile?.display_name ?? "?"}
              avatarUrl={partnerProfile?.avatar_url ?? null}
              size={26}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingPartner(true);
                setSearchQuery("");
                setTimeout(() => searchRef.current?.focus(), 50);
              }}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: 0,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.85)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {partnerProfile?.display_name ?? "…"}
              </span>
              {fmlyBadge && (
                <span
                  style={{
                    fontSize: 8,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.35)",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    borderRadius: 2,
                    padding: "0 3px",
                    flexShrink: 0,
                  }}
                >
                  {fmlyBadge}
                </span>
              )}
            </button>
          </>
        )}

        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMinimized((m) => !m);
            }}
            style={iconBtnStyle}
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? <ChevronUp size={13} /> : <Minus size={13} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeCompose();
            }}
            style={iconBtnStyle}
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {editingPartner && searchResults.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 46,
            left: 0,
            right: 0,
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "0 0 8px 8px",
            zIndex: 10000,
            maxHeight: 240,
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {searchResults.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                openCompose(p.id);
                setEditingPartner(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: "none",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <PartnerAvatar
                name={p.display_name ?? "?"}
                avatarUrl={p.avatar_url}
                size={24}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.75)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.display_name ?? "Unknown"}
              </span>
              {p.trailblazer_number != null && (
                <span
                  style={{
                    fontSize: 8,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }}
                >
                  {String(p.trailblazer_number).padStart(4, "0")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!minimized && (
        <>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 220,
              padding: "8px 0",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {loading && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.2)",
                  fontFamily: "monospace",
                  padding: 16,
                  margin: 0,
                }}
              >
                Loading history…
              </p>
            )}

            {!loading && events.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.2)",
                  padding: 20,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                No shared history yet.
                <br />
                <span style={{ fontFamily: "monospace", fontSize: 10 }}>
                  be the first to say something.
                </span>
              </p>
            )}

            {events.slice(-10).map((event) => {
              if (event.kind === "message") {
                const isMe = event.direction === "outgoing";
                return (
                  <div
                    key={event.id}
                    style={{
                      display: "flex",
                      justifyContent: isMe ? "flex-end" : "flex-start",
                      padding: "1px 10px",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "80%",
                        background: isMe
                          ? "rgba(255,255,255,0.10)"
                          : "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: isMe
                          ? "10px 10px 2px 10px"
                          : "10px 10px 10px 2px",
                        padding: "6px 10px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.8)",
                          lineHeight: 1.4,
                          margin: 0,
                          wordBreak: "break-word",
                        }}
                      >
                        {event.text}
                      </p>
                      <p
                        style={{
                          fontSize: 8,
                          color: "rgba(255,255,255,0.2)",
                          fontFamily: "monospace",
                          margin: "3px 0 0",
                          textAlign: isMe ? "right" : "left",
                        }}
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
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
              placeholder={`message ${partnerFirstName}…`}
              maxLength={2000}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
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
                padding: 3,
                transition: "color 150ms",
                flexShrink: 0,
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
