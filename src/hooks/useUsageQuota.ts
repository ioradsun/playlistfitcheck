import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { getSessionId } from "@/lib/sessionId";

const DEFAULT_ANON_LIMIT = 5;
const DEFAULT_FREE_LIMIT = 10;

type Tier = "anonymous" | "limited" | "unlimited";

interface UsageQuota {
  canUse: boolean;
  remaining: number;
  limit: number;
  used: number;
  tier: Tier;
  loading: boolean;
  increment: () => Promise<void>;
}

interface UseUsageQuotaOptions {
  enabled?: boolean;
}

export function useUsageQuota(tool: string, options?: UseUsageQuotaOptions): UsageQuota {
  const { user, profile } = useAuth();
  const siteCopy = useSiteCopy();
  const enabled = options?.enabled ?? true;
  const growthEnabled = siteCopy.features.growth_flow;
  const shouldTrack = enabled && growthEnabled;
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const isUnlimited = !!(profile as any)?.is_unlimited;
  const tier: Tier = !user ? "anonymous" : isUnlimited ? "unlimited" : "limited";
  const quotas = siteCopy.features.growth_quotas;
  const anonLimit = quotas?.guest ?? DEFAULT_ANON_LIMIT;
  const freeLimit = quotas?.limited ?? DEFAULT_FREE_LIMIT;
  const limit = tier === "unlimited" ? Infinity : tier === "limited" ? freeLimit : anonLimit;

  // Fetch current usage count
  const fetchUsage = useCallback(async () => {
    if (!shouldTrack) return;
    setLoading(true);
    try {
      const period = "lifetime";
      let query = supabase
        .from("usage_tracking")
        .select("count")
        .eq("tool", tool)
        .eq("period", period);

      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", getSessionId());
      }

      const { data } = await query.maybeSingle();
      setUsed(data?.count ?? 0);
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    } finally {
      setLoading(false);
    }
  }, [tool, user, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack) {
      setLoading(false);
      return;
    }
    fetchUsage();
  }, [fetchUsage, shouldTrack]);

  // Listen for quota changes from other components
  useEffect(() => {
    if (!shouldTrack) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.tool === tool) {
        fetchUsage();
      }
    };
    window.addEventListener("quota-updated", handler);
    return () => window.removeEventListener("quota-updated", handler);
  }, [fetchUsage, tool, shouldTrack]);

  const increment = useCallback(async () => {
    if (!shouldTrack) return;

    const newCount = used + 1;
    setUsed(newCount);

    try {
      const period = "lifetime";
      const sessionId = getSessionId();

      if (user) {
        const { data: existing } = await supabase
          .from("usage_tracking")
          .select("id, count")
          .eq("user_id", user.id)
          .eq("tool", tool)
          .eq("period", period)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("usage_tracking")
            .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("usage_tracking")
            .insert({ user_id: user.id, tool, count: 1, period });
        }
      } else {
        const { data: existing } = await supabase
          .from("usage_tracking")
          .select("id, count")
          .eq("session_id", sessionId)
          .eq("tool", tool)
          .eq("period", period)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("usage_tracking")
            .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("usage_tracking")
            .insert({ session_id: sessionId, tool, count: 1, period });
        }
      }

      // Notify other useUsageQuota instances (e.g. the FitWidget)
      window.dispatchEvent(new CustomEvent("quota-updated", { detail: { tool } }));
    } catch (e) {
      console.error("Failed to increment usage:", e);
    }
  }, [used, user, tool, shouldTrack]);

  // If growth flow disabled, everything is unlimited
  if (!shouldTrack) {
    return { canUse: true, remaining: Infinity, limit: Infinity, used: 0, tier, loading: false, increment };
  }

  const remaining = tier === "unlimited" ? Infinity : Math.max(0, limit - used);
  const canUse = tier === "unlimited" || used < limit;

  return { canUse, remaining, limit, used, tier, loading, increment };
}
