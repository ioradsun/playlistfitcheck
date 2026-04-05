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
    <div
      style={{
        display: "flex",
        justifyContent: isIncoming ? "flex-start" : "flex-end",
        padding: "2px 14px",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          fontFamily: "monospace",
          lineHeight: 1.5,
          padding: "4px 8px",
          borderRadius: 6,
          background: isIncoming
            ? "rgba(255,255,255,0.03)"
            : "rgba(255,255,255,0.06)",
          border: isIncoming
            ? "1px solid rgba(255,255,255,0.05)"
            : "1px solid rgba(255,255,255,0.09)",
        }}
      >
        <span>{label}</span>
        <span
          style={{
            display: "block",
            fontSize: 9,
            color: "rgba(255,255,255,0.18)",
            marginTop: 2,
          }}
        >
          {time}
        </span>
      </div>
    </div>
  );
}
