import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type SignalType =
  | "run_it_back"
  | "skip"
  | "comment"
  | "like"
  | "save"
  | "follow"
  | "lyric_reaction"
  | "lyric_comment"
  | "milestone";

export type SignalSource = "crowdfit_feed" | "shared_player" | "system";

export type SignalCategory = "momentum" | "lyrics" | "social";

export interface Signal {
  id: string;
  type: SignalType;
  source: SignalSource;
  post_id: string | null;
  dance_id: string | null;
  comment_id: string | null;
  actor_user_id: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, any>;
  actor: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  post: {
    track_title: string;
    album_art_url: string | null;
    lyric_dance_id: string | null;
    spotify_track_id: string | null;
  } | null;
}

/** Group key: same post + same type within a time window */
export interface SignalGroup {
  key: string;
  type: SignalType;
  source: SignalSource;
  post_id: string | null;
  dance_id: string | null;
  signals: Signal[];
  latest_at: string;
  actor_names: string[];
  total_count: number;
  is_read: boolean;
  post: Signal["post"];
  metadata: Record<string, any>;
}

const CATEGORY_MAP: Record<SignalType, SignalCategory> = {
  run_it_back: "momentum",
  skip: "momentum",
  like: "momentum",
  save: "momentum",
  follow: "social",
  comment: "social",
  lyric_reaction: "lyrics",
  lyric_comment: "lyrics",
  milestone: "momentum",
};

export function getSignalCategory(type: SignalType): SignalCategory {
  return CATEGORY_MAP[type] || "social";
}

const GROUP_WINDOW_MS = 30 * 60 * 1000;

function groupSignals(signals: Signal[]): SignalGroup[] {
  const groups: SignalGroup[] = [];
  const used = new Set<string>();

  const sorted = [...signals].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const signal of sorted) {
    if (used.has(signal.id)) continue;

    const groupable = sorted.filter((s) => {
      if (used.has(s.id)) return false;
      if (s.type !== signal.type) return false;

      if (signal.type === "lyric_reaction" || signal.type === "lyric_comment") {
        if (s.dance_id !== signal.dance_id) return false;
      } else if (signal.type === "follow" || signal.type === "milestone") {
        // global grouping
      } else if (s.post_id !== signal.post_id) {
        return false;
      }

      const timeDiff = Math.abs(
        new Date(signal.created_at).getTime() - new Date(s.created_at).getTime()
      );
      return timeDiff < GROUP_WINDOW_MS;
    });

    for (const groupedSignal of groupable) used.add(groupedSignal.id);

    const actorNames = [
      ...new Set(
        groupable
          .map((g) => g.actor?.display_name)
          .filter((name): name is string => !!name)
      ),
    ];

    groups.push({
      key: `${signal.type}-${signal.post_id || signal.dance_id || "global"}-${signal.created_at}`,
      type: signal.type,
      source: signal.source,
      post_id: signal.post_id,
      dance_id: signal.dance_id,
      signals: groupable,
      latest_at: groupable[0]?.created_at || signal.created_at,
      actor_names: actorNames,
      total_count: groupable.length,
      is_read: groupable.every((g) => g.is_read),
      post: signal.post,
      metadata: groupable[0]?.metadata || {},
    });
  }

  return groups;
}

export function useNotifications() {
  const { user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<any>(null);

  const fetchSignals = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("notifications")
      .select(
        "id, type, post_id, comment_id, actor_user_id, is_read, created_at, actor:actor_user_id(display_name, avatar_url)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const postIds = [
        ...new Set((data as any[]).filter((n) => n.post_id).map((n) => n.post_id)),
      ];

      let postMap: Record<
        string,
        {
          track_title: string;
          album_art_url: string | null;
          lyric_dance_id: string | null;
          spotify_track_id: string | null;
        }
      > = {};

      if (postIds.length > 0) {
        const { data: posts } = await supabase
          .from("songfit_posts")
          .select("id, track_title, album_art_url, lyric_dance_id, spotify_track_id")
          .in("id", postIds);

        if (posts) {
          postMap = Object.fromEntries(
            posts.map((post: any) => [
              post.id,
              {
                track_title: post.track_title,
                album_art_url: post.album_art_url,
                lyric_dance_id: post.lyric_dance_id,
                spotify_track_id: post.spotify_track_id,
              },
            ])
          );
        }
      }

      const mapped: Signal[] = (data as any[]).map((notification) => ({
        id: notification.id,
        type: notification.type as SignalType,
        source: (notification.source || "crowdfit_feed") as SignalSource,
        post_id: notification.post_id,
        dance_id: notification.dance_id ?? null,
        comment_id: notification.comment_id,
        actor_user_id: notification.actor_user_id ?? null,
        is_read: notification.is_read,
        created_at: notification.created_at,
        metadata: notification.metadata || {},
        actor: notification.actor,
        post: notification.post_id ? postMap[notification.post_id] ?? null : null,
      }));

      setSignals(mapped);
      setUnreadCount(mapped.filter((n) => !n.is_read).length);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`signals-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload: any) => {
          const row = payload.new;

          let actor = null;
          if (row.actor_user_id) {
            const { data: actorData } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", row.actor_user_id)
              .single();
            actor = actorData;
          }

          let post = null;
          if (row.post_id) {
            const { data: postData } = await supabase
              .from("songfit_posts")
              .select("track_title, album_art_url, lyric_dance_id, spotify_track_id")
              .eq("id", row.post_id)
              .single();
            post = postData;
          }

          const newSignal: Signal = {
            id: row.id,
            type: row.type,
            source: row.source || "crowdfit_feed",
            post_id: row.post_id,
            dance_id: row.dance_id ?? null,
            comment_id: row.comment_id,
            actor_user_id: row.actor_user_id ?? null,
            is_read: false,
            created_at: row.created_at,
            metadata: row.metadata || {},
            actor,
            post,
          };

          setSignals((prev) => [newSignal, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadCount(0);
    setSignals((prev) => prev.map((signal) => ({ ...signal, is_read: true })));
  }, [user]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!user || ids.length === 0) return;

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids);

      setSignals((prev) =>
        prev.map((signal) => (ids.includes(signal.id) ? { ...signal, is_read: true } : signal))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    },
    [user]
  );

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const grouped = groupSignals(signals);

  return {
    signals,
    grouped,
    unreadCount,
    loading,
    refetch: fetchSignals,
    markAllRead,
    markRead,
    getSignalCategory,
  };
}
