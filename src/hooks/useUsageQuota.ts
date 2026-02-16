import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { getSessionId } from "@/lib/sessionId";

const ANON_LIMIT = 5;
const FREE_LIMIT = 10;

type Tier = "anonymous" | "free" | "unlimited";

interface UsageQuota {
  canUse: boolean;
  remaining: number;
  limit: number;
  used: number;
  tier: Tier;
  loading: boolean;
  increment: () => Promise<void>;
}

export function useUsageQuota(tool: string): UsageQuota {
  const { user, profile } = useAuth();
  const siteCopy = useSiteCopy();
  const growthEnabled = siteCopy.features.growth_flow;
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const isUnlimited = !!(profile as any)?.is_unlimited;
  const tier: Tier = !user ? "anonymous" : isUnlimited ? "unlimited" : "free";
  const limit = tier === "unlimited" ? Infinity : tier === "free" ? FREE_LIMIT : ANON_LIMIT;

  // Fetch current usage count
  useEffect(() => {
    if (!growthEnabled) {
      setLoading(false);
      return;
    }

    const fetchUsage = async () => {
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
    };

    fetchUsage();
  }, [tool, user, growthEnabled]);

  const increment = useCallback(async () => {
    if (!growthEnabled) return;

    const newCount = used + 1;
    setUsed(newCount);

    try {
      const period = "lifetime";
      const sessionId = getSessionId();

      if (user) {
        // Upsert for authenticated user
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
        // Upsert for anonymous
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
    } catch (e) {
      console.error("Failed to increment usage:", e);
    }
  }, [used, user, tool, growthEnabled]);

  // If growth flow disabled, everything is unlimited
  if (!growthEnabled) {
    return { canUse: true, remaining: Infinity, limit: Infinity, used: 0, tier, loading: false, increment };
  }

  const remaining = tier === "unlimited" ? Infinity : Math.max(0, limit - used);
  const canUse = tier === "unlimited" || used < limit;

  return { canUse, remaining, limit, used, tier, loading, increment };
}
