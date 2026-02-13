import { useState, useCallback } from "react";
import { toast } from "sonner";
import { HitFitUploader } from "./HitFitUploader";
import { HitFitResults, type HitFitAnalysis } from "./HitFitResults";

export function HitFitTab() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<HitFitAnalysis | null>(null);

  const handleAnalyze = useCallback(async (master1: File, master2: File | null, reference: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("master1", master1);
      formData.append("master1Name", master1.name);
      if (master2) {
        formData.append("master2", master2);
        formData.append("master2Name", master2.name);
      }
      formData.append("reference", reference);
      formData.append("referenceName", reference.name);

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

      setAnalysis(data as HitFitAnalysis);
    } catch (e) {
      console.error("HitFit error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to analyze masters");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setAnalysis(null);
  }, []);

  if (analysis) {
    return <HitFitResults analysis={analysis} onBack={handleBack} />;
  }

  return <HitFitUploader onAnalyze={handleAnalyze} loading={loading} />;
}
