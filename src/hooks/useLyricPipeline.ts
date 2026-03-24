import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { LyricLine } from "@/components/lyric/LyricDisplay";
import { persistQueue } from "@/lib/persistQueue";

export type FitReadiness = "not_started" | "running" | "ready" | "error";
export type PipelineStageStatus = "pending" | "running" | "done";
export interface PipelineStages {
  rhythm: PipelineStageStatus;
  sections: PipelineStageStatus;
  cinematic: PipelineStageStatus;
  transcript: PipelineStageStatus;
}

export type GenerationJobStatus = "idle" | "running" | "done" | "error";
export interface GenerationStatus {
  beatGrid: GenerationJobStatus;
  renderData: GenerationJobStatus;
  cinematicDirection: GenerationJobStatus;
  sectionImages: GenerationJobStatus;
}

interface UsePipelineSchedulerParams {
  initialLyric: any;
  transcriptionDone: boolean;
  beatGridDone: boolean;
  lines: LyricLine[];
  words: Array<{ word: string; start: number; end: number }> | null;
  renderData: any | null;
  beatGrid: BeatGridData | null;
  cinematicDirection: any | null;
  audioFile: File | null;
  savedIdRef: React.MutableRefObject<string | null>;
  hookDetectionRunRef: React.MutableRefObject<boolean>;
  imageRetriggerRef: React.MutableRefObject<boolean>;

  setRenderData: (d: any) => void;
  setCinematicDirection: (d: any) => void;
  setSectionImageUrls: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  setSectionImageProgress: React.Dispatch<
    React.SetStateAction<{ done: number; total: number } | null>
  >;
  setSectionImageError: React.Dispatch<React.SetStateAction<string | null>>;
  setPipelineDanceId: React.Dispatch<React.SetStateAction<string | null>>;
  setPipelineDanceUrl: React.Dispatch<React.SetStateAction<string | null>>;

  startCinematicDirection: (lines: LyricLine[], force?: boolean) => Promise<void>;
  startHookDetection: () => Promise<void>;
}

interface UsePipelineSchedulerReturn {
  generationStatus: GenerationStatus;
  setGenerationStatus: React.Dispatch<React.SetStateAction<GenerationStatus>>;
  fitReadiness: FitReadiness;
  setFitReadiness: React.Dispatch<React.SetStateAction<FitReadiness>>;
  fitProgress: number;
  setFitProgress: React.Dispatch<React.SetStateAction<number>>;
  fitStageLabel: string;
  setFitStageLabel: React.Dispatch<React.SetStateAction<string>>;
  pipelineStages: PipelineStages;
  setPipelineStages: React.Dispatch<React.SetStateAction<PipelineStages>>;
  fitUnlocked: boolean;
  setFitUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  pipelineRetryCount: number;

  pipelineTriggeredRef: React.MutableRefObject<boolean>;
  cinematicTriggeredRef: React.MutableRefObject<boolean>;

  retryGeneration: () => void;
  handleImageGenerationStatusChange: (
    status: "idle" | "running" | "done" | "error",
  ) => void;
  handleSectionImagesGenerated: (payload: {
    urls: (string | null)[];
    total: number;
    error?: string | null;
  }) => void;
  handleSectionImagesError: (error: string | null) => void;
}

export function usePipelineScheduler({
  initialLyric,
  transcriptionDone,
  beatGridDone,
  lines,
  words,
  renderData,
  beatGrid,
  cinematicDirection,
  audioFile,
  savedIdRef,
  hookDetectionRunRef,
  imageRetriggerRef,
  setRenderData,
  setCinematicDirection,
  setSectionImageUrls,
  setSectionImageProgress,
  setSectionImageError,
  setPipelineDanceId,
  setPipelineDanceUrl,
  startCinematicDirection,
  startHookDetection,
}: UsePipelineSchedulerParams): UsePipelineSchedulerReturn {
  const [fitUnlocked, setFitUnlocked] = useState(() => {
    if (!initialLyric) return false;
    const rd = (initialLyric as any).render_data;
    return !!(
      (initialLyric as any).beat_grid &&
      ((initialLyric as any).cinematic_direction ||
        rd?.cinematicDirection ||
        rd?.cinematic_direction)
    );
  });

  const [fitReadiness, setFitReadiness] = useState<FitReadiness>(() => {
    if (!initialLyric) return "not_started";
    const rd = (initialLyric as any).render_data;
    const hasBeatGrid = !!(initialLyric as any).beat_grid;
    const hasCinematic = !!(
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction
    );
    return hasBeatGrid && hasCinematic ? "ready" : "not_started";
  });

  const [fitProgress, setFitProgress] = useState(() => {
    if (!initialLyric) return 0;
    const rd = (initialLyric as any).render_data;
    const hasBeatGrid = !!(initialLyric as any).beat_grid;
    const hasCinematic = !!(
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction
    );
    return hasBeatGrid && hasCinematic ? 100 : 0;
  });
  const [fitStageLabel, setFitStageLabel] = useState("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStages>({
    rhythm: "pending",
    sections: "pending",
    cinematic: "pending",
    transcript: "pending",
  });
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(() => {
    if (!initialLyric) {
      return {
        beatGrid: "idle",
        renderData: "done",
        cinematicDirection: "idle",
        sectionImages: "idle",
      };
    }
    const rd = (initialLyric as any).render_data;
    const hasBeatGrid = !!(initialLyric as any).beat_grid;
    const hasCinematic = !!(
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction
    );
    const hasImages =
      Array.isArray((initialLyric as any).section_images) &&
      (initialLyric as any).section_images.some(Boolean);
    return {
      beatGrid: hasBeatGrid ? "done" : "idle",
      renderData: "done",
      cinematicDirection: hasCinematic ? "done" : "idle",
      sectionImages: hasImages ? "done" : "idle",
    };
  });

  const pipelineTriggeredRef = useRef(
    !!(
      initialLyric &&
      (initialLyric as any).beat_grid &&
      ((initialLyric as any).cinematic_direction ||
        (initialLyric as any).render_data?.cinematicDirection ||
        (initialLyric as any).render_data?.cinematic_direction)
    ),
  );
  const [pipelineRetryCount, setPipelineRetryCount] = useState(0);
  const cinematicTriggeredRef = useRef(
    !!(
      initialLyric &&
      ((initialLyric as any).cinematic_direction ||
        (initialLyric as any).render_data?.cinematicDirection ||
        (initialLyric as any).render_data?.cinematic_direction)
    ),
  );

  useEffect(() => {
    if (!transcriptionDone || !beatGridDone || !lines?.length) return;
    if (cinematicTriggeredRef.current) return;
    cinematicTriggeredRef.current = true;
    const force = pipelineRetryCount > 0;

    void startCinematicDirection(lines, force);
  }, [
    transcriptionDone,
    beatGridDone,
    lines,
    pipelineRetryCount,
    startCinematicDirection,
  ]);

  useEffect(() => {
    if (!lines?.length) return;
    if (renderData && beatGrid && cinematicDirection) {
      pipelineTriggeredRef.current = true;
      setGenerationStatus({
        beatGrid: "done",
        renderData: "done",
        cinematicDirection: "done",
        sectionImages: "done",
      });
      return;
    }
    if (!pipelineTriggeredRef.current) {
      pipelineTriggeredRef.current = true;

      if (!renderData) {
        const stub = {
          source: "presetDerivation",
          generatedAt: new Date().toISOString(),
        };
        setRenderData(stub);
        if (savedIdRef.current) {
          persistQueue.enqueue({
            table: "saved_lyrics",
            id: savedIdRef.current,
            payload: { render_data: stub },
          });
        }
      }
    }
  }, [
    lines,
    pipelineRetryCount,
    renderData,
    beatGrid,
    cinematicDirection,
    setRenderData,
    savedIdRef,
  ]);

  useEffect(() => {
    if (!transcriptionDone || !beatGridDone) return;
    if (!words?.length || !lines?.length) return;

    void startHookDetection();
  }, [transcriptionDone, beatGridDone, words, lines, startHookDetection]);

  useEffect(() => {
    const coreStatuses = [
      generationStatus.beatGrid,
      generationStatus.renderData,
      generationStatus.cinematicDirection,
    ];
    const allCoreDone = coreStatuses.every((v) => v === "done");
    const hasCoreRunning = coreStatuses.includes("running");
    const hasError = coreStatuses.includes("error");

    if (allCoreDone && !hasCoreRunning) {
      setFitReadiness("ready");
      setFitProgress(100);
      setFitStageLabel("Ready");
      setPipelineStages((prev) => ({ ...prev, transcript: "done" }));
      return;
    }
    if (hasCoreRunning) {
      setFitReadiness("running");
      if (
        generationStatus.renderData === "running" ||
        generationStatus.beatGrid === "running"
      ) {
        setFitStageLabel("Analyzing song...");
      } else if (generationStatus.cinematicDirection === "running") {
        setFitStageLabel("Creating cinematic direction...");
      } else if (generationStatus.sectionImages === "running") {
        setFitStageLabel("Generating artwork...");
      } else {
        setFitStageLabel("Building your Fit…");
      }
      setPipelineStages((prev) => ({ ...prev, transcript: "running" }));
      return;
    }
    if (hasError) {
      setFitReadiness("error");
      setFitStageLabel("Background generation failed");
      setPipelineStages((prev) => ({ ...prev, transcript: "pending" }));
      return;
    }
    const allStatuses = Object.values(generationStatus);
    if (allStatuses.some((v) => v === "done") && !allCoreDone) {
      setFitReadiness("running");
      setFitStageLabel("Finalizing background jobs…");
      return;
    }

    setFitReadiness("not_started");
    setFitProgress(0);
    setFitStageLabel("");
    setPipelineStages({
      rhythm: "pending",
      sections: "pending",
      cinematic: "pending",
      transcript: "pending",
    });
  }, [generationStatus]);

  const retryGeneration = useCallback(() => {
    if (!audioFile || !lines.length) return;

    setRenderData(null);
    setCinematicDirection(null);
    setSectionImageUrls([]);
    setSectionImageProgress(null);
    setSectionImageError(null);
    setPipelineDanceId(null);
    setPipelineDanceUrl(null);
    setGenerationStatus((prev) => ({
      beatGrid: prev.beatGrid === "done" ? "done" : "idle",
      renderData: "done",
      cinematicDirection: "idle",
      sectionImages: "idle",
    }));
    pipelineTriggeredRef.current = false;
    cinematicTriggeredRef.current = false;
    hookDetectionRunRef.current = false;
    imageRetriggerRef.current = false;

    if (savedIdRef.current) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedIdRef.current,
        payload: {
          render_data: { cinematicDirection: null },
          cinematic_direction: null,
        },
      });
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedIdRef.current,
        payload: { section_images: null },
      });
    }

    setTimeout(() => {
      setPipelineRetryCount((c) => c + 1);
    }, 100);
  }, [
    audioFile,
    lines,
    setRenderData,
    setCinematicDirection,
    setSectionImageUrls,
    setSectionImageProgress,
    setSectionImageError,
    setPipelineDanceId,
    setPipelineDanceUrl,
    hookDetectionRunRef,
    imageRetriggerRef,
    savedIdRef,
  ]);

  const handleImageGenerationStatusChange = useCallback(
    (status: "idle" | "running" | "done" | "error") => {
      setGenerationStatus((prev) => ({ ...prev, sectionImages: status }));
      if (status === "running") setSectionImageError(null);
      if (status === "idle") {
        setSectionImageUrls([]);
        setSectionImageProgress(null);
        setSectionImageError(null);
      }
    },
    [setSectionImageError, setSectionImageProgress, setSectionImageUrls],
  );

  const handleSectionImagesGenerated = useCallback(
    ({
      urls,
      total,
      error,
    }: {
      urls: (string | null)[];
      total: number;
      error?: string | null;
    }) => {
      setSectionImageUrls(urls);
      setSectionImageProgress({
        done: urls.filter(Boolean).length,
        total,
      });
      setSectionImageError(error ?? null);
    },
    [setSectionImageError, setSectionImageProgress, setSectionImageUrls],
  );

  const handleSectionImagesError = useCallback(
    (error: string | null) => {
      setSectionImageError(error);
    },
    [setSectionImageError],
  );

  useEffect(() => {
    if (fitUnlocked || fitReadiness === "ready") {
      setFitUnlocked(true);
    }
  }, [fitUnlocked, fitReadiness]);

  return {
    generationStatus,
    setGenerationStatus,
    fitReadiness,
    setFitReadiness,
    fitProgress,
    setFitProgress,
    fitStageLabel,
    setFitStageLabel,
    pipelineStages,
    setPipelineStages,
    fitUnlocked,
    setFitUnlocked,
    pipelineRetryCount,
    pipelineTriggeredRef,
    cinematicTriggeredRef,
    retryGeneration,
    handleImageGenerationStatusChange,
    handleSectionImagesGenerated,
    handleSectionImagesError,
  };
}

export type UseLyricPipelineReturn = {
  retryImages: () => Promise<void>;
};
