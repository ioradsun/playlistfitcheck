import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { PartnerAvatar } from "@/components/signals/PartnerAvatar";
import { useDropAlerts } from "@/hooks/useDropAlerts";

export function DropAlertList() {
  const navigate = useNavigate();
  const { alerts, unreadCount, loading, markRead, markAllRead } = useDropAlerts();

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-3.5 pt-3.5 pb-2 border-b border-border/60 flex items-center justify-between">
        <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest m-0">
          drops
        </p>
        {alerts.length > 0 && unreadCount > 0 && (
          <button
            onClick={() => void markAllRead()}
            className="bg-transparent border-none cursor-pointer text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors p-0"
          >
            mark all read
          </button>
        )}
      </div>

      {loading && alerts.length === 0 && (
        <p className="p-5 text-[11px] text-muted-foreground/40 font-mono text-center">
          Loading…
        </p>
      )}

      {!loading && alerts.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-xs text-muted-foreground/40 leading-relaxed m-0">
            Lock in to artists from their profile.
            <br />
            Their drops land here.
          </p>
        </div>
      )}

      {alerts.map((alert) => {
        const hasUnread = !alert.is_read;
        const timeAgo = formatDistanceToNow(new Date(alert.created_at), {
          addSuffix: false,
        });

        return (
          <button
            key={alert.id}
            onClick={async () => {
              await markRead(alert.id);
              navigate(`/fmly?artist=${alert.artist_user_id}&post=${alert.feed_post_id}`);
            }}
            className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 border-none cursor-pointer transition-colors duration-150 border-b border-border/40 bg-transparent hover:bg-accent/10"
          >
            <div className="relative shrink-0">
              <PartnerAvatar
                name={alert.artist_name}
                avatarUrl={alert.artist_avatar}
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
                    hasUnread ? "text-foreground font-medium" : "text-foreground/70"
                  }`}
                >
                  @{alert.artist_name} dropped a new one
                </span>
                {alert.artist_fmly_number && (
                  <span className="text-[8px] font-mono text-muted-foreground/50 border border-border rounded-sm px-1 shrink-0">
                    {alert.artist_fmly_number}
                  </span>
                )}
              </div>
              <p
                className={`text-[10px] font-mono overflow-hidden text-ellipsis whitespace-nowrap m-0 ${
                  hasUnread ? "text-foreground/75" : "text-muted-foreground/50"
                }`}
              >
                {alert.song_title}
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
