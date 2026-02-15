import { Heart, MessageCircle, UserPlus, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { Notification } from "@/hooks/useNotifications";

const ICON_MAP = {
  like: { icon: Heart, className: "text-red-500 fill-red-500" },
  comment: { icon: MessageCircle, className: "text-blue-400" },
  follow: { icon: UserPlus, className: "text-primary" },
};

function NotificationRow({ n, onClose }: { n: Notification; onClose: () => void }) {
  const navigate = useNavigate();
  const { icon: Icon, className } = ICON_MAP[n.type];
  const actorName = n.actor?.display_name || "Someone";

  let text = "";
  if (n.type === "like") text = `liked your post${n.post ? ` "${n.post.track_title}"` : ""}`;
  else if (n.type === "comment") text = `commented on${n.post ? ` "${n.post.track_title}"` : " your post"}`;
  else if (n.type === "follow") text = "started following you";

  const handleClick = () => {
    onClose();
    navigate(`/u/${n.actor_user_id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
    >
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 mt-0.5">
        {n.actor?.avatar_url ? (
          <img src={n.actor.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <User size={14} className="text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{actorName}</span>{" "}
          <span className="text-muted-foreground">{text}</span>
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon size={12} className={className} />
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      {!n.is_read && (
        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
      )}
    </button>
  );
}

interface Props {
  notifications: Notification[];
  loading: boolean;
  onMarkAllRead: () => void;
  onClose: () => void;
}

export function NotificationsPanel({ notifications, loading, onMarkAllRead, onClose }: Props) {
  const hasUnread = notifications.some(n => !n.is_read);

  return (
    <div className="w-80 max-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Notifications</h3>
        {hasUnread && (
          <button onClick={onMarkAllRead} className="text-xs text-primary hover:underline">
            Mark all read
          </button>
        )}
      </div>
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-8">Loading...</p>
        ) : notifications.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No notifications yet</p>
        ) : (
          notifications.map(n => <NotificationRow key={n.id} n={n} onClose={onClose} />)
        )}
      </div>
    </div>
  );
}
