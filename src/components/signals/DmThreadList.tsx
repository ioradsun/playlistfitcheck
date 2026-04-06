import { formatDistanceToNow } from "date-fns";
import { SquarePen } from "lucide-react";
import { PartnerAvatar } from "@/components/signals/PartnerAvatar";
import { useDmContext } from "@/hooks/useDmContext";
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
  const { openCompose } = useDmContext();

  return (
    <div className="h-full overflow-y-auto border-r border-border bg-background">
      <div className="px-3.5 pt-3.5 pb-2 border-b border-border/60 flex items-center justify-between">
        <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest m-0">
          connections
        </p>
        <button
          onClick={() => openCompose("new")}
          className="bg-transparent border-none cursor-pointer text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors p-0 flex items-center"
          aria-label="New message"
        >
          <SquarePen size={14} />
        </button>
      </div>

      {loading && threads.length === 0 && (
        <p className="p-5 text-[11px] text-muted-foreground/40 font-mono text-center">
          Loading…
        </p>
      )}

      {!loading && threads.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-xs text-muted-foreground/40 leading-relaxed m-0">
            When someone fires your music, they'll appear here.
          </p>
        </div>
      )}

      {threads.map((thread) => {
        const isActive = thread.partner_id === activePartnerId;
        const hasUnread = thread.unread_count > 0;
        const timeAgo = formatDistanceToNow(
          new Date(thread.last_activity_at),
          { addSuffix: false },
        );

        return (
          <button
            key={thread.partner_id}
            onClick={() => onSelect(thread)}
            className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 border-none cursor-pointer transition-colors duration-150 border-b border-border/40 ${
              isActive ? "bg-accent/30" : "bg-transparent hover:bg-accent/10"
            }`}
          >
            <div className="relative shrink-0">
              <PartnerAvatar
                name={thread.partner_name}
                avatarUrl={thread.partner_avatar}
                size={36}
              />
              {hasUnread && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary border-[1.5px] border-background" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`text-xs overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0 ${
                    hasUnread
                      ? "text-foreground font-medium"
                      : "text-foreground/70"
                  }`}
                >
                  {thread.partner_name}
                </span>
                {thread.fmly_number && (
                  <span className="text-[8px] font-mono text-muted-foreground/50 border border-border rounded-sm px-1 shrink-0">
                    {thread.fmly_number}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/50 font-mono overflow-hidden text-ellipsis whitespace-nowrap m-0">
                {thread.last_message_preview
                  ? `${thread.last_message_is_mine ? "you: " : ""}${thread.last_message_preview}`
                  : `${timeAgo} ago`}
              </p>
            </div>

            <span className="text-[9px] font-mono text-muted-foreground/35 shrink-0 self-start pt-0.5">
              {timeAgo}
            </span>
          </button>
        );
      })}
    </div>
  );
}
