import { useEffect, useRef, useState } from "react";
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

      if (composePartnerId === "new") {
        setEditingPartner(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    }
  }, [composePartnerId]);

  useEffect(() => {
    if (composePartnerId === "new") {
      setPartnerProfile(null);
      return;
    }
    if (!composePartnerId || composePartnerId === "new") return;
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
      className="fixed bottom-4 right-4 w-80 bg-card border border-border rounded-xl shadow-lg z-[9999] flex flex-col overflow-hidden transition-[height] duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer shrink-0 ${
          minimized ? "" : "border-b border-border"
        }`}
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
            className="flex-1 bg-muted/50 border border-border rounded-md px-2 py-1 text-xs text-foreground/80 outline-none font-[inherit] placeholder:text-muted-foreground/40"
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
              className="flex-1 bg-transparent border-none cursor-pointer text-left flex items-center gap-1.5 p-0 min-w-0"
            >
              <span className="text-xs text-foreground/85 font-medium overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
                {partnerProfile?.display_name ?? "…"}
              </span>
              {fmlyBadge && (
                <span className="text-[8px] font-mono text-muted-foreground/50 border border-border rounded-sm px-1 shrink-0">
                  {fmlyBadge}
                </span>
              )}
            </button>
          </>
        )}

        <div className="flex gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMinimized((m) => !m);
            }}
            className="bg-transparent border-none cursor-pointer text-muted-foreground/50 flex items-center p-0.5 rounded"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? <ChevronUp size={13} /> : <Minus size={13} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeCompose();
            }}
            className="bg-transparent border-none cursor-pointer text-muted-foreground/50 flex items-center p-0.5 rounded"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Search dropdown */}
      {editingPartner && searchResults.length > 0 && (
        <div
          className="absolute top-[46px] left-0 right-0 bg-popover border border-border rounded-b-lg z-[10000] max-h-60 overflow-y-auto"
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
              className="w-full flex items-center gap-2 px-3 py-2 bg-transparent border-none border-b border-border/40 cursor-pointer text-left hover:bg-accent/20"
            >
              <PartnerAvatar
                name={p.display_name ?? "?"}
                avatarUrl={p.avatar_url}
                size={24}
              />
              <span className="text-xs text-foreground/75 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {p.display_name ?? "Unknown"}
              </span>
              {p.trailblazer_number != null && (
                <span className="text-[8px] font-mono text-muted-foreground/50 shrink-0">
                  {String(p.trailblazer_number).padStart(4, "0")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {!minimized && composePartnerId !== "new" && (
        <>
          <div className="flex-1 overflow-y-auto max-h-[220px] py-2 flex flex-col gap-0.5">
            {loading && (
              <p className="text-center text-[10px] text-muted-foreground/40 font-mono p-4 m-0">
                Loading history…
              </p>
            )}

            {!loading && events.length === 0 && (
              <p className="text-center text-[11px] text-muted-foreground/40 p-5 m-0 leading-relaxed">
                No shared history yet.
                <br />
                <span className="font-mono text-[10px]">
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
                    className={`flex px-2.5 py-px ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] border border-border px-2.5 py-1.5 ${
                        isMe
                          ? "bg-primary/10 rounded-[10px] rounded-br-sm"
                          : "bg-muted/50 rounded-[10px] rounded-bl-sm"
                      }`}
                    >
                      <p className="text-xs text-foreground/80 leading-snug m-0 break-words">
                        {event.text}
                      </p>
                      <p
                        className={`text-[8px] text-muted-foreground/40 font-mono mt-0.5 mb-0 ${
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

          {/* Compose input */}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-border">
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
              className="flex-1 bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground/80 outline-none font-[inherit] placeholder:text-muted-foreground/40"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className={`bg-transparent border-none flex items-center p-0.5 transition-colors shrink-0 ${
                input.trim() && !sending
                  ? "cursor-pointer text-primary"
                  : "cursor-default text-muted-foreground/30"
              }`}
            >
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
