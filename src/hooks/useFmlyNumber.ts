import { useEffect, useState } from "react";
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

let totalCountPromise: Promise<number> | null = null;
const userNumberPromises = new Map<string, Promise<number | null>>();

function fetchTotalCount() {
  if (!totalCountPromise) {
    totalCountPromise = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("trailblazer_number", "is", null)
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      })
      .catch((error) => {
        totalCountPromise = null;
        throw error;
      });
  }

  return totalCountPromise;
}

function fetchUserNumber(userId: string) {
  const cached = userNumberPromises.get(userId);
  if (cached) return cached;

  const request = supabase
    .from("profiles")
    .select("trailblazer_number")
    .eq("id", userId)
    .single()
    .then(({ data, error }) => {
      if (error) throw error;
      return (data as { trailblazer_number?: number | null } | null)?.trailblazer_number ?? null;
    })
    .catch((error) => {
      userNumberPromises.delete(userId);
      throw error;
    });

  userNumberPromises.set(userId, request);
  return request;
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
    setLoading(true);
    setNumber(null);

    async function load() {
      try {
        const nextTotal = await fetchTotalCount();
        if (cancelled) return;
        setTotal(nextTotal);

        if (userId) {
          const nextNumber = await fetchUserNumber(userId);
          if (!cancelled) setNumber(nextNumber);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const nextNumber = total < 1000 ? total + 1 : null;
  const spotsRemaining = Math.max(0, 1000 - total);

  return { number, total, isBlazer: number !== null, loading, nextNumber, spotsRemaining };
}
