import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

export const ProFitTab = () => {
  const [view, setView] = useState<View>("landing");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportState | null>(null);
  const { profile } = useAuth();
  const autoRanRef = useRef(false);

  const handleAnalyze = useCallback(async (url: string) => {
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

  // Auto-run ProFit if user signed up with a Spotify artist
  useEffect(() => {
    if (autoRanRef.current || report || loading) return;
    const artistId = profile?.spotify_artist_id;
    if (!artistId) return;
    autoRanRef.current = true;
    handleAnalyze(`https://open.spotify.com/artist/${artistId}`);
  }, [profile, report, loading, handleAnalyze]);

  if (view === "chat" && report) {
    return (
      <ProFitChat
        artist={report.artist}
        blueprint={report.blueprint}
        onBack={() => setView("report")}
      />
    );
  }

  if (view === "report" && report) {
    return (
      <ProFitReport
        artist={report.artist}
        blueprint={report.blueprint}
        reportId={report.reportId}
        shareToken={report.shareToken}
        onBack={() => { setReport(null); setView("landing"); }}
        onOpenChat={() => setView("chat")}
      />
    );
  }

  return <ProFitLanding onAnalyze={handleAnalyze} loading={loading} />;
};
