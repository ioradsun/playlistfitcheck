import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PersonChip } from "@/components/profile/types";

interface FabricState {
  loading: boolean;
  topSupporters: PersonChip[];
  mutuals: PersonChip[];
  recentLocks: PersonChip[];
}

export function useFmlyFabric(viewedUserId: string | null, viewerUserId: string | null) {
  const [state, setState] = useState<FabricState>({
    loading: false,
    topSupporters: [],
    mutuals: [],
    recentLocks: [],
  });

  useEffect(() => {
    let canceled = false;

    async function load() {
      if (!viewedUserId) return;
      setState((prev) => ({ ...prev, loading: true }));

      const { data: artistPosts } = await supabase
        .from("feed_posts" as any)
        .select("id")
        .eq("user_id", viewedUserId)
        .limit(200);

      const postIds = (artistPosts ?? []).map((post: any) => post.id);

      const [supporterLikesRes, artistLikesRes, recentLocksRes] = await Promise.all([
        postIds.length
          ? supabase
              .from("feed_likes")
              .select("user_id,created_at,profiles:user_id(display_name,avatar_url)")
              .in("post_id", postIds)
              .neq("user_id", viewedUserId)
          : Promise.resolve({ data: [] as any[] }),
        postIds.length
          ? supabase
              .from("feed_likes")
              .select("post_id")
              .eq("user_id", viewedUserId)
              .limit(500)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("release_subscriptions")
          .select("subscriber_user_id,created_at,profiles:subscriber_user_id(display_name,avatar_url)")
          .eq("artist_user_id", viewedUserId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (canceled) return;

      const supporterCount = new Map<string, PersonChip>();
      for (const like of supporterLikesRes.data ?? []) {
        const uid = like.user_id;
        if (!uid) continue;
        const existing = supporterCount.get(uid);
        const displayName = (like as any)?.profiles?.display_name ?? "artist";
        const avatar = (like as any)?.profiles?.avatar_url ?? null;

        if (existing) {
          existing.value = (existing.value ?? 0) + 1;
        } else {
          supporterCount.set(uid, {
            user_id: uid,
            display_name: displayName,
            avatar_url: avatar,
            value: 1,
            created_at: like.created_at,
          });
        }
      }

      const topSupporters = [...supporterCount.values()]
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, 12);

      const artistFiredPosts = new Set((artistLikesRes.data ?? []).map((r: any) => r.post_id));
      const mutualCandidates = new Set<string>();

      if (artistFiredPosts.size > 0) {
        const { data: owners } = await supabase
          .from("feed_posts" as any)
          .select("id,user_id,profiles:user_id(display_name,avatar_url)")
          .in("id", [...artistFiredPosts]);

        for (const row of owners ?? []) {
          if (!row.user_id || row.user_id === viewedUserId) continue;
          mutualCandidates.add(row.user_id);
        }
      }

      const mutuals = topSupporters.filter((supporter) => mutualCandidates.has(supporter.user_id)).slice(0, 12);

      if (viewerUserId && viewerUserId === viewedUserId && mutuals.length === 0 && topSupporters.length > 0) {
        mutuals.push(...topSupporters.slice(0, 4));
      }

      const recentLocks: PersonChip[] = (recentLocksRes.data ?? []).map((row: any) => ({
        user_id: row.subscriber_user_id,
        display_name: row?.profiles?.display_name ?? "artist",
        avatar_url: row?.profiles?.avatar_url ?? null,
        created_at: row.created_at,
      }));

      setState({
        loading: false,
        topSupporters,
        mutuals,
        recentLocks,
      });
    }

    const timeout = setTimeout(() => {
      void load();
    }, 100);

    return () => {
      canceled = true;
      clearTimeout(timeout);
    };
  }, [viewedUserId, viewerUserId]);

  return state;
}
