import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Notification {
  id: string;
  type: "like" | "comment" | "follow";
  post_id: string | null;
  comment_id: string | null;
  actor_user_id: string;
  is_read: boolean;
  created_at: string;
  actor: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  post?: {
    track_title: string;
    album_art_url: string | null;
  } | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, type, post_id, comment_id, actor_user_id, is_read, created_at, actor:actor_user_id(display_name, avatar_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data) {
      // Fetch post info for like/comment notifications
      const postIds = [...new Set((data as any[]).filter(n => n.post_id).map(n => n.post_id))];
      let postMap: Record<string, { track_title: string; album_art_url: string | null }> = {};
      if (postIds.length > 0) {
        const { data: posts } = await supabase
          .from("songfit_posts")
          .select("id, track_title, album_art_url")
          .in("id", postIds);
        if (posts) {
          postMap = Object.fromEntries(posts.map(p => [p.id, { track_title: p.track_title, album_art_url: p.album_art_url }]));
        }
      }

      const mapped: Notification[] = (data as any[]).map(n => ({
        id: n.id,
        type: n.type,
        post_id: n.post_id,
        comment_id: n.comment_id,
        actor_user_id: n.actor_user_id,
        is_read: n.is_read,
        created_at: n.created_at,
        actor: n.actor,
        post: n.post_id ? postMap[n.post_id] ?? null : null,
      }));
      setNotifications(mapped);
      setUnreadCount(mapped.filter(n => !n.is_read).length);
    }
    setLoading(false);
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setUnreadCount(0);
    setNotifications([]);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  return { notifications, unreadCount, loading, refetch: fetch, markAllRead };
}
