import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBeatGrid } from "@/hooks/useBeatGrid";

type JobStatus = "running" | "done" | "error" | "skipped";
type StepName =
  | "spotify_fetch"
  | "ghost_profile"
  | "lyric_video_save"
  | "lyric_dance_mp3"
  | "lyric_dance_transcribe"
  | "lyric_dance_cinematic"
  | "lyric_dance_phrases"
  | "lyric_dance_save"
  | "section_images"
  | "complete";

const STEP_ORDER: StepName[] = [
  "spotify_fetch",
  "ghost_profile",
  "lyric_video_save",
  "lyric_dance_mp3",
  "lyric_dance_transcribe",
  "lyric_dance_cinematic",
  "lyric_dance_phrases",
  "lyric_dance_save",
  "section_images",
  "complete",
];

export type JobStep = {
  job_id?: string;
  step: StepName;
  status: JobStatus;
  detail: string | null;
  started_at: string;
  completed_at: string | null;
};

export type ReachDashboardRow = {
  spotify_artist_slug: string;
  artist_name: string;
  track_title: string;
  preview_url?: string | null;
  lyric_dance_url?: string | null;
};

type Props = {
  rows: ReachDashboardRow[];
  activeJobSlug?: string | null;
  onRefresh?: () => Promise<void> | void;
};

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1) return "< 1ms";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatClock(date?: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString([], { hour12: true });
}

function StepStatusIcon({ status }: { status?: JobStatus }) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
  }

  const dot = <div className="h-2 w-2 rounded-full" />;

  if (status === "done") return <div className="text-green-500">{dot}</div>;
  if (status === "error") return <div className="text-red-500">{dot}</div>;
  if (status === "skipped") return <div className="text-muted-foreground">{dot}</div>;

  return <span className="text-muted-foreground">○</span>;
}

function StepTimeline({ steps }: { steps: JobStep[] }) {
  const stepMap = useMemo(() => {
    const map = new Map<StepName, JobStep>();
    steps.forEach((s) => {
      map.set(s.step, s);
    });
    return map;
  }, [steps]);

  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
      {STEP_ORDER.map((step) => {
        const s = stepMap.get(step);
        const detailClass = s?.status === "error" ? "text-red-500" : "text-muted-foreground";

        return (
          <div key={step} className="grid grid-cols-[20px_160px_90px_1fr_80px_110px] gap-2 text-xs items-center font-mono">
            <StepStatusIcon status={s?.status} />
            <span>{step}</span>
            <span className={s?.status === "running" ? "text-yellow-500" : "text-muted-foreground"}>{s?.status ?? "—"}</span>
            <span className={detailClass}>{s?.detail ?? "—"}</span>
            <span className="text-muted-foreground">{formatDuration(s?.started_at, s?.completed_at)}</span>
            <span className="text-muted-foreground">{formatClock(s?.started_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BeatGridEnhancer({
  row,
  onDone,
}: {
  row: ReachDashboardRow;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const { beatGrid, loading: beatLoading } = useBeatGrid(audioBuffer);

  // When beat grid is ready, save it
  useEffect(() => {
    if (!beatGrid || !running) return;
    void saveBeatGrid(beatGrid);
  }, [beatGrid]);

  const saveBeatGrid = async (grid: any) => {
    setStatus("Saving beat grid…");
    try {
      const artistSlug = row.spotify_artist_slug;
      const songSlug = row.track_title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 50);

      const { error: updateErr } = await (supabase as any)
        .from("shareable_lyric_dances")
        .update({
          beat_grid: {
            bpm: grid.bpm,
            beats: grid.beats,
            confidence: grid.confidence,
          },
        })
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug);

      if (updateErr) throw new Error(updateErr.message);

      setStatus(`✓ ${Math.round(grid.bpm)} BPM · ${grid.beats.length} beats`);
      setRunning(false);
      setTimeout(onDone, 1500);
    } catch (e: any) {
      setError(e.message ?? "Save failed");
      setRunning(false);
    }
  };

  const handleEnhance = async () => {
    setRunning(true);
    setError(null);
    setStatus("Fetching audio…");

    try {
      let audioUrl = row.preview_url ?? null;

      if (!audioUrl && row.lyric_dance_url) {
        const slugParts = row.lyric_dance_url.split("/").filter(Boolean);
        if (slugParts.length >= 2) {
          const { data: danceRow } = await (supabase as any)
            .from("shareable_lyric_dances")
            .select("audio_url")
            .eq("artist_slug", slugParts[0])
            .eq("song_slug", slugParts[1])
            .maybeSingle();
          audioUrl = danceRow?.audio_url ?? null;
        }
      }

      if (!audioUrl) {
        throw new Error("No audio URL found");
      }

      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();

      setStatus("Running beat detection…");
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      ctx.close();

      setAudioBuffer(decoded);
    } catch (e: any) {
      setError(e.message ?? "Failed");
      setRunning(false);
    }
  };

  if (!running && !error && status?.startsWith("✓")) {
    return <span className="text-xs text-green-500 font-mono">{status}</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {!running && !status && (
        <button
          onClick={handleEnhance}
          className="text-[11px] font-mono font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          ⚡ Enhance
        </button>
      )}
      {running && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
          <Loader2 className="h-3 w-3 animate-spin" />
          {beatLoading ? "Analyzing beats…" : status}
        </span>
      )}
      {!running && status && !error && (
        <span className="text-[11px] text-muted-foreground font-mono">{status}</span>
      )}
      {error && (
        <span className="text-[11px] text-red-500 font-mono">{error.slice(0, 50)}</span>
      )}
    </div>
  );
}

export function ReachDashboard({ rows, activeJobSlug = null, onRefresh }: Props) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandedJobs, setExpandedJobs] = useState<Record<string, JobStep[]>>({});
  const [liveJobSteps, setLiveJobSteps] = useState<JobStep[]>([]);
  const [showLivePanel, setShowLivePanel] = useState(false);

  const fetchJobForSlug = async (slug: string) => {
    if (expandedJobs[slug]) return;

    const { data } = await (supabase as any)
      .from("claim_page_jobs")
      .select("job_id, step, status, detail, started_at, completed_at")
      .eq("spotify_artist_slug", slug)
      .order("started_at", { ascending: false })
      .limit(14);

    if (!data?.length) {
      setExpandedJobs((prev) => ({ ...prev, [slug]: [] }));
      return;
    }

    const latestJobId = data[0]?.job_id;
    const steps = data
      .filter((r: JobStep & { job_id: string }) => r.job_id === latestJobId)
      .reduce((acc: JobStep[], row: JobStep) => {
        const idx = acc.findIndex((s) => s.step === row.step);
        if (idx >= 0) {
          if (row.status !== "running") acc[idx] = row;
        } else {
          acc.push(row);
        }
        return acc;
      }, [])
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    setExpandedJobs((prev) => ({ ...prev, [slug]: steps }));
  };

  useEffect(() => {
    if (!activeJobSlug) return;

    setShowLivePanel(true);
    setLiveJobSteps([]);

    const channel = supabase
      .channel(`claim-job-${activeJobSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "claim_page_jobs",
          filter: `spotify_artist_slug=eq.${activeJobSlug}`,
        },
        (payload: any) => {
          const row = payload.new as JobStep;
          setLiveJobSteps((prev) => {
            const existing = prev.findIndex((s) => s.step === row.step);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = row;
              return updated;
            }
            return [...prev, row].sort(
              (a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step)
            );
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeJobSlug]);

  useEffect(() => {
    const complete = liveJobSteps.find((s) => s.step === "complete" && s.status === "done");
    if (!complete || !showLivePanel) return;

    const timer = setTimeout(() => {
      setShowLivePanel(false);
      void onRefresh?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [liveJobSteps, showLivePanel, onRefresh]);

  return (
    <div className="space-y-4">
      {showLivePanel && liveJobSteps.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs space-y-2">
          <p className="text-muted-foreground">Live job feed ({activeJobSlug})</p>
          <StepTimeline steps={liveJobSteps} />
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="p-3">Artist</th>
              <th className="p-3">Track</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Beat</th>
              <th className="p-3 text-right">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = !!expandedRows[row.spotify_artist_slug];
              const steps = expandedJobs[row.spotify_artist_slug] ?? [];
              const firstStep = steps.find((s) => s.step === "spotify_fetch");
              const completeStep = steps.find((s) => s.step === "complete");
              const totalDuration = formatDuration(firstStep?.started_at, completeStep?.completed_at);

              return (
                <Fragment key={row.spotify_artist_slug}>
                  <tr key={row.spotify_artist_slug} className="border-t border-border/50">
                    <td className="p-3">{row.artist_name}</td>
                    <td className="p-3">{row.track_title}</td>
                    <td className="p-3 font-mono text-xs">
                      <a
                        href={`/artist/${row.spotify_artist_slug}/claim-page`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
                      >
                        {row.spotify_artist_slug}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="p-3">{totalDuration}</td>
                    <td className="p-3">
                      <BeatGridEnhancer
                        row={row}
                        onDone={() => onRefresh?.()}
                      />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setExpandedRows((prev) => ({
                            ...prev,
                            [row.spotify_artist_slug]: !prev[row.spotify_artist_slug],
                          }));
                          void fetchJobForSlug(row.spotify_artist_slug);
                        }}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-border/30 bg-muted/10">
                      <td colSpan={6} className="p-3">
                        <StepTimeline steps={steps} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
