import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type React from "react";
import { supabase } from "@/integrations/supabase/client";
import { persistQueue } from "@/lib/persistQueue";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import {
  useBeatGrid,
  preloadEssentia,
  type BeatGridData,
} from "@/hooks/useBeatGrid";
import { derivePaletteFromDirection } from "@/lib/lyricPalette";
import { extractPeaks } from "@/lib/audioUtils";
import type { LyricData, LyricLine } from "@/components/lyric/LyricDisplay";
import type { WaveformData } from "@/hooks/useAudioEngine";

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
    const hasCoreData = !!(
      (initialLyric as any).beat_grid &&
      ((initialLyric as any).cinematic_direction ||
        rd?.cinematicDirection ||
        rd?.cinematic_direction)
    );
    if (!hasCoreData) return false;
    const cd =
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction;
    const sections = cd?.sections;
    if (Array.isArray(sections) && sections.length > 0) {
      const images = (initialLyric as any).section_images;
      return Array.isArray(images) && images.some(Boolean);
    }
    return true;
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
    if (!hasBeatGrid || !hasCinematic) return "not_started";
    const cd =
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction;
    const sections = cd?.sections;
    if (Array.isArray(sections) && sections.length > 0) {
      const images = (initialLyric as any).section_images;
      if (!Array.isArray(images) || !images.some(Boolean)) return "not_started";
    }
    return "ready";
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
      generationStatus.sectionImages,
    ];
    const allCoreDone = coreStatuses.every(
      (v) => v === "done" || v === "error",
    );
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

    if (savedIdRef.current) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedIdRef.current,
        payload: {
          render_data: { cinematicDirection: null },
          section_images: null,
        },
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
  setSectionImageUrls: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  setSectionImageProgress: React.Dispatch<
    React.SetStateAction<{ done: number; total: number } | null>
  >;
  setGenerationStatus: React.Dispatch<React.SetStateAction<GenerationStatus>>;
};

interface UseLyricPipelineParams {
  initialLyric?: any;
  user: { id: string } | null;
  siteCopy: any;
  sceneDescription?: string;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onSavedId?: (id: string) => void;
  claimMeta?: {
    artistSlug: string;
    songSlug: string;
    artistName: string;
    songName: string;
    albumArtUrl: string | null;
    ghostProfileId: string;
    spotifyTrackId: string;
  } | null;
  onClaimPublished?: (danceUrl: string) => void;
}

export function useLyricPipeline({
  initialLyric,
  user,
  siteCopy,
  sceneDescription,
  onNewProject,
  claimMeta = null,
  onClaimPublished,
}: UseLyricPipelineParams) {
  const hottestHooksEnabled = siteCopy?.features?.hookfit_hottest_hooks !== false;

  const artistNameRef = useRef<string>("artist");
  const artistNameReadyRef = useRef<Promise<void> | null>(null);

  const initLyricData = useMemo<LyricData | null>(() => {
    if (!initialLyric) return null;
    const filename = initialLyric.filename || "saved-lyrics.mp3";
    const normalizedTitle = (initialLyric.title || "").trim();
    const title =
      normalizedTitle &&
      normalizedTitle.toLowerCase() !== "unknown" &&
      normalizedTitle.toLowerCase() !== "untitled"
        ? normalizedTitle
        : filename.replace(/\.[^/.]+$/, "").trim() || "Untitled";
    return { title, lines: initialLyric.lines as any[] };
  }, [initialLyric]);

  const [lyricData, setLyricData] = useState<LyricData | null>(initLyricData);
  const [audioFile, setAudioFile] = useState<File | null>(() => {
    if (!initialLyric?.id) return null;
    return sessionAudio.get("lyric", initialLyric.id) ?? null;
  });

  useEffect(() => {
    preloadEssentia();
  }, []);

  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(
    initialLyric?.id ?? null,
  );
  const savedIdRef = useRef<string | null>(initialLyric?.id ?? null);
  const renderDataLoadedFromDbRef = useRef(false);
  const [lines, setLines] = useState<LyricLine[]>(
    (initialLyric?.lines as any[]) ?? [],
  );
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(
    initialLyric?.fmly_lines ?? null,
  );
  const [versionMeta, setVersionMeta] = useState<any | null>(
    initialLyric?.version_meta ?? null,
  );
  const [words, setWords] = useState<Array<{
    word: string;
    start: number;
    end: number;
  }> | null>(initialLyric?.words ?? null);

  const [renderData, setRenderData] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(
    null,
  );
  const [pipelineDanceId, setPipelineDanceId] = useState<string | null>(
    (initialLyric as any)?.render_data?.pipelineDanceId ?? null,
  );
  const [pipelineDanceUrl, setPipelineDanceUrl] = useState<string | null>(
    (initialLyric as any)?.render_data?.pipelineDanceUrl ?? null,
  );
  const [sectionImageUrls, setSectionImageUrls] = useState<(string | null)[]>(
    Array.isArray((initialLyric as any)?.section_images)
      ? ((initialLyric as any).section_images as (string | null)[])
      : [],
  );
  const [sectionImageProgress, setSectionImageProgress] = useState<{
    done: number;
    total: number;
  } | null>(() => {
    const savedSectionImages = (initialLyric as any)?.section_images;
    const total = Array.isArray(savedSectionImages) ? savedSectionImages.length : 0;
    if (!total) return null;
    return {
      done: savedSectionImages.filter(Boolean).length,
      total,
    };
  });
  const [sectionImageError, setSectionImageError] = useState<string | null>(null);
  const cinematicDirectionRef = useRef(cinematicDirection);
  cinematicDirectionRef.current = cinematicDirection;
  // Ref for generationStatus — allows startCinematicDirection (defined before
  // the scheduler call) to read the latest value without a declaration-order issue.
  const generationStatusRef = useRef<GenerationStatus>({
    beatGrid: "idle",
    renderData: "done",
    cinematicDirection: "idle",
    sectionImages: "idle",
  });

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [transcriptionDone, setTranscriptionDone] = useState(
    () =>
      !!(
        initialLyric?.lines &&
        Array.isArray(initialLyric.lines) &&
        initialLyric.lines.length > 0
      ),
  );
  const mountedRef = useRef(true);
  const [beatGridDone, setBeatGridDone] = useState(
    () => !!(initialLyric as any)?.beat_grid,
  );
  const { beatGrid: detectedGrid } = useBeatGrid(beatGrid ? null : audioBuffer);

  const timestampedLines = useMemo(() => {
    return lines
      .filter((line) => line.tag !== "adlib")
      .map((line, lineIndex) => ({
        text: line.text,
        startSec: Number(line.start ?? 0),
        endSec: Number(line.end ?? line.start ?? 0),
        lineIndex,
      }));
  }, [lines]);

  const audioDurationSec = useMemo(() => {
    const lastLineEnd =
      timestampedLines[timestampedLines.length - 1]?.endSec ?? 0;
    return Math.max(audioBuffer?.duration ?? 0, lastLineEnd);
  }, [audioBuffer, timestampedLines]);

  useEffect(() => {
    setTranscriptionDone(timestampedLines.length > 0);
  }, [timestampedLines]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const p = supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) artistNameRef.current = data.display_name;
      });
    artistNameReadyRef.current = Promise.resolve(p);
  }, [user]);

  useEffect(() => {
    if (!detectedGrid || beatGrid) return;

    setBeatGrid(detectedGrid);
    setBeatGridDone(true);
    setGenerationStatus((prev) => ({ ...prev, beatGrid: "done" }));
    setPipelineStages((prev) => ({ ...prev, rhythm: "done" }));
    setFitProgress((prev) => Math.max(prev, 35));

    if (savedIdRef.current) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id: savedIdRef.current,
        payload: {
          beat_grid: {
            bpm: detectedGrid.bpm,
            beats: detectedGrid.beats,
            confidence: detectedGrid.confidence,
          },
        },
      });
    }
  }, [detectedGrid, beatGrid]);

  const allAnalysisLoaded = !!(beatGrid && cinematicDirection);
  useEffect(() => {
    if (audioBuffer || !audioFile || audioFile.size === 0) return;
    if (allAnalysisLoaded) {
      return;
    }

    let cancelled = false;
    const ctx = new AudioContext();
    audioFile
      .arrayBuffer()
      .then((ab) =>
        ctx.decodeAudioData(ab).then((buf) => {
          if (!cancelled) {
            setAudioBuffer(buf);
            setWaveformData({ peaks: extractPeaks(buf), duration: buf.duration });
          }
          ctx.close();
        }),
      )
      .catch(() => {
        ctx.close();
      });
    return () => {
      cancelled = true;
    };
  }, [audioFile, audioBuffer, allAnalysisLoaded]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setLyricData((prev) => prev ? { ...prev, title: newTitle } : prev);
    const id = savedIdRef.current;
    if (id) {
      persistQueue.enqueue({
        table: "saved_lyrics",
        id,
        payload: { title: newTitle },
      });
    }
  }, []);

  useEffect(() => {
    savedIdRef.current = savedId;
  }, [savedId]);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialLyric || hydratedRef.current) return;
    hydratedRef.current = true;

    const filename = initialLyric.filename || "saved-lyrics.mp3";
    setTranscriptionDone(
      Array.isArray(initialLyric.lines) && initialLyric.lines.length > 0,
    );

    const savedBg = (initialLyric as any).beat_grid;

    if (savedBg) {
      setBeatGrid(savedBg as BeatGridData);
      setGenerationStatus((prev) => ({ ...prev, beatGrid: "done" }));
      setBeatGridDone(true);
    }

    const loadedRenderData = (initialLyric as any).render_data ?? null;
    const loadedCinematicDirection =
      (initialLyric as any).cinematic_direction ??
      (loadedRenderData as any)?.cinematicDirection ??
      (loadedRenderData as any)?.cinematic_direction ??
      null;

    if (loadedRenderData) {
      renderDataLoadedFromDbRef.current = true;
      setRenderData(loadedRenderData);
      setGenerationStatus((prev) => ({ ...prev, renderData: "done" }));

      const savedPeaks = (loadedRenderData as any)?.waveformPeaks;
      const savedDuration = (loadedRenderData as any)?.waveformDuration;
      if (
        Array.isArray(savedPeaks) &&
        savedPeaks.length > 0 &&
        savedDuration > 0
      ) {
        setWaveformData({ peaks: savedPeaks, duration: savedDuration });
      }
    }

    if (loadedCinematicDirection) {
      setCinematicDirection(loadedCinematicDirection);
      setGenerationStatus((prev) => ({ ...prev, cinematicDirection: "done" }));
    }

    if (savedBg && loadedCinematicDirection) {
      pipelineTriggeredRef.current = true;
      const sections = loadedCinematicDirection.sections;
      const savedSectionImages = (initialLyric as any).section_images;
      const hasSections = Array.isArray(sections) && sections.length > 0;
      const hasImages =
        Array.isArray(savedSectionImages) && savedSectionImages.some(Boolean);
      if (!hasSections || hasImages) {
        setFitReadiness("ready");
        setFitProgress(100);
        setFitUnlocked(true);
      } else {
        setFitReadiness("running");
        setFitProgress(80);
        setGenerationStatus((prev) => ({ ...prev, sectionImages: "running" }));
      }

      import("@/engine/presetDerivation").then(({ deriveFrameState, getTypography }) => {
        const typoPreset =
          loadedCinematicDirection.typography || "clean-modern";
        getTypography(typoPreset);
        deriveFrameState(loadedCinematicDirection, 0, 0.5);
      });
    }

    const savedSectionImages = (initialLyric as any).section_images;
    if (
      Array.isArray(savedSectionImages) &&
      savedSectionImages.length > 0 &&
      savedSectionImages.some(Boolean)
    ) {
      setSectionImageUrls(savedSectionImages);
      setSectionImageProgress({
        done: savedSectionImages.filter(Boolean).length,
        total: savedSectionImages.length,
      });
      setSectionImageError(null);
      setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
    }

    const cachedAudio = initialLyric.id
      ? sessionAudio.get("lyric", initialLyric.id)
      : undefined;
    if (cachedAudio) {
      setAudioFile(cachedAudio);
      setHasRealAudio(true);
    } else if ((initialLyric as any).audio_url) {
      const audioUrl = (initialLyric as any).audio_url as string;
      const audioAbort = new AbortController();
      const audioTimeout = setTimeout(() => audioAbort.abort(), 15_000);
      fetch(audioUrl, { signal: audioAbort.signal })
        .then((res) => res.blob())
        .then((blob) => {
          clearTimeout(audioTimeout);
          const file = new File([blob], filename, {
            type: blob.type || "audio/mpeg",
          });
          setAudioFile(file);
          setHasRealAudio(true);
          if (initialLyric.id)
            sessionAudio.set("lyric", initialLyric.id, file, {
              ttlMs: 20 * 60 * 1000,
            });
        })
        .catch(() => {
          clearTimeout(audioTimeout);
          console.warn("[Pipeline] Audio fetch failed or timed out");
          setAudioFile(null);
          setHasRealAudio(false);
        });
    } else {
      setAudioFile(null);
      setHasRealAudio(false);
    }
  }, [initialLyric]);

  const danceIdLookedUpRef = useRef(!!pipelineDanceId);
  useEffect(() => {
    if (danceIdLookedUpRef.current || pipelineDanceId) return;
    if (!user || !initialLyric || !cinematicDirection) return;
    danceIdLookedUpRef.current = true;
    void (async () => {
      const { slugify } = await import("@/lib/slugify");
      const s = slugify(initialLyric.title || "untitled");
      const { data: d }: any = await supabase
        .from("shareable_lyric_dances")
        .select("id, artist_slug, song_slug")
        .eq("user_id", user.id)
        .eq("song_slug", s)
        .maybeSingle();
      if (d) {
        setPipelineDanceId(d.id);
        setPipelineDanceUrl(`/${d.artist_slug}/${d.song_slug}/lyric-dance`);
      }
    })();
  }, [user, initialLyric, cinematicDirection, pipelineDanceId]);

  const claimPublishedRef = useRef(false);
  useEffect(() => {
    if (!claimMeta || claimPublishedRef.current) return;
    if (!cinematicDirection?.phrases?.length) return;
    if (!audioFile || !lines?.length) return;

    claimPublishedRef.current = true;

    void (async () => {
      try {
        const storagePath = `ghost/${claimMeta.artistSlug}/${claimMeta.spotifyTrackId}/preview.mp3`;
        const { error: uploadErr } = await supabase.storage
          .from("audio-clips")
          .upload(storagePath, audioFile, {
            upsert: true,
            contentType: audioFile.type || "audio/mpeg",
          });

        const { data: urlData } = supabase.storage
          .from("audio-clips")
          .getPublicUrl(storagePath);
        const audioStorageUrl = urlData?.publicUrl;

        if (uploadErr || !audioStorageUrl) {
          console.error("[ClaimPublish] Audio upload failed:", uploadErr);
          claimPublishedRef.current = false;
          return;
        }

        const { error: danceErr } = await supabase
          .from("shareable_lyric_dances" as any)
          .upsert({
            user_id: user?.id ?? null,
            artist_slug: claimMeta.artistSlug,
            song_slug: claimMeta.songSlug,
            artist_name: claimMeta.artistName,
            song_name: claimMeta.songName,
            audio_url: audioStorageUrl,
            lyrics: lines.map((l: any) => ({
              start: l.start,
              end: l.end,
              text: l.text,
              tag: l.tag ?? "main",
            })),
            words: words?.length ? words : null,
            cinematic_direction: cinematicDirection,
            beat_grid: beatGrid ?? { bpm: 120, beats: [], confidence: 0 },
            palette: cinematicDirection?.defaults?.palette ?? ["#ffffff", "#a855f7", "#ec4899"],
            section_images: null,
            auto_palettes: null,
            album_art_url: claimMeta.albumArtUrl,
          }, { onConflict: "artist_slug,song_slug" });

        if (danceErr) {
          console.error("[ClaimPublish] Upsert failed:", danceErr);
          claimPublishedRef.current = false;
          return;
        }

        const { data: danceRow } = await (supabase
          .from("shareable_lyric_dances" as any)
          .select("id")
          .eq("artist_slug", claimMeta.artistSlug)
          .eq("song_slug", claimMeta.songSlug)
          .maybeSingle() as any) as { data: { id: string } | null };

        const lyricDanceUrl = `/${claimMeta.artistSlug}/${claimMeta.songSlug}/lyric-dance`;

        await supabase
          .from("artist_lyric_videos" as any)
          .upsert({
            ghost_profile_id: claimMeta.ghostProfileId,
            user_id: user?.id ?? null,
            spotify_track_id: claimMeta.spotifyTrackId,
            track_title: claimMeta.songName,
            artist_name: claimMeta.artistName,
            album_art_url: claimMeta.albumArtUrl,
            preview_url: audioStorageUrl,
            lyric_dance_url: lyricDanceUrl,
            lyric_dance_id: danceRow?.id ?? null,
          }, { onConflict: "ghost_profile_id,spotify_track_id" });

        if (danceRow?.id) {
          supabase.functions
            .invoke("generate-section-images", {
              body: { lyric_dance_id: danceRow.id },
            })
            .catch(() => {});
        }

        setPipelineDanceId(danceRow?.id ?? null);
        setPipelineDanceUrl(lyricDanceUrl);
        onClaimPublished?.(lyricDanceUrl);
      } catch (e) {
        console.error("[ClaimPublish] Error:", e);
        claimPublishedRef.current = false;
      }
    })();
  }, [claimMeta, cinematicDirection, audioFile, lines, words, beatGrid, user, onClaimPublished]);

  useEffect(() => {
    const id = savedIdRef.current;
    if (!id || !renderData) return;
    if (renderDataLoadedFromDbRef.current) {
      renderDataLoadedFromDbRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const payload = { ...renderData };
      if (cinematicDirection) payload.cinematicDirection = cinematicDirection;
      if (waveformData?.peaks?.length) {
        payload.waveformPeaks = waveformData.peaks;
        payload.waveformDuration = waveformData.duration;
      }
      if (pipelineDanceId) payload.pipelineDanceId = pipelineDanceId;
      if (pipelineDanceUrl) payload.pipelineDanceUrl = pipelineDanceUrl;
      persistQueue.enqueue({ table: "saved_lyrics", id, payload: { render_data: payload } });
    }, 1500);
    return () => clearTimeout(timer);
  }, [renderData, cinematicDirection, waveformData, pipelineDanceId, pipelineDanceUrl]);

  const hookDetectionRunRef = useRef(false);
  const startHookDetection = useCallback(async () => {
    if (!hottestHooksEnabled) return;
    if (hookDetectionRunRef.current) return;
    if (!words?.length || !lines?.length) return;
    if (renderData?.hook) return;

    hookDetectionRunRef.current = true;

    try {
      const linesForHook = lines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({
          text: l.text,
          start: Number(l.start ?? 0),
          end: Number(l.end ?? 0),
        }));

      const { data: hookResult, error } = await invokeWithTimeout(
        "detect-hooks",
        {
          lyrics: linesForHook.map((l: { text: string }) => l.text).join("\n"),
          lines: linesForHook,
          words,
          beatGrid: beatGrid
            ? {
                bpm: beatGrid.bpm,
                beats: beatGrid.beats,
                confidence: beatGrid.confidence,
              }
            : { bpm: 120, beats: [], confidence: 0 },
          beatEnergies: beatGrid?.beatEnergies ?? undefined,
          durationSec: audioDurationSec,
        },
        30_000,
      );

      if (error) throw error;
      if (!hookResult?.hook) return;

      setRenderData((prev: any) => {
        const updated = {
          ...(prev || {}),
          hook: hookResult.hook,
          secondHook: hookResult.secondHook || null,
          hookLabel: hookResult.hookLabel || "Hook 1",
          secondHookLabel: hookResult.secondHookLabel || "Hook 2",
          hookJustification: hookResult.hookJustification || null,
          secondHookJustification: hookResult.secondHookJustification || null,
        };
        if (savedIdRef.current) {
          persistQueue.enqueue({
            table: "saved_lyrics",
            id: savedIdRef.current,
            payload: { render_data: updated },
          });
        }
        return updated;
      });
    } catch (err: any) {}
  }, [
    words,
    lines,
    beatGrid,
    audioDurationSec,
    renderData?.hook,
    hottestHooksEnabled,
  ]);

  const startCinematicDirection = useCallback(
    async (sourceLines: LyricLine[], force = false) => {
      if (!lyricData || !sourceLines.length) return;
      {
        if (
          !force &&
          (generationStatusRef.current.cinematicDirection === "running" ||
            generationStatusRef.current.cinematicDirection === "done")
        )
          return;
      }

      setGenerationStatus((prev) => ({
        ...prev,
        cinematicDirection: "running",
        sectionImages: "idle",
      }));
      setPipelineStages((prev) => ({ ...prev, cinematic: "running" }));

      try {
        const lyricsForDirection = sourceLines
          .filter((l: any) => l.tag !== "adlib")
          .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

        const sharedBody = {
          title: lyricData.title,
          artist: artistNameRef.current,
          lines: lyricsForDirection,
          lyrics: lyricsForDirection
            .map((line: { text: string }) => line.text)
            .join("\n"),
          beatGrid: beatGrid
            ? {
                bpm: beatGrid.bpm,
                beats: beatGrid.beats,
                confidence: beatGrid.confidence,
              }
            : undefined,
          beatGridSummary: beatGrid
            ? {
                bpm: beatGrid.bpm,
                confidence: beatGrid.confidence,
                totalBeats: beatGrid.beats.length,
              }
            : undefined,
          lyricId: savedIdRef.current || undefined,
          artist_direction: sceneDescription?.trim() || undefined,
        };

        const { data: sceneResult } = await invokeWithTimeout(
          "cinematic-direction",
          { ...sharedBody, mode: "scene" },
          120_000,
        );

        if (!sceneResult?.cinematicDirection) {
          throw new Error("Scene direction returned no data");
        }

        const sceneDirection = sceneResult.cinematicDirection;
        const sceneMeta = sceneResult._meta || null;

        if (!mountedRef.current) return;

        const enrichedScene = {
          ...(beatGrid
            ? { ...sceneDirection, beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence } }
            : { ...sceneDirection }),
          _artistDirection: sceneDescription?.trim() || undefined,
          _meta: { scene: sceneMeta },
        };

        setCinematicDirection(enrichedScene);

        {
          const updatedRenderData = {
            ...(renderData || {}),
            cinematicDirection: enrichedScene,
            cinematic_direction: enrichedScene,
            description: enrichedScene.description,
            mood: enrichedScene.mood,
            meaning: enrichedScene.meaning,
          };
          setRenderData(updatedRenderData);
          if (savedIdRef.current) {
            persistQueue.enqueue({
              table: "saved_lyrics",
              id: savedIdRef.current,
              payload: {
                render_data: updatedRenderData,
              },
            });
          }
        }

        const { deriveFrameState } = await import("@/engine/presetDerivation");
        const { getTypography } = await import("@/engine/presetDerivation");
        const typoPreset = enrichedScene.typography || "clean-modern";
        getTypography(typoPreset);
        deriveFrameState(enrichedScene, 0, 0.5);

        const wordPromise = (async () => {
          if (!mountedRef.current) return;

          try {
            const { data: wordResult } = await invokeWithTimeout(
              "cinematic-direction",
              {
                ...sharedBody,
                mode: "words",
                sceneDirection: enrichedScene,
                words: words ?? undefined,
              },
              120_000,
            );

            console.log('[Pipeline] Word mode response keys:', wordResult ? Object.keys(wordResult) : 'null', 'has cinematicDirection:', !!wordResult?.cinematicDirection, '_meta:', JSON.stringify(wordResult?._meta ?? 'MISSING'));
            if (wordResult?.cinematicDirection) {
              const { phrases, hookPhrase, chorusText } =
                wordResult.cinematicDirection;

              const wordMeta = wordResult._meta || null;
              console.log('[Pipeline] wordMeta:', JSON.stringify(wordMeta));
              const merged = {
                ...enrichedScene,
                phrases: phrases || [],
                hookPhrase: hookPhrase || undefined,
                chorusText: chorusText || undefined,
                _meta: { scene: enrichedScene._meta?.scene, words: wordMeta },
              };

              console.log('[Pipeline] Word mode SUCCESS:', phrases?.length, 'phrases, hookPhrase:', hookPhrase);
              setCinematicDirection(merged);
              cinematicDirectionRef.current = merged;

              if (savedIdRef.current) {
                setRenderData((prev: any) => {
                  const updated = {
                    ...(prev || {}),
                    cinematicDirection: merged,
                  };
                  persistQueue.enqueue({
                    table: "saved_lyrics",
                    id: savedIdRef.current!,
                    payload: {
                      render_data: updated,
                    },
                  });
                  return updated;
                });
              }

              // Persist merged data (with phrases + presentation modes) to shareable_lyric_dances
              // Without this, the player loads scene-only data and never sees word-level choreography.
              if (user) {
                const _slugify = (await import("@/lib/slugify")).slugify;
                const _artistSlug = _slugify(artistNameRef.current || "artist");
                const _songSlug = _slugify(lyricData?.title || "untitled");
                supabase
                  .from("shareable_lyric_dances" as any)
                  .update({ cinematic_direction: merged } as any)
                  .eq("artist_slug", _artistSlug)
                  .eq("song_slug", _songSlug)
                  .eq("user_id", user.id)
                  .then(({ error }) => {
                    if (error) console.warn('[Pipeline] Failed to persist word data to dance row:', error);
                    else console.log('[Pipeline] Persisted word-level data to shareable_lyric_dances');
                  });
              }
            }
          } catch (wordErr: any) {
            console.error('[Pipeline] Word mode FAILED:', wordErr);
            console.error('[Pipeline] Word error details:', wordErr?.message, wordErr?.status, typeof wordErr === 'string' ? wordErr : JSON.stringify(wordErr).slice(0, 500));
          }
        })();

        const imagePromise = (async () => {
          const dirSections = enrichedScene?.sections;
          if (!mountedRef.current) return;
          if (
            !Array.isArray(dirSections) ||
            dirSections.length === 0 ||
            !user
          ) {
            setSectionImageUrls([]);
            setSectionImageProgress(null);
            setSectionImageError(null);
            setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
            return;
          }

          const currentSavedImages = initialLyric?.section_images;
          if (
            Array.isArray(currentSavedImages) &&
            currentSavedImages.length > 0 &&
            currentSavedImages.some(Boolean)
          ) {
            setSectionImageUrls(currentSavedImages);
            setSectionImageProgress({
              done: currentSavedImages.filter(Boolean).length,
              total: currentSavedImages.length,
            });
            setSectionImageError(null);
            setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
            return;
          }

          setSectionImageError(null);
          setSectionImageProgress({ done: 0, total: dirSections.length });
          setGenerationStatus((prev) => ({
            ...prev,
            sectionImages: "running",
          }));
          setFitProgress((prev) => Math.max(prev, 85));

          try {
            await artistNameReadyRef.current;
            const songSlugVal = (await import("@/lib/slugify")).slugify(
              lyricData!.title || "untitled",
            );
            const artistSlugVal = (await import("@/lib/slugify")).slugify(
              artistNameRef.current || "artist",
            );

            let resolvedDanceId: string | null = null;
            const { data: existing }: any = await supabase
              .from("shareable_lyric_dances" as any)
              .select("id")
              .eq("user_id", user.id)
              .eq("song_slug", songSlugVal)
              .maybeSingle();
            if (existing?.id) {
              resolvedDanceId = existing.id;
              setPipelineDanceId(resolvedDanceId);
              setPipelineDanceUrl(
                `/${artistSlugVal}/${songSlugVal}/lyric-dance`,
              );
              await supabase
                .from("shareable_lyric_dances" as any)
                .update({ cinematic_direction: cinematicDirectionRef.current || enrichedScene } as any)
                .eq("id", resolvedDanceId);
            } else {
              const mainLines = lyricData!.lines.filter(
                (l: any) => l.tag !== "adlib",
              );
              const audioFileName = audioFile?.name || "audio.webm";
              const storagePath = savedIdRef.current
                ? (await import("@/lib/audioStoragePath")).getAudioStoragePath(
                    user.id,
                    savedIdRef.current,
                    audioFileName,
                  )
                : `${user.id}/${artistSlugVal}/${songSlugVal}/lyric-dance.${audioFileName.split(".").pop() || "webm"}`;
              if (audioFile) {
                await supabase.storage
                  .from("audio-clips")
                  .upload(storagePath, audioFile, {
                    upsert: true,
                    contentType: audioFile.type || undefined,
                  });
              }
              const { data: urlData } = supabase.storage
                .from("audio-clips")
                .getPublicUrl(storagePath);

              await supabase.from("shareable_lyric_dances" as any).upsert(
                {
                  user_id: user.id,
                  artist_slug: artistSlugVal,
                  song_slug: songSlugVal,
                  artist_name: artistNameRef.current || "artist",
                  song_name: lyricData!.title || "Untitled",
                  audio_url: urlData.publicUrl,
                  lyrics: mainLines,
                  cinematic_direction: cinematicDirectionRef.current || enrichedScene,
                  words: words ?? null,
                  beat_grid: beatGrid
                    ? {
                        bpm: beatGrid.bpm,
                        beats: beatGrid.beats,
                        confidence: beatGrid.confidence,
                      }
                    : { bpm: 0, beats: [], confidence: 0 },
                  palette: derivePaletteFromDirection(enrichedScene),
                  section_images: null,
                } as any,
                { onConflict: "artist_slug,song_slug" },
              );

              const { data: newRow }: any = await supabase
                .from("shareable_lyric_dances" as any)
                .select("id")
                .eq("artist_slug", artistSlugVal)
                .eq("song_slug", songSlugVal)
                .maybeSingle();
              resolvedDanceId = newRow?.id ?? null;
              if (resolvedDanceId) {
                setPipelineDanceId(resolvedDanceId);
                setPipelineDanceUrl(
                  `/${artistSlugVal}/${songSlugVal}/lyric-dance`,
                );
              }
            }

            if (!resolvedDanceId) {
              console.error(
                "[Pipeline] Could not create dance row for image generation",
              );
              setSectionImageError("Could not create dance row for image generation");
              setGenerationStatus((prev) => ({
                ...prev,
                sectionImages: "error",
              }));
              return;
            }

            const { data: result, error } = await invokeWithTimeout(
              "generate-section-images",
              {
                lyric_dance_id: resolvedDanceId,
                saved_lyric_id: savedIdRef.current ?? undefined,
                force: true,
              },
              90_000,
            );
            if (error) throw error;
            const urls: (string | null)[] =
              result?.urls || result?.section_images || [];
            const allComplete = result?.success === true || urls.every(Boolean);
            setSectionImageUrls(urls);
            setSectionImageProgress({
              done: urls.filter(Boolean).length,
              total: dirSections.length,
            });
            setSectionImageError(
              allComplete ? null : `${urls.filter(Boolean).length}/${dirSections.length} images generated`,
            );
            setGenerationStatus((prev) => ({
              ...prev,
              sectionImages: allComplete ? "done" : "error",
            }));
          } catch (imgErr: any) {
            console.error(
              "[Pipeline] Image generation failed:",
              imgErr?.message || imgErr,
            );
            setSectionImageError(imgErr?.message || "Failed to generate section images");
            setGenerationStatus((prev) => ({
              ...prev,
              sectionImages: "error",
            }));
          }
        })();

        await Promise.allSettled([wordPromise, imagePromise]);

        if (!mountedRef.current) return;
        setGenerationStatus((prev) => ({
          ...prev,
          cinematicDirection: "done",
        }));
        setPipelineStages((prev) => ({ ...prev, cinematic: "done" }));
        setFitProgress((prev) => Math.max(prev, 85));
      } catch (err) {
        console.error("[Pipeline] Cinematic direction failed:", err);
        setGenerationStatus((prev) => ({
          ...prev,
          cinematicDirection: "error",
          sectionImages: "idle",
        }));
      }
    },
    [
      lyricData,
      beatGrid,
      renderData,
      words,
      user,
      audioFile,
      initialLyric,
      sceneDescription,
    ],
  );

  const scheduler = usePipelineScheduler({
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
    setRenderData,
    setCinematicDirection,
    setSectionImageUrls,
    setSectionImageProgress,
    setSectionImageError,
    setPipelineDanceId,
    setPipelineDanceUrl,
    startCinematicDirection,
    startHookDetection,
  });

  const {
    generationStatus,
    setGenerationStatus,
    fitReadiness,
    setFitReadiness,
    fitProgress,
    setFitProgress,
    fitStageLabel,
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
  } = scheduler;
  generationStatusRef.current = generationStatus;

  const startBeatAnalysis = useCallback(
    async (targetAudioFile: File) => {
      if (!targetAudioFile || targetAudioFile.size === 0) return;

      if (beatGrid) {
        setBeatGridDone(true);
        setGenerationStatus((prev) =>
          prev.beatGrid === "done" ? prev : { ...prev, beatGrid: "done" },
        );
        return;
      }
      if (
        generationStatus.beatGrid === "running" ||
        generationStatus.beatGrid === "done"
      )
        return;

      setGenerationStatus((prev) => ({ ...prev, beatGrid: "running" }));
      setPipelineStages((prev) => ({ ...prev, rhythm: "running" }));
    },
    [beatGrid, generationStatus.beatGrid, setGenerationStatus, setPipelineStages],
  );

  const handleAudioSubmitted = useCallback(
    (file: File) => {
      setPipelineStages((prev) => ({ ...prev, transcript: "running" }));
      startBeatAnalysis(file);
    },
    [startBeatAnalysis, setPipelineStages],
  );

  const fitDisabled = !transcriptionDone;

  const resetProject = useCallback(() => {
    setRenderData(null);
    setBeatGrid(null);
    setCinematicDirection(null);
    setLines([]);
    setAudioBuffer(null);
    setWaveformData(null);
    setTranscriptionDone(false);
    setBeatGridDone(false);
    setGenerationStatus({
      beatGrid: "idle",
      renderData: "done",
      cinematicDirection: "idle",
      sectionImages: "idle",
    });
    setSectionImageUrls([]);
    setSectionImageProgress(null);
    setSectionImageError(null);
    setFitReadiness("not_started");
    setFitUnlocked(false);
    setPipelineDanceId(null);
    setPipelineDanceUrl(null);
    claimPublishedRef.current = false;
    cinematicTriggeredRef.current = false;
    pipelineTriggeredRef.current = false;
    hookDetectionRunRef.current = false;
    onNewProject?.();
  }, [onNewProject, setFitReadiness, setFitUnlocked, setGenerationStatus]);

  const pipelineCompat = useMemo(
    () =>
      ({
        retryImages: async () => retryGeneration(),
        setSectionImageUrls,
        setSectionImageProgress,
        setGenerationStatus,
      }) as unknown as UseLyricPipelineReturn,
    [
      retryGeneration,
      setSectionImageUrls,
      setSectionImageProgress,
      setGenerationStatus,
    ],
  );

  return {
    lyricData,
    setLyricData,
    audioFile,
    setAudioFile,
    hasRealAudio,
    setHasRealAudio,
    savedId,
    setSavedId,
    lines,
    setLines,
    fmlyLines,
    setFmlyLines,
    versionMeta,
    setVersionMeta,
    words,
    setWords,
    renderData,
    setRenderData,
    beatGrid,
    setBeatGrid,
    cinematicDirection,
    setCinematicDirection,
    pipelineDanceId,
    setPipelineDanceId,
    pipelineDanceUrl,
    setPipelineDanceUrl,
    sectionImageUrls,
    setSectionImageUrls,
    sectionImageProgress,
    setSectionImageProgress,
    sectionImageError,
    setSectionImageError,
    audioBuffer,
    setAudioBuffer,
    waveformData,
    setWaveformData,
    transcriptionDone,
    beatGridDone,
    generationStatus,
    setGenerationStatus,
    fitReadiness,
    fitProgress,
    setFitProgress,
    fitStageLabel,
    pipelineStages,
    setPipelineStages,
    fitUnlocked,
    fitDisabled,
    pipelineRetryCount,
    handleAudioSubmitted,
    handleTitleChange,
    handleImageGenerationStatusChange,
    handleSectionImagesGenerated,
    handleSectionImagesError,
    retryGeneration,
    resetProject,
    pipelineCompat,
    savedIdRef,
  };
}
