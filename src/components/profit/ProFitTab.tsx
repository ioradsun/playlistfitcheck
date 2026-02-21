import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { toast } from "sonner";
import { ProFitLanding } from "./ProFitLanding";
import { ProFitReport } from "./ProFitReport";
import { ProFitChat } from "./ProFitChat";
import type { ArtistData, Blueprint } from "./types";

type View = "landing" | "report" | "chat";

interface ReportState {
  artist: ArtistData;
  blueprint: Blueprint;
  reportId: string;
  shareToken: string;
}

interface ProFitTabProps {
  initialArtistUrl?: string | null;
  initialSavedReport?: { reportId: string; shareToken: string; blueprint: Blueprint; artist: ArtistData } | null;
  onProjectSaved?: () => void;
  onHeaderProject?: (project: { title: string; onBack: () => void } | null) => void;
  onSavedId?: (id: string) => void;
}

export const ProFitTab = ({ initialArtistUrl, initialSavedReport, onProjectSaved, onHeaderProject, onSavedId }: ProFitTabProps = {}) => {
  const [view, setView] = useState<View>("landing");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportState | null>(null);
  const { profile } = useAuth();
  const quota = useUsageQuota("profit");
  const autoRanRef = useRef(false);

  const handleAnalyze = useCallback(async (url: string) => {
    if (!quota.canUse) {
      toast.error(quota.tier === "anonymous" ? "Sign up for more uses" : "Invite an artist to unlock unlimited");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("profit-analyze", {
        body: { artistUrl: url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReport({
        artist: data.artist,
        blueprint: data.blueprint,
        reportId: data.reportId,
        shareToken: data.shareToken,
      });
      setView("report");
      await quota.increment();
      onProjectSaved?.();
      if (data.reportId) onSavedId?.(data.reportId);
      // Save to localStorage history
      try {
        const history = JSON.parse(localStorage.getItem("profit_history") || "[]");
        const entry = {
          artistId: data.artist.spotify_artist_id,
          name: data.artist.name,
          image: data.artist.image_url,
          tier: data.blueprint.tier.name,
          reportId: data.reportId,
          date: new Date().toISOString(),
        };
        const filtered = history.filter((h: any) => h.artistId !== entry.artistId);
        localStorage.setItem("profit_history", JSON.stringify([entry, ...filtered].slice(0, 10)));
      } catch {}
    } catch (e: any) {
      toast.error(e.message || "Failed to analyze artist");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from saved report (instant, no re-analysis)
  useEffect(() => {
    if (initialSavedReport?.reportId && initialSavedReport?.blueprint && initialSavedReport?.artist) {
      setReport({
        artist: initialSavedReport.artist,
        blueprint: initialSavedReport.blueprint,
        reportId: initialSavedReport.reportId,
        shareToken: initialSavedReport.shareToken || "",
      });
      setView("report");
      return;
    }
  }, [initialSavedReport]);

  // Load from sidebar click (initialArtistUrl) — only if no saved report
  useEffect(() => {
    if (autoRanRef.current || report || loading || initialSavedReport) return;
    if (initialArtistUrl) {
      autoRanRef.current = true;
      handleAnalyze(initialArtistUrl);
      return;
    }
  }, [profile, report, loading, handleAnalyze, initialArtistUrl, initialSavedReport]);

  if (view === "chat" && report) {
    return (
      <ProFitChat
        artist={report.artist}
        blueprint={report.blueprint}
        onBack={() => setView("report")}
        onHeaderProject={onHeaderProject}
      />
    );
  }

  if (view === "report" && report) {
    return (
      <div className="px-4 py-6">
        <ProFitReport
          artist={report.artist}
          blueprint={report.blueprint}
          reportId={report.reportId}
          shareToken={report.shareToken}
          onBack={() => { setReport(null); setView("landing"); }}
          onOpenChat={() => setView("chat")}
          onHeaderProject={onHeaderProject}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <ProFitLanding onAnalyze={handleAnalyze} onLoadReport={(r: any) => {
        const artistUrl = `https://open.spotify.com/artist/${r.profit_artists?.spotify_artist_id}`;
        handleAnalyze(artistUrl);
      }} loading={loading} />
    </div>
  );
};
