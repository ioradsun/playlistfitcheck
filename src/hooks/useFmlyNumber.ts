import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FmlyNumberInfo {
  /** User's FMLY number (null if not a FMLY member) */
  number: number | null;
  /** Total FMLY members so far */
  total: number;
  /** Whether the user has the badge */
  isBlazer: boolean;
  loading: boolean;
  /** The next available FMLY number. Null if all 1000 are claimed. */
  nextNumber: number | null;
  /** Whether any FMLY spots remain */
  spotsRemaining: number;
}

/**
 * Fetch FMLY member status for a given user id.
 * If no userId provided, just fetches the global count.
 */
export function useFmlyNumber(userId?: string | null): FmlyNumberInfo {
  const [number, setNumber] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Get total FMLY members
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

  const nextNumber = total < 1000 ? total + 1 : null;
  const spotsRemaining = Math.max(0, 1000 - total);

  return { number, total, isBlazer: number !== null, loading, nextNumber, spotsRemaining };
}
