import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { HookFitPost, HookFitFeedView } from "./types";
import { HookFitPostCard } from "./HookFitPostCard";
import { HookFitToggle } from "./HookFitToggle";

export function HookFitFeed() {
  const [posts, setPosts] = useState<HookFitPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedView, setFeedView] = useState<HookFitFeedView>("recent");

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    // Fetch hookfit_posts joined with profiles
    const { data: rawPosts } = await supabase
      .from("hookfit_posts" as any)
      .select("*, profiles:user_id(display_name, avatar_url, is_verified)")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!rawPosts || rawPosts.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const hookfitPosts = rawPosts as any as HookFitPost[];

    // Fetch hook data for each battle from shareable_hooks
    const battleIds = [...new Set(hookfitPosts.map(p => p.battle_id))];
    const { data: hooks } = await supabase
      .from("shareable_hooks" as any)
      .select("id, battle_id, artist_slug, song_slug, hook_slug, artist_name, song_name, hook_phrase, vote_count, hook_label, battle_position")
      .in("battle_id", battleIds);

    // Build lookup: battle_id → primary hook (position 1) + total votes
    const battleMap = new Map<string, { hook: any; totalVotes: number }>();
    if (hooks) {
      for (const h of hooks as any[]) {
        const existing = battleMap.get(h.battle_id);
        if (!existing) {
          battleMap.set(h.battle_id, { hook: h, totalVotes: h.vote_count || 0 });
        } else {
          existing.totalVotes += h.vote_count || 0;
          // Prefer position 1 as primary
          if (h.battle_position === 1) existing.hook = h;
        }
      }
    }

    let enriched = hookfitPosts.map(p => ({
      ...p,
      hook: battleMap.get(p.battle_id)?.hook
        ? {
            artist_slug: battleMap.get(p.battle_id)!.hook.artist_slug,
            song_slug: battleMap.get(p.battle_id)!.hook.song_slug,
            hook_slug: battleMap.get(p.battle_id)!.hook.hook_slug,
            artist_name: battleMap.get(p.battle_id)!.hook.artist_name,
            song_name: battleMap.get(p.battle_id)!.hook.song_name,
            hook_phrase: battleMap.get(p.battle_id)!.hook.hook_phrase,
            vote_count: battleMap.get(p.battle_id)!.hook.vote_count,
            hook_label: battleMap.get(p.battle_id)!.hook.hook_label,
          }
        : undefined,
      total_votes: battleMap.get(p.battle_id)?.totalVotes || 0,
    }));

    // Sort by total votes if "top" view
    if (feedView === "top") {
      enriched.sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0));
    }

    setPosts(enriched);
    setLoading(false);
  }, [feedView]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Listen for new battle publishes
  useEffect(() => {
    const handler = () => fetchPosts();
    window.addEventListener("hookfit:battle-published", handler);
    return () => window.removeEventListener("hookfit:battle-published", handler);
  }, [fetchPosts]);

  return (
    <div className="w-full max-w-[470px] mx-auto">
      <HookFitToggle view={feedView} onViewChange={setFeedView} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">
            No hook battles yet. Publish a battle from LyricFit!
          </p>
        </div>
      ) : (
        <div className="pb-24">
          {posts.map((post, idx) => (
            <HookFitPostCard
              key={post.id}
              post={post}
              rank={feedView === "top" ? idx + 1 : undefined}
              onRefresh={fetchPosts}
            />
          ))}
        </div>
      )}
    </div>
  );
}
