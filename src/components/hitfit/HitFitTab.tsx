import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { HitFitUploader, type ReferenceSource } from "./HitFitUploader";
import { HitFitResults, type HitFitAnalysis } from "./HitFitResults";

interface HitFitTabProps {
  initialAnalysis?: HitFitAnalysis | null;
  onProjectSaved?: () => void;
}

export function HitFitTab({ initialAnalysis, onProjectSaved }: HitFitTabProps = {}) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<HitFitAnalysis | null>(initialAnalysis || null);
  const { user } = useAuth();
  const quota = useUsageQuota("hitfit");

  // Sync if initialAnalysis changes (loaded from sidebar)
  useEffect(() => {
    if (initialAnalysis) setAnalysis(initialAnalysis);
  }, [initialAnalysis]);

  const handleAnalyze = useCallback(async (master1: File, master2: File | null, reference: ReferenceSource) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("master1", master1);
      formData.append("master1Name", master1.name);
      if (master2) {
        formData.append("master2", master2);
        formData.append("master2Name", master2.name);
      }

      if (reference.type === "file") {
        formData.append("reference", reference.file);
        formData.append("referenceName", reference.file.name);
      } else if (reference.type !== "none") {
        formData.append("referenceType", reference.type);
        formData.append("referenceUrl", reference.url);
        formData.append("referenceName", reference.url);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hit-fit`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || `Error ${response.status}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const result = data as HitFitAnalysis;
      setAnalysis(result);
      await quota.increment();

      // Save to DB for authenticated users
      if (user) {
        try {
          await supabase.from("saved_hitfit").insert({
            user_id: user.id,
            filename: master1.name.replace(/\.[^.]+$/, ""),
            analysis_json: result as any,
          });
          onProjectSaved?.();
        } catch (e) {
          console.error("Failed to save HitFit analysis:", e);
        }
      }
    } catch (e) {
      console.error("HitFit error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to analyze masters");
    } finally {
      setLoading(false);
    }
  }, [user, onProjectSaved]);

  const handleBack = useCallback(() => {
    setAnalysis(null);
  }, []);

  if (analysis) {
    return <HitFitResults analysis={analysis} onBack={handleBack} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <HitFitUploader
        onAnalyze={handleAnalyze}
        loading={loading}
        disabled={!quota.canUse}
        disabledMessage={
          !quota.canUse
            ? quota.tier === "anonymous"
              ? "Sign up for more uses"
              : "Invite an artist to unlock unlimited"
            : undefined
        }
      />
    </div>
  );
}
