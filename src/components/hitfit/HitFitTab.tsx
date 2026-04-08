import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { useAudioProject } from "@/hooks/useAudioProject";
import { AuthNudge } from "@/components/ui/AuthNudge";
import { HitFitUploader, type ReferenceSource } from "./HitFitUploader";
import { HitFitResults, type HitFitAnalysis } from "./HitFitResults";
import { compressAudioFile } from "@/lib/compressAudio";
import { sessionAudio } from "@/lib/sessionAudioCache";
import type { RecentItem } from "@/components/AppSidebar";
import { useNavigate } from "react-router-dom";

interface HitFitTabProps {
  initialAnalysis?: HitFitAnalysis | null;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
  onSavedId?: (id: string) => void;
  onOptimisticItem?: (item: RecentItem) => void;
}

export function HitFitTab({ initialAnalysis, onProjectSaved, onNewProject, onHeaderProject, onSavedId, onOptimisticItem }: HitFitTabProps = {}) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<HitFitAnalysis | null>(initialAnalysis || null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const quota = useUsageQuota("hitfit");
  const { handleFileSelected, showAuthNudge, dismissAuthNudge } = useAudioProject({
    tool: "hitfit",
    dbTable: "saved_hitfit",
    includeAudioUrl: true,
    buildStubRow: ({ file, userId }) => ({
      user_id: userId,
      filename: file.name.replace(/\.[^.]+$/, ""),
      analysis_json: {},
    }),
    getSidebarLabel: (file) => file.name.replace(/\.[^.]+$/, ""),
    getSidebarRawData: ({ projectId, audioUrl }) => ({ id: projectId, analysis: null, audio_url: audioUrl }),
    onOptimisticItem,
    onProjectCreated: (id) => navigate(`/the-ar/${id}`, { replace: true }),
  });

  // Sync if initialAnalysis changes (loaded from sidebar)
  useEffect(() => {
    if (initialAnalysis) setAnalysis(initialAnalysis);
  }, [initialAnalysis]);

  const handleAnalyze = useCallback(async (master1: File, master2: File | null, reference: ReferenceSource) => {
    setLoading(true);
    try {
      const project = await handleFileSelected(master1);
      const projectId = project?.projectId ?? null;

      // Cache uploaded files for session persistence
      sessionAudio.set("hitfit", "master1", master1, { ttlMs: 20 * 60 * 1000 });
      if (master2) sessionAudio.set("hitfit", "master2", master2, { ttlMs: 20 * 60 * 1000 });
      if (reference.type === "file") sessionAudio.set("hitfit", "reference", reference.file, { ttlMs: 20 * 60 * 1000 });

      // Compress all uploaded audio files before sending
      const [compressedMaster1, compressedMaster2, compressedRef] = await Promise.all([
        compressAudioFile(master1).catch((e) => { throw new Error(`Master A: ${e.message}`); }),
        master2 ? compressAudioFile(master2).catch((e) => { throw new Error(`Master B: ${e.message}`); }) : Promise.resolve(null),
        reference.type === "file" ? compressAudioFile(reference.file).catch((e) => { throw new Error(`Reference: ${e.message}`); }) : Promise.resolve(null),
      ]);

      const formData = new FormData();
      formData.append("master1", compressedMaster1);
      formData.append("master1Name", master1.name);
      if (compressedMaster2) {
        formData.append("master2", compressedMaster2);
        formData.append("master2Name", master2!.name);
      }

      if (reference.type === "file" && compressedRef) {
        formData.append("reference", compressedRef);
        formData.append("referenceName", reference.file.name);
      } else if (reference.type === "youtube" || reference.type === "spotify") {
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

      if (projectId && user) {
        try {
          await supabase.from("saved_hitfit").update({
            analysis_json: result as any,
          }).eq("id", projectId);
          onProjectSaved?.();
          onSavedId?.(projectId);
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
  }, [handleFileSelected, onProjectSaved, onSavedId, quota, user]);

  const handleBack = useCallback(() => {
    setAnalysis(null);
    onNewProject?.();
  }, [onNewProject]);

  if (analysis) {
    return <HitFitResults analysis={analysis} onBack={handleBack} onHeaderProject={onHeaderProject} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      {showAuthNudge ? <div className="w-full max-w-xl"><AuthNudge onDismiss={dismissAuthNudge} /></div> : null}
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
