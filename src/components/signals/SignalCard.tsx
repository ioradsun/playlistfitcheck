import { formatDistanceToNow } from "date-fns";
import { Bookmark, Heart, MessageCircle, RotateCcw, UserPlus, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SignalGroup } from "@/hooks/useNotifications";

interface SignalCardProps {
  group: SignalGroup;
  skipCount?: number;
  onNavigate: (path: string) => void;
}

function actorSentence(names: string[], total: number, verb: string) {
  const name1 = names[0] || "Someone";
  const name2 = names[1];

  if (total <= 1) return `${name1} ${verb}`;
  if (total === 2) return `${name1} and ${name2 || "someone"} ${verb}`;
  return `${name1}, ${name2 || "someone"}, and ${total - 2} others ${verb}`;
}

function sourceLabel(source: string) {
  if (source === "shared_player") return { text: "via shared player", className: "text-[#c084fc]" };
  return { text: "via CrowdFit feed", className: "text-[#4ade80]" };
}

export function SignalCard({ group, skipCount = 0, onNavigate }: SignalCardProps) {
  const isUnread = !group.is_read;
  const source = sourceLabel(group.source);
  const latestSignal = group.signals[0];
  const actorName = latestSignal?.actor?.display_name || "Someone";
  const actorAvatar = latestSignal?.actor?.avatar_url || undefined;

  const lineReactionMap = new Map<number, { count: number; emoji: string; lyric: string }>();
  if (group.type === "lyric_reaction") {
    for (const signal of group.signals) {
      const lineIndex = Number(signal.metadata?.line_index ?? -1);
      const key = Number.isFinite(lineIndex) ? lineIndex : -1;
      const existing = lineReactionMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        lineReactionMap.set(key, {
          count: 1,
          emoji: signal.metadata?.emoji || "🔥",
          lyric: signal.metadata?.lyric_text || "",
        });
      }
    }
  }

  const lineItems = Array.from(lineReactionMap.entries()).slice(0, 3);
  const hiddenLines = Math.max(0, lineReactionMap.size - 3);

  return (
    <button
      onClick={() => {
        if (group.type === "follow" && latestSignal?.actor_user_id) {
          onNavigate(`/u/${latestSignal.actor_user_id}`);
          return;
        }
        if (group.post_id) {
          onNavigate(`/song/${group.post_id}`);
        }
      }}
      className={`w-full text-left px-5 py-[14px] rounded-lg border transition-colors ${
        isUnread
          ? "border-l-2 border-l-[#4ade80] border-[#222] bg-[rgba(74,222,128,0.03)]"
          : "border border-[#1f1f1f] bg-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        {group.type === "milestone" ? (
          <div className="w-10 h-10 rounded-md bg-[#18271f] flex items-center justify-center shrink-0">
            <Zap size={16} className="text-[#4ade80]" />
          </div>
        ) : (
          <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 bg-gradient-to-br from-[#1e1e1e] to-[#2a2a2a] flex items-center justify-center">
            {group.post?.album_art_url ? (
              <img src={group.post.album_art_url} alt={group.post?.track_title || "Track"} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-[#cfcfcf]">♫</span>
            )}
            {group.post?.lyric_dance_id ? (
              <span className="absolute -bottom-1 -right-1 text-[8px] px-1 py-0.5 rounded bg-[#c084fc] text-black font-semibold">IN STUDIO</span>
            ) : group.post?.spotify_track_id ? (
              <span className="absolute -bottom-1 -right-1 text-[8px] px-1 py-0.5 rounded bg-[#4ade80] text-black font-semibold">STREAMING</span>
            ) : null}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[#e2e2e2] truncate">{group.post?.track_title || "Artist Signal"}</p>

          {group.type === "run_it_back" && (
            <>
              <p className="text-xs text-[#999]">{actorSentence(group.actor_names, group.total_count, "ran it back")}</p>
              <p className="text-xs mt-1"><span className="text-[#4ade80]">{group.total_count} run it backs</span>{skipCount > 0 && <span className="text-[#888]"> · {skipCount} skips</span>}</p>
            </>
          )}

          {group.type === "like" && (
            <p className="text-xs text-[#999]">{actorSentence(group.actor_names, group.total_count, "liked your post")}</p>
          )}

          {group.type === "save" && (
            <p className="text-xs text-[#999]">{actorSentence(group.actor_names, group.total_count, "saved this track")}</p>
          )}

          {group.type === "follow" && (
            <p className="text-xs text-[#999]">{group.total_count} new followers</p>
          )}

          {group.type === "comment" && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={actorAvatar} alt={actorName} />
                  <AvatarFallback className="text-[8px]">{actorName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-[#e2e2e2] font-medium">{actorName}</span>
              </div>
              <p className="text-xs text-[#999] italic truncate">“{group.metadata?.comment_text || "Commented on your track"}”</p>
            </div>
          )}

          {group.type === "lyric_comment" && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={actorAvatar} alt={actorName} />
                  <AvatarFallback className="text-[8px]">{actorName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <p className="text-xs text-[#e2e2e2]"><span className="font-medium">{actorName}</span> on line {(Number(group.metadata?.line_index ?? -1) + 1)}:</p>
              </div>
              <p className="text-xs text-[#999] italic truncate">“{group.metadata?.comment_text || "Left a lyric note"}”</p>
              <p className="text-[11px] text-[#777] italic truncate">{group.metadata?.lyric_text || ""}</p>
            </div>
          )}

          {group.type === "lyric_reaction" && (
            <div className="mt-1 p-2 rounded-md bg-[#c084fc]/10 border border-[#c084fc]/20 space-y-1">
              {lineItems.map(([index, item]) => (
                <div key={`${index}-${item.emoji}`}>
                  <p className="text-xs text-[#d7b3ff]">{item.emoji} Line {index + 1} · {item.count} reactions</p>
                  <p className="text-[11px] text-[#b9b9b9] italic truncate">{item.lyric}</p>
                </div>
              ))}
              {hiddenLines > 0 && <p className="text-[11px] text-[#999]">+{hiddenLines} more</p>}
            </div>
          )}

          {group.type === "milestone" && (
            <p className="text-xs text-[#4ade80] font-semibold">⚡ Milestone reached: {group.metadata?.threshold || ""} {group.metadata?.milestone_type || "signals"}</p>
          )}

          <div className="flex items-center gap-1.5 mt-1">
            {group.type === "run_it_back" && <RotateCcw size={11} className="text-[#4ade80]" />}
            {group.type === "comment" && <MessageCircle size={11} className="text-[#4ade80]" />}
            {group.type === "like" && <Heart size={11} className="text-[#4ade80]" />}
            {group.type === "save" && <Bookmark size={11} className="text-[#4ade80]" />}
            {group.type === "follow" && <UserPlus size={11} className="text-[#4ade80]" />}
            <span className={`text-[11px] ${source.className}`}>{source.text}</span>
            <span className="text-[11px] text-[#555]">• {formatDistanceToNow(new Date(group.latest_at), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
