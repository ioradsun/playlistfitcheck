import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const EMOJI_SYMBOLS: Record<string, string> = {
  fire: "🔥",
  dead: "💀",
  mind_blown: "🤯",
  emotional: "😭",
  respect: "🙏",
  accurate: "🎯",
};

export interface TopReaction {
  symbol: string;
  count: number;
}

export function useTopPostReaction(postId: string): TopReaction | null {
  const [top, setTop] = useState<TopReaction | null>(null);

  useEffect(() => {
    if (!postId) return;
    supabase
      .from("songfit_post_reactions" as any)
      .select("emoji")
      .eq("post_id", postId)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const counts: Record<string, number> = {};
        for (const row of data as any[]) {
          counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
        }
        let topKey = "";
        let topCount = 0;
        for (const [key, count] of Object.entries(counts)) {
          if (count > topCount) {
            topCount = count;
            topKey = key;
          }
        }
        if (topKey) {
          setTop({ symbol: EMOJI_SYMBOLS[topKey] ?? "🔥", count: topCount });
        }
      });
  }, [postId]);

  return top;
}
