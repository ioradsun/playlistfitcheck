import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DropAlert {
  id: string;
  feed_post_id: string;
  artist_user_id: string;
  artist_name: string;
  artist_avatar: string | null;
  artist_fmly_number: number | null;
  song_title: string;
  is_read: boolean;
  created_at: string;
}

interface ReleaseAlertRow {
  id: string;
  feed_post_id: string;
  artist_user_id: string;
  is_read: boolean;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    fmly_number: number | null;
  } | null;
  feed_posts: {
    lyric_projects: {
      title: string | null;
    } | null;
  } | null;
}

function mapAlertRow(row: ReleaseAlertRow): DropAlert {
  return {
    id: row.id,
    feed_post_id: row.feed_post_id,
    artist_user_id: row.artist_user_id,
    artist_name: row.profiles?.display_name ?? "unknown",
    artist_avatar: row.profiles?.avatar_url ?? null,
    artist_fmly_number: row.profiles?.fmly_number ?? null,
    song_title: row.feed_posts?.lyric_projects?.title ?? "untitled",
    is_read: row.is_read,
    created_at: row.created_at,
  };
}

export function useDropAlerts(): {
  alerts: DropAlert[];
  unreadCount: number;
  loading: boolean;
  markRead: (alertId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
} {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<DropAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlertById = useCallback(async (alertId: string): Promise<DropAlert | null> => {
    const { data, error } = await supabase
      .from("release_alerts")
      .select(
        `
          id,
          feed_post_id,
          artist_user_id,
          is_read,
          created_at,
          profiles!artist_user_id(display_name, avatar_url, fmly_number),
          feed_posts(lyric_projects(title))
        `,
      )
      .eq("id", alertId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapAlertRow(data as ReleaseAlertRow);
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!user) {
      setAlerts([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("release_alerts")
        .select(
          `
            id,
            feed_post_id,
            artist_user_id,
            is_read,
            created_at,
            profiles!artist_user_id(display_name, avatar_url, fmly_number),
            feed_posts(lyric_projects(title))
          `,
        )
        .eq("subscriber_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("[drop-alerts] fetch failed:", error);
        setAlerts([]);
        return;
      }

      setAlerts(((data ?? []) as ReleaseAlertRow[]).map(mapAlertRow));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`release_alerts_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "release_alerts",
          filter: `subscriber_user_id=eq.${user.id}`,
        },
        async (payload) => {
          const alertId = String(payload.new.id ?? "");
          if (!alertId) return;

          const hydrated = await fetchAlertById(alertId);
          if (!hydrated) return;

          setAlerts((prev) => {
            const deduped = prev.filter((a) => a.id !== hydrated.id);
            return [hydrated, ...deduped].slice(0, 50);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAlertById, user]);

  const unreadCount = useMemo(
    () => alerts.filter((alert) => !alert.is_read).length,
    [alerts],
  );

  const markRead = useCallback(
    async (alertId: string) => {
      const previousAlerts = alerts;
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)),
      );

      const { error } = await supabase
        .from("release_alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      if (error) {
        console.warn("[drop-alerts] markRead failed:", error);
        setAlerts(previousAlerts);
      }
    },
    [alerts],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;

    const previousAlerts = alerts;
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));

    const { error } = await supabase
      .from("release_alerts")
      .update({ is_read: true })
      .eq("subscriber_user_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.warn("[drop-alerts] markAllRead failed:", error);
      setAlerts(previousAlerts);
    }
  }, [alerts, user]);

  return {
    alerts,
    unreadCount,
    loading,
    markRead,
    markAllRead,
  };
}
