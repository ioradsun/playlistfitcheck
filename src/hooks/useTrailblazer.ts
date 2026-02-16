import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TrailblazerInfo {
  /** User's trailblazer number (null if not a trailblazer) */
  number: number | null;
  /** Total trailblazers so far */
  total: number;
  /** Whether the user has the badge */
  isBlazer: boolean;
  loading: boolean;
}

/**
 * Fetch trailblazer status for a given user id.
 * If no userId provided, just fetches the global count.
 */
export function useTrailblazer(userId?: string | null): TrailblazerInfo {
  const [number, setNumber] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Get total trailblazers
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("trailblazer_number", "is", null);

      if (cancelled) return;
      setTotal(count ?? 0);

      // Get user's number if userId provided
      if (userId) {
        const { data } = await supabase
          .from("profiles")
          .select("trailblazer_number")
          .eq("id", userId)
          .single();

        if (!cancelled && data) {
          setNumber((data as any).trailblazer_number ?? null);
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [userId]);

  return { number, total, isBlazer: number !== null, loading };
}
