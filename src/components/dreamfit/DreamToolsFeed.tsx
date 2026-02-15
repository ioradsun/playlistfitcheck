import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DreamToolCard } from "./DreamToolCard";
import { DreamComments } from "./DreamComments";
import { CATEGORY_FILTERS, type Dream } from "./types";

type SortMode = "trending" | "most_backed" | "fresh" | "built";

interface Props {
  refreshKey: number;
}

export function DreamToolsFeed({ refreshKey }: Props) {
  const { user } = useAuth();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [backedIds, setBackedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("trending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [commentDreamId, setCommentDreamId] = useState<string | null>(null);

  const fetchDreams = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("dream_tools")
      .select("*, profiles:user_id(display_name, avatar_url)");

    if (typeFilter !== "all") {
      query = query.eq("dream_type", typeFilter);
    }

    switch (sort) {
      case "trending":
        query = query.order("trending_score", { ascending: false });
        break;
      case "most_backed":
        query = query.order("backers_count", { ascending: false });
        break;
      case "fresh":
        query = query.order("created_at", { ascending: false });
        break;
      case "built":
        query = query.eq("status", "live").order("created_at", { ascending: false });
        break;
    }

    const { data } = await query.limit(50);
    setDreams((data as any) || []);
    setLoading(false);
  }, [sort, typeFilter]);

  const fetchBacked = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("dream_backers")
      .select("dream_id")
      .eq("user_id", user.id);
    setBackedIds(new Set((data || []).map((d: any) => d.dream_id)));
  }, [user]);

  useEffect(() => {
    fetchDreams();
    fetchBacked();
  }, [fetchDreams, fetchBacked, refreshKey]);

  const handleToggleBack = () => {
    // Optimistic: just refetch
    setTimeout(() => {
      fetchDreams();
      fetchBacked();
    }, 300);
  };

  const sortTabs: { key: SortMode; label: string; emoji: string }[] = [
    { key: "trending", label: "Trending", emoji: "🔥" },
    { key: "most_backed", label: "Most Backed", emoji: "💎" },
    { key: "fresh", label: "Fresh", emoji: "🌱" },
    { key: "built", label: "Built", emoji: "🚀" },
  ];

  return (
    <div className="space-y-4">
      {/* Sort tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {sortTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSort(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              sort === t.key
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Type filters */}
      <div className="flex items-center gap-1">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              typeFilter === f.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading dreams...</div>
      ) : dreams.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="text-lg font-semibold">No dreams yet</p>
          <p className="text-sm text-muted-foreground">Be the first to ask for something ridiculous.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dreams.map((dream) => (
            <div key={dream.id}>
              <DreamToolCard
                dream={dream}
                isBacked={backedIds.has(dream.id)}
                onToggleBack={handleToggleBack}
                onOpenComments={(id) => setCommentDreamId(commentDreamId === id ? null : id)}
              />
              {commentDreamId === dream.id && (
                <div className="mt-2 ml-4">
                  <DreamComments dreamId={dream.id} onClose={() => setCommentDreamId(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
