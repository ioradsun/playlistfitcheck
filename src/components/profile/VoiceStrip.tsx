import type { VoiceLine } from "@/components/profile/types";

interface Props {
  lines: VoiceLine[];
  isOwner: boolean;
  onOpenPost: (postId: string) => void;
}

function since(ts: string) {
  const diff = Date.now() - +new Date(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function VoiceStrip({ lines, isOwner, onOpenPost }: Props) {
  if (!lines.length && !isOwner) return null;

  return (
    <section className="rounded-xl border border-white/10 p-4">
      <p className="text-xs font-mono tracking-[0.18em] text-muted-foreground mb-2">VOICE</p>
      {!lines.length && isOwner ? (
        <p className="text-sm text-muted-foreground">When fans fire your songs, their voice shows up here.</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((line) => (
            <button
              key={`${line.kind}-${line.id}`}
              onClick={() => onOpenPost(line.postId)}
              className="w-full text-left text-xs flex items-baseline gap-1.5 hover:bg-white/[0.02] rounded-md px-1 py-0.5 transition-colors"
            >
              <span aria-hidden>{line.kind === "fire" ? "🔥" : "💬"}</span>
              <span className="text-foreground/90 shrink-0">@{line.actorName}</span>
              {line.kind === "fire" ? (
                <>
                  <span className="text-muted-foreground shrink-0">fired</span>
                  <span className="truncate text-foreground/75">{line.songTitle}</span>
                </>
              ) : (
                <>
                  <span className="truncate italic text-foreground/75">
                    "{line.content?.slice(0, 60)}
                    {(line.content?.length ?? 0) > 60 ? "…" : ""}"
                  </span>
                  <span className="text-muted-foreground shrink-0">on {line.songTitle}</span>
                </>
              )}
              <span className="text-muted-foreground/70 ml-auto shrink-0 font-mono">{since(line.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
