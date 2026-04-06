import { formatDistanceToNow } from "date-fns";
import type { ActivityEvent } from "@/hooks/useDmThread";

interface Props {
  event: ActivityEvent;
  partnerFirstName: string;
}

function buildLabel(event: ActivityEvent, actor: string): string | null {
  switch (event.kind) {
    case "fire": {
      const lineLabel = event.line_index != null
        ? `line ${event.line_index + 1}`
        : "a moment";
      const countLabel = (event.fire_count ?? 1) > 1
        ? ` × ${event.fire_count}`
        : "";
      return `${actor} fired ${lineLabel}${event.song_name ? ` in ${event.song_name}` : ""}${countLabel}`;
    }
    case "play": {
      const depth = event.max_progress_pct != null
        ? `${event.max_progress_pct}%`
        : null;
      const audio = event.was_muted === false ? "with audio" : "muted";
      const times = (event.play_count ?? 1) > 1 ? ` × ${event.play_count}` : "";
      return `${actor} played${event.song_name ? ` ${event.song_name}` : ""}${depth ? ` · ${depth}` : ""} · ${audio}${times}`;
    }
    case "lyric_comment":
      return `${actor} on line ${(event.line_index ?? 0) + 1}${event.song_name ? ` in ${event.song_name}` : ""}: "${event.text}"`;
    case "post_comment":
      return `${actor} commented${event.song_name ? ` on ${event.song_name}` : ""}: "${event.text}"`;
    case "save":
      return `${actor} saved${event.song_name ? ` ${event.song_name}` : ""}`;
    case "follow":
      return event.direction === "incoming"
        ? `${actor} followed you`
        : `${actor} followed them`;
    default:
      return null;
  }
}

export function DmActivityEvent({ event, partnerFirstName }: Props) {
  const isIncoming = event.direction === "incoming";
  const actor = isIncoming ? partnerFirstName : "You";
  const time = formatDistanceToNow(new Date(event.created_at), { addSuffix: true });
  const label = buildLabel(event, actor);

  if (!label) return null;

  return (
    <div className={`flex px-3.5 py-0.5 ${isIncoming ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] text-[11px] text-muted-foreground font-mono leading-relaxed px-2 py-1 rounded-md border ${
          isIncoming
            ? "bg-muted/30 border-border/60"
            : "bg-muted/50 border-border"
        }`}
      >
        <span>{label}</span>
        <span className="block text-[9px] text-muted-foreground/40 mt-0.5">
          {time}
        </span>
      </div>
    </div>
  );
}
