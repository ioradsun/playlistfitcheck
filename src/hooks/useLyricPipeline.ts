import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type React from "react";
import { supabase } from "@/integrations/supabase/client";
import { persistQueue } from "@/lib/persistQueue";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
import { getCachedAudioBuffer } from "@/lib/audioDecodeCache";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";
import { derivePaletteFromDirection } from "@/lib/lyricPalette";
import { extractPeaks } from "@/lib/audioUtils";
import { buildPhrases } from "@/lib/phraseEngine";
import type { LyricData, LyricLine } from "@/components/lyric/LyricDisplay";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { FilmMode } from "@/components/lyric/LyricFitTab";

export type FitReadiness = "not_started" | "running" | "ready" | "error";
export type PipelineStageStatus = "pending" | "running" | "done" | "error";
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
  filmMode: FilmMode;
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
  runIdRef: React.MutableRefObject<number>;
  lastCompletedRunIdRef: React.MutableRefObject<number>;

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

async function createDanceRowAndGenerateImages({
  user,
  audioFile,
  lyricData,
  artistNameRef,
  savedIdRef,
  beatGrid,
  cinematicDirection,
  words,
  renderData: _renderData,
  audioDurationSec,
  setPipelineDanceId,
  setPipelineDanceUrl,
  setGenerationStatus,
  setSectionImageUrls,
  setSectionImageProgress,
  isInstrumental = false,
}: {
  user: { id: string } | null;
  audioFile: File | null;
  lyricData: LyricData | null;
  artistNameRef: React.MutableRefObject<string>;
  savedIdRef: React.MutableRefObject<string | null>;
  beatGrid: BeatGridData | null;
  cinematicDirection: any;
  words: Array<{ word: string; start: number; end: number }> | null;
  renderData: any | null;
  audioDurationSec: number;
  setPipelineDanceId: React.Dispatch<React.SetStateAction<string | null>>;
  setPipelineDanceUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setGenerationStatus: React.Dispatch<React.SetStateAction<GenerationStatus>>;
  setSectionImageUrls: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  setSectionImageProgress: React.Dispatch<
    React.SetStateAction<{ done: number; total: number } | null>
  >;
  isInstrumental?: boolean;
}) {
  if (!user || !audioFile) {
    setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
    return {
      resolvedDanceId: null,
      artistSlugVal: null,
      songSlugVal: null,
      allComplete: true,
      generatedCount: 0,
      total: 0,
    };
  }

  const dirSections = cinematicDirection?.sections;
  if (!Array.isArray(dirSections) || dirSections.length === 0) {
    setSectionImageUrls([]);
    setSectionImageProgress(null);
    setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
    return {
      resolvedDanceId: null,
      artistSlugVal: null,
      songSlugVal: null,
      allComplete: true,
      generatedCount: 0,
      total: 0,
    };
  }

  const { slugify } = await import("@/lib/slugify");
  const songSlugVal = slugify(lyricData?.title || "untitled");
  const artistSlugVal = slugify(artistNameRef.current || "artist");

  let resolvedDanceId: string | null = null;
  const { data: existing }: any = await supabase
    .from("lyric_projects" as any)
    .select("id")
    .eq("user_id", user.id)
    .eq("url_slug", songSlugVal)
    .maybeSingle();

  if (existing?.id) {
    resolvedDanceId = existing.id;
    await supabase
      .from("lyric_projects" as any)
      .update({
        cinematic_direction: cinematicDirection,
        ...(beatGrid
          ? {
              beat_grid: {
                bpm: beatGrid.bpm,
                beats: beatGrid.beats,
                confidence: beatGrid.confidence,
                _duration: isInstrumental ? audioDurationSec || undefined : undefined,
              },
            }
          : {}),
      } as any)
      .eq("id", resolvedDanceId);
  } else {
    const audioFileName = audioFile.name || "audio.webm";
    const storagePath = savedIdRef.current
      ? (await import("@/lib/audioStoragePath")).getAudioStoragePath(
          user.id,
          savedIdRef.current,
          audioFileName,
        )
      : `${user.id}/${artistSlugVal}/${songSlugVal}/lyric-dance.${audioFileName.split(".").pop() || "webm"}`;
    await supabase.storage
      .from("audio-clips")
      .upload(storagePath, audioFile, {
        upsert: true,
        contentType: audioFile.type || undefined,
      });
    const { data: urlData } = supabase.storage
      .from("audio-clips")
      .getPublicUrl(storagePath);

    const { data: insertedRow } = await supabase.from("lyric_projects" as any).insert(
      {
        user_id: user.id,
        artist_slug: artistSlugVal,
        url_slug: songSlugVal,
        artist_name: artistNameRef.current || "artist",
        title: lyricData?.title || "Untitled",
        audio_url: urlData.publicUrl,
        lines: isInstrumental
          ? []
          : (lyricData?.lines || []).filter((l: any) => l.tag !== "adlib"),
        cinematic_direction: cinematicDirection,
        words: isInstrumental ? null : words ?? null,
        beat_grid: beatGrid
          ? {
              bpm: beatGrid.bpm,
              beats: beatGrid.beats,
              confidence: beatGrid.confidence,
              _duration: isInstrumental ? audioDurationSec || undefined : undefined,
            }
          : { bpm: 0, beats: [], confidence: 0 },
        palette: derivePaletteFromDirection(cinematicDirection),
        section_images: null,
        ...(isInstrumental ? {} : { is_published: true }),
      } as any,
    ).select("id").maybeSingle();

    resolvedDanceId = (insertedRow as any)?.id ?? null;
  }

  if (!resolvedDanceId) {
    setGenerationStatus((prev) => ({ ...prev, sectionImages: "error" }));
    return {
      resolvedDanceId: null,
      artistSlugVal,
      songSlugVal,
      allComplete: false,
      generatedCount: 0,
      total: dirSections.length,
    };
  }

  setPipelineDanceId(resolvedDanceId);
  setPipelineDanceUrl(`/${artistSlugVal}/${songSlugVal}/lyric-dance`);
  setGenerationStatus((prev) => ({ ...prev, sectionImages: "running" }));
  setSectionImageProgress({ done: 0, total: dirSections.length });

  const { data: result, error } = await invokeWithTimeout(
    "generate-section-images",
    {
      project_id: resolvedDanceId,
      force: true,
    },
    90_000,
  );
  if (error) throw error;

  const urls: (string | null)[] = result?.urls || result?.section_images || [];
  const allComplete = result?.success === true || urls.every(Boolean);
  setSectionImageUrls(urls);
  setSectionImageProgress({
    done: urls.filter(Boolean).length,
    total: dirSections.length,
  });
  setGenerationStatus((prev) => ({
    ...prev,
    sectionImages: allComplete ? "done" : "error",
  }));
  return {
    resolvedDanceId,
    artistSlugVal,
    songSlugVal,
    allComplete,
    generatedCount: urls.filter(Boolean).length,
    total: dirSections.length,
  };
}

export function usePipelineScheduler({
  initialLyric,
  filmMode,
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
  runIdRef,
  lastCompletedRunIdRef,
  startCinematicDirection,
  startHookDetection,
}: UsePipelineSchedulerParams): UsePipelineSchedulerReturn {
  const isBeatProject = (() => {
    if (filmMode === "beat") return true;
    if (!initialLyric) return false;
    const rd = (initialLyric as any).render_data;
    const cd =
      (initialLyric as any).cinematic_direction ||
      rd?.cinematicDirection ||
      rd?.cinematic_direction;
    if (cd?._instrumental === true) return true;
    return !!(
      (initialLyric as any).beat_grid &&
      Array.isArray((initialLyric as any).lines) &&
      (initialLyric as any).lines.length === 0
    );
  })();

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
    transcript: isBeatProject ? "done" : "pending",
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
  const imageSelfHealRef = useRef(false);

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
    if (imageSelfHealRef.current) return;
    if (generationStatus.cinematicDirection !== "done") return;
    if (runIdRef.current !== lastCompletedRunIdRef.current) return;
    if (generationStatus.sectionImages !== "idle") return;
    if (!cinematicDirection || !lines?.length) return;
    const sections = (cinematicDirection as any)?.sections;
    if (!Array.isArray(sections) || sections.length === 0) return;

    imageSelfHealRef.current = true;
    setGenerationStatus((prev) => ({ ...prev, cinematicDirection: "idle" }));
    cinematicTriggeredRef.current = false;
  }, [
    generationStatus.cinematicDirection,
    generationStatus.sectionImages,
    cinematicDirection,
    lines,
    runIdRef,
    lastCompletedRunIdRef,
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
            table: "lyric_projects",
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
        table: "lyric_projects",
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
  filmMode?: FilmMode;
}

export function useLyricPipeline({
  initialLyric,
  user,
  siteCopy,
  sceneDescription,
  onNewProject,
  claimMeta = null,
  onClaimPublished,
  filmMode = "song",
}: UseLyricPipelineParams) {
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
  const [spotifyTrackId, setSpotifyTrackId] = useState<string | null>(
    initialLyric?.spotify_track_id ?? null,
  );

  const [renderData, setRenderData] = useState<any | null>(null);
  const renderDataRef = useRef<any | null>(null);
  renderDataRef.current = renderData;
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(
    null,
  );
  const phraseResultRef = useRef<ReturnType<typeof buildPhrases> | null>(null);
  const [pipelineDanceId, setPipelineDanceId] = useState<string | null>(
    (initialLyric as any)?.render_data?.pipelineDanceId
    ?? ((initialLyric as any)?.is_published === true ? ((initialLyric as any)?.id as string | null) : null),
  );
  const [pipelineDanceUrl, setPipelineDanceUrl] = useState<string | null>(
    (initialLyric as any)?.render_data?.pipelineDanceUrl
    ?? ((initialLyric as any)?.is_published === true && (initialLyric as any)?.artist_slug && (initialLyric as any)?.url_slug
        ? `/${(initialLyric as any).artist_slug}/${(initialLyric as any).url_slug}/lyric-dance`
        : null),
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
  const runIdRef = useRef(0);
  const lastCompletedRunIdRef = useRef(0);

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
  const {
    beatGrid: detectedGrid,
    error: beatGridError,
  } = useBeatGrid(beatGrid ? null : audioBuffer);

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
    setTranscriptionDone(filmMode === "beat" ? true : timestampedLines.length > 0);
  }, [filmMode, timestampedLines]);

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
        table: "lyric_projects",
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

  // Beat grid error propagation & cascade are declared after scheduler
  // destructuring below (lines ~1467+) to avoid block-scoped TDZ errors.

  useEffect(() => {
    if (!words?.length) {
      phraseResultRef.current = null;
      return;
    }

    const phraseResult = buildPhrases(words);
    phraseResultRef.current = phraseResult;

    setCinematicDirection((prev: any) => ({
      ...(prev || {}),
      phrases: phraseResult.phrases,
      hookPhrase: phraseResult.hookPhrase,
      _phraseSource: "client_v1",
    }));
  }, [words]);

  const allAnalysisLoaded = !!(beatGrid && cinematicDirection);
  useEffect(() => {
    if (audioBuffer || !audioFile || audioFile.size === 0) return;
    if (allAnalysisLoaded) {
      return;
    }
    if (!transcriptionDone && filmMode !== "beat") return;

    let cancelled = false;
    getCachedAudioBuffer(audioFile)
      .then((buf) => {
        if (!cancelled) {
          setAudioBuffer(buf);
          setWaveformData({ peaks: extractPeaks(buf), duration: buf.duration });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [audioFile, audioBuffer, allAnalysisLoaded, transcriptionDone, filmMode]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setLyricData((prev) => prev ? { ...prev, title: newTitle } : prev);
    const id = savedIdRef.current;
    if (id) {
      persistQueue.enqueue({
        table: "lyric_projects",
        id,
        payload: { title: newTitle },
      });
      window.dispatchEvent(
        new CustomEvent("project-renamed", { detail: { id, label: newTitle } }),
      );
      // Patch the project-level cache so the new title survives page reloads
      // (e.g. after code deploys). Without this the pipeline re-initialises from
      // stale cache and the rename visually reverts.
      try {
        const cacheKey = `tfm:lyric:${id}`;
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data) {
            parsed.data.title = newTitle;
            localStorage.setItem(cacheKey, JSON.stringify(parsed));
          }
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    savedIdRef.current = savedId;
  }, [savedId]);

  // ── Effect A (hydratedRef gate) ─────────────────────────────────────────────
  // Owns: waveformData (from render_data peaks), fitReadiness initial value
  // (via generationStatus seed only), fitUnlocked initial value (derived), audio fetch.
  // Uses hydratedRef so these side-effects fire exactly once.
  // Audio fetching in particular must never re-run on prop changes.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialLyric || hydratedRef.current) return;
    hydratedRef.current = true;

    const filename = initialLyric.filename || "saved-lyrics.mp3";

    // Waveform peaks — UI optimisation, read once from render_data
    const loadedRenderData = (initialLyric as any).render_data ?? null;
    if (loadedRenderData) {
      renderDataLoadedFromDbRef.current = true;
      const savedPeaks = (loadedRenderData as any)?.waveformPeaks;
      const savedDuration = (loadedRenderData as any)?.waveformDuration;
      if (Array.isArray(savedPeaks) && savedPeaks.length > 0 && savedDuration > 0) {
        setWaveformData({ peaks: savedPeaks, duration: savedDuration });
      }
    }

    // Initial generation status seed — single source of truth for readiness/progress.
    const savedBg = (initialLyric as any).beat_grid;
    const loadedCinematicDirection =
      (initialLyric as any).cinematic_direction ??
      (loadedRenderData as any)?.cinematicDirection ??
      (loadedRenderData as any)?.cinematic_direction ??
      null;

    if (savedBg && loadedCinematicDirection) {
      pipelineTriggeredRef.current = true;
      const sections = loadedCinematicDirection.sections;
      const savedSectionImages = (initialLyric as any).section_images;
      const hasSections = Array.isArray(sections) && sections.length > 0;
      const hasImages = Array.isArray(savedSectionImages) && savedSectionImages.some(Boolean);
      if (!hasSections || hasImages) {
        setGenerationStatus((prev) => ({
          ...prev,
          beatGrid: "done",
          renderData: "done",
          cinematicDirection: "done",
          sectionImages: "done",
        }));
      } else {
        setGenerationStatus((prev) => ({
          ...prev,
          beatGrid: "done",
          renderData: "done",
          cinematicDirection: "done",
          sectionImages: "running",
        }));
      }

      import("@/engine/presetDerivation").then(({ deriveFrameState, getTypography }) => {
        const typoPreset = loadedCinematicDirection.typography || "clean-modern";
        getTypography(typoPreset);
        deriveFrameState(loadedCinematicDirection, 0, 0.5);
      });
    }

    // Audio — must never re-run; re-fetching on prop change would be catastrophic
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

  // ── Effect B (reactive sync) ────────────────────────────────────────────────
  // Owns: transcriptionDone, beatGrid, renderData, cinematicDirection, sectionImages.
  // Runs whenever initialLyric prop changes — safe because every setter uses
  // (prev) => prev ?? incoming, so existing pipeline state always wins.
  // This means: sidebar rawData load (possibly missing fields) triggers mount,
  // then URL-loader revalidation arrives with the full row and this effect
  // fills in any gaps without clobbering anything the user has touched.
  useEffect(() => {
    if (!initialLyric) return;

    // transcriptionDone — once true, stays true
    const hasLines = Array.isArray(initialLyric.lines) && initialLyric.lines.length > 0;
    if (hasLines) setTranscriptionDone((prev) => prev || true);

    // beatGrid
    const savedBg = (initialLyric as any).beat_grid;
    if (savedBg) {
      setBeatGrid((prev) => prev ?? savedBg);
      setBeatGridDone((prev) => prev || true);
      setGenerationStatus((prev) =>
        prev.beatGrid === "done" ? prev : { ...prev, beatGrid: "done" }
      );
    }

    // renderData
    const loadedRenderData = (initialLyric as any).render_data ?? null;
    if (loadedRenderData) {
      setRenderData((prev: any) => prev ?? loadedRenderData);
      setGenerationStatus((prev) =>
        prev.renderData === "done" ? prev : { ...prev, renderData: "done" }
      );
    }

    // cinematicDirection
    const loadedCinematicDirection =
      (initialLyric as any).cinematic_direction ??
      (loadedRenderData as any)?.cinematicDirection ??
      (loadedRenderData as any)?.cinematic_direction ??
      null;
    if (loadedCinematicDirection) {
      setCinematicDirection((prev: any) => prev ?? loadedCinematicDirection);
      setGenerationStatus((prev) =>
        prev.cinematicDirection === "done" ? prev : { ...prev, cinematicDirection: "done" }
      );
    }

    // sectionImages
    const savedSectionImages = (initialLyric as any).section_images;
    if (Array.isArray(savedSectionImages) && savedSectionImages.length > 0 && savedSectionImages.some(Boolean)) {
      setSectionImageUrls((prev) => (prev.some(Boolean) ? prev : savedSectionImages));
      setSectionImageProgress((prev) =>
        prev ?? {
          done: savedSectionImages.filter(Boolean).length,
          total: savedSectionImages.length,
        }
      );
      setSectionImageError(null);
      setGenerationStatus((prev) =>
        prev.sectionImages === "done" ? prev : { ...prev, sectionImages: "done" }
      );
    }
  }, [initialLyric]);

  const danceIdLookedUpRef = useRef(!!pipelineDanceId);
  useEffect(() => {
    if (danceIdLookedUpRef.current || pipelineDanceId) return;
    if (!user || !initialLyric || !cinematicDirection) return;
    danceIdLookedUpRef.current = true;

    const storedUrlSlug = (initialLyric as any)?.url_slug;
    const storedArtistSlug = (initialLyric as any)?.artist_slug;

    void (async () => {
      let query = supabase
        .from("lyric_projects")
        .select("id, artist_slug, url_slug")
        .eq("user_id", user.id)
        .eq("is_published", true);

      if (storedUrlSlug && storedArtistSlug) {
        query = query.eq("artist_slug", storedArtistSlug).eq("url_slug", storedUrlSlug);
      } else {
        const { slugify } = await import("@/lib/slugify");
        const s = slugify(initialLyric.title || "untitled");
        query = query.eq("url_slug", s);
      }

      const { data: d }: any = await query.maybeSingle();
      if (d) {
        setPipelineDanceId(d.id);
        setPipelineDanceUrl(`/${d.artist_slug}/${d.url_slug}/lyric-dance`);
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

        // Check-then-act: partial unique index prevents standard upsert
        const { data: existingClaim }: any = await supabase
          .from("lyric_projects" as any)
          .select("id")
          .eq("artist_slug", claimMeta.artistSlug)
          .eq("url_slug", claimMeta.songSlug)
          .maybeSingle();

        let danceErr: any = null;
        let danceRow: { id: string } | null = null;

        if (existingClaim?.id) {
          const { error } = await supabase
            .from("lyric_projects" as any)
            .update({
              user_id: user?.id ?? null,
              artist_name: claimMeta.artistName,
              title: claimMeta.songName,
              audio_url: audioStorageUrl,
              lines: lines.map((l: any) => ({
                start: l.start, end: l.end, text: l.text, tag: l.tag ?? "main",
              })),
              words: words?.length ? words : null,
              cinematic_direction: cinematicDirection,
              beat_grid: beatGrid ?? { bpm: 120, beats: [], confidence: 0 },
              palette: cinematicDirection?.defaults?.palette ?? ["#ffffff", "#a855f7", "#ec4899"],
              section_images: null,
              auto_palettes: null,
              album_art_url: claimMeta.albumArtUrl,
              is_published: true,
            } as any)
            .eq("id", existingClaim.id);
          danceErr = error;
          danceRow = existingClaim;
        } else {
          const { data: inserted, error } = await supabase
            .from("lyric_projects" as any)
            .insert({
              user_id: user?.id ?? null,
              artist_slug: claimMeta.artistSlug,
              url_slug: claimMeta.songSlug,
              artist_name: claimMeta.artistName,
              title: claimMeta.songName,
              audio_url: audioStorageUrl,
              lines: lines.map((l: any) => ({
                start: l.start, end: l.end, text: l.text, tag: l.tag ?? "main",
              })),
              words: words?.length ? words : null,
              cinematic_direction: cinematicDirection,
              beat_grid: beatGrid ?? { bpm: 120, beats: [], confidence: 0 },
              palette: cinematicDirection?.defaults?.palette ?? ["#ffffff", "#a855f7", "#ec4899"],
              section_images: null,
              auto_palettes: null,
              album_art_url: claimMeta.albumArtUrl,
              is_published: true,
            } as any)
            .select("id")
            .maybeSingle();
          danceErr = error;
          danceRow = inserted as any;
        }

        if (danceErr) {
          console.error("[ClaimPublish] Insert/update failed:", danceErr);
          claimPublishedRef.current = false;
          return;
        }

        const lyricDanceUrl = `/${claimMeta.artistSlug}/${claimMeta.songSlug}/lyric-dance`;

        await supabase
          .from("artist_lyric_videos" as any)
          .upsert({
            ghost_profile_id: claimMeta.ghostProfileId,
            user_id: user?.id ?? null,
            spotify_track_id: claimMeta.spotifyTrackId,
            title: claimMeta.songName,
            artist_name: claimMeta.artistName,
            album_art_url: claimMeta.albumArtUrl,
            preview_url: audioStorageUrl,
                        project_id: danceRow?.id ?? null,
          }, { onConflict: "ghost_profile_id,spotify_track_id" });

        if (danceRow?.id) {
          supabase.functions
            .invoke("generate-section-images", {
              body: { project_id: danceRow.id },
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
      persistQueue.enqueue({ table: "lyric_projects", id, payload: { render_data: payload } });
    }, 1500);
    return () => clearTimeout(timer);
  }, [renderData, cinematicDirection]);

  useEffect(() => {
    const id = savedIdRef.current;
    if (!id) return;
    if (!pipelineDanceId && !pipelineDanceUrl) return;
    persistQueue.enqueue({
      table: "lyric_projects",
      id,
      payload: {
        render_data: {
          ...(renderDataRef.current || {}),
          ...(pipelineDanceId ? { pipelineDanceId } : {}),
          ...(pipelineDanceUrl ? { pipelineDanceUrl } : {}),
        },
      },
    });
  }, [pipelineDanceId, pipelineDanceUrl]);

  const hookDetectionRunRef = useRef(false);
  const startHookDetection = useCallback(async () => {
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
            table: "lyric_projects",
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
  ]);

  const startCinematicDirection = useCallback(
    async (sourceLines: LyricLine[], force = false) => {
      if (!lyricData || !sourceLines.length) return;
      const myRunId = ++runIdRef.current;
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
        if (myRunId !== runIdRef.current) return;

        if (!sceneResult?.cinematicDirection) {
          throw new Error("Scene direction returned no data");
        }

        const sceneDirection = sceneResult.cinematicDirection;
        const sceneMeta = sceneResult._meta || null;

        if (!mountedRef.current) return;

        const phraseResult = phraseResultRef.current ?? (words?.length ? buildPhrases(words) : null);
        const enrichedScene = {
          ...(beatGrid
            ? { ...sceneDirection, beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence } }
            : { ...sceneDirection }),
          phrases: phraseResult?.phrases ?? [],
          hookPhrase: phraseResult?.hookPhrase || undefined,
          _phraseSource: "client_v1",
          _artistDirection: sceneDescription?.trim() || undefined,
          _meta: { scene: sceneMeta },
        };

        setCinematicDirection(enrichedScene);
        cinematicDirectionRef.current = enrichedScene;

        {
          setRenderData((prev: any) => {
            const updatedRenderData = {
              ...(prev || {}),
              cinematicDirection: enrichedScene,
              cinematic_direction: enrichedScene,
              description: enrichedScene.description,
              mood: enrichedScene.mood,
              meaning: enrichedScene.meaning,
            };
            if (savedIdRef.current) {
              persistQueue.enqueue({
                table: "lyric_projects",
                id: savedIdRef.current,
                payload: {
                  render_data: updatedRenderData,
                },
              });
            }
            return updatedRenderData;
          });
        }

        const { deriveFrameState } = await import("@/engine/presetDerivation");
        const { getTypography } = await import("@/engine/presetDerivation");
        if (myRunId !== runIdRef.current) return;
        const typoPreset = enrichedScene.typography || "clean-modern";
        getTypography(typoPreset);
        deriveFrameState(enrichedScene, 0, 0.5);

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

          try {
            await artistNameReadyRef.current;
            if (myRunId !== runIdRef.current) return;
            const result = await createDanceRowAndGenerateImages({
              user,
              audioFile,
              lyricData,
              artistNameRef,
              savedIdRef,
              beatGrid,
              cinematicDirection: cinematicDirectionRef.current || enrichedScene,
              words,
              renderData,
              audioDurationSec,
              setPipelineDanceId,
              setPipelineDanceUrl,
              setGenerationStatus,
              setSectionImageUrls,
              setSectionImageProgress,
            });
            if (myRunId !== runIdRef.current) return;
            if (!result.resolvedDanceId) {
              console.error(
                "[Pipeline] Could not create dance row for image generation",
              );
              setSectionImageError("Could not create dance row for image generation");
              return;
            }
            setSectionImageError(
              result.allComplete
                ? null
                : `${result.generatedCount}/${result.total} images generated`,
            );
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

        await Promise.allSettled([imagePromise]);
        if (myRunId !== runIdRef.current) return;

        if (!mountedRef.current) return;
        setGenerationStatus((prev) => ({
          ...prev,
          cinematicDirection: "done",
          sectionImages: "done",
        }));
        setPipelineStages((prev) => ({ ...prev, cinematic: "done" }));
      } catch (err) {
        console.error("[Pipeline] Cinematic direction failed:", err);
        setGenerationStatus((prev) => ({
          ...prev,
          cinematicDirection: "error",
          sectionImages: "idle",
        }));
      } finally {
        if (runIdRef.current === myRunId) {
          lastCompletedRunIdRef.current = myRunId;
        }
      }
    },
    [
      lyricData,
      beatGrid,
      words,
      user,
      audioFile,
      initialLyric,
      sceneDescription,
      audioDurationSec,
    ],
  );

  const scheduler = usePipelineScheduler({
    initialLyric,
    filmMode,
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
    runIdRef,
    lastCompletedRunIdRef,
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

  // Beat grid error propagation — prevents infinite "running" state
  useEffect(() => {
    if (!beatGridError) return;
    if (generationStatus.beatGrid === "running") {
      setGenerationStatus((prev) => ({ ...prev, beatGrid: "error" }));
      setPipelineStages((prev) => ({ ...prev, rhythm: "error" }));
    }
  }, [beatGridError, generationStatus.beatGrid, setGenerationStatus, setPipelineStages]);

  // Cascade: if beat grid fails in beat mode, cinematic can't run either
  useEffect(() => {
    if (filmMode !== "beat") return;
    if (generationStatus.beatGrid !== "error") return;
    if (
      generationStatus.cinematicDirection !== "idle" &&
      generationStatus.cinematicDirection !== "running"
    )
      return;
    setGenerationStatus((prev) => ({ ...prev, cinematicDirection: "error" }));
    setPipelineStages((prev) => ({ ...prev, cinematic: "error" }));
  }, [
    filmMode,
    generationStatus.beatGrid,
    generationStatus.cinematicDirection,
    setGenerationStatus,
    setPipelineStages,
  ]);

  const startInstrumentalCinematic = useCallback(
    async (force = false) => {
      if (
        !force &&
        (generationStatusRef.current.cinematicDirection === "running" ||
          generationStatusRef.current.cinematicDirection === "done")
      ) return;
      if (!beatGrid) return;

      setGenerationStatus((prev) => ({
        ...prev,
        cinematicDirection: "running",
        sectionImages: "idle",
      }));
      setPipelineStages((prev) => ({ ...prev, cinematic: "running" }));

      try {
        let beats = beatGrid.beats;
        if (beats.length === 0 && beatGrid.bpm > 0) {
          const period = 60 / beatGrid.bpm;
          const phase = beatGrid._phase ?? 0;
          const dur = audioDurationSec || 60;
          const synthetic: number[] = [];
          for (let t = phase; t < dur; t += period) synthetic.push(t);
          beats = synthetic;
        }
        const maxSections = 8;
        const beatsPerSection = Math.max(16, Math.ceil(beats.length / maxSections));
        const sectionCount = Math.max(1, Math.ceil(beats.length / beatsPerSection));
        const audioSections = Array.from({ length: sectionCount }, (_, i) => {
          const startBeat = i * beatsPerSection;
          const endBeat = Math.min((i + 1) * beatsPerSection, beats.length) - 1;
          const startSec = beats[startBeat] ?? 0;
          const endSec = beats[endBeat] ?? (audioDurationSec || 60);
          const energySlice = beatGrid.beatEnergies?.slice(startBeat, endBeat + 1) ?? [];
          const avgEnergy = energySlice.length > 0
            ? energySlice.reduce((a, b) => a + b, 0) / energySlice.length
            : 0.5;
          return {
            index: i,
            startSec,
            endSec,
            role: i === 0 ? "intro" : i === sectionCount - 1 ? "outro" : "main",
            avgEnergy,
            beatDensity: beatsPerSection / Math.max(0.1, endSec - startSec),
            lyrics: [],
          };
        });

        const body = {
          title: lyricData?.title ?? "Untitled Beat",
          artist: artistNameRef.current,
          bpm: beatGrid.bpm,
          lines: [],
          lyrics: "",
          instrumental: true,
          audioSections,
          beatGrid: {
            bpm: beatGrid.bpm,
            beats: beatGrid.beats,
            confidence: beatGrid.confidence,
            _duration: audioDurationSec || undefined,
          },
          artist_direction: sceneDescription?.trim() || undefined,
          lyricId: savedIdRef.current || undefined,
        };

        const { data: sceneResult } = await invokeWithTimeout(
          "cinematic-direction",
          { ...body, mode: "scene" },
          120_000,
        );
        if (!sceneResult?.cinematicDirection) {
          throw new Error("Scene direction returned no data");
        }

        const enrichedScene = {
          ...sceneResult.cinematicDirection,
          beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence },
          phrases: [],
          _artistDirection: sceneDescription?.trim() || undefined,
          _instrumental: true,
          _meta: { scene: sceneResult._meta || null },
        };

        setCinematicDirection(enrichedScene);
        cinematicDirectionRef.current = enrichedScene;

        setRenderData((prev: any) => {
          const updatedRenderData = {
            ...(prev || {}),
            cinematicDirection: enrichedScene,
            cinematic_direction: enrichedScene,
            description: enrichedScene.description,
          };
          if (savedIdRef.current) {
            persistQueue.enqueue({
              table: "lyric_projects",
              id: savedIdRef.current,
              payload: { render_data: updatedRenderData },
            });
          }
          return updatedRenderData;
        });

        setGenerationStatus((prev) => ({
          ...prev,
          cinematicDirection: "done",
        }));
        setPipelineStages((prev) => ({ ...prev, cinematic: "done" }));

        // Create dance row and generate images (mirrors song pipeline)
        if (user && audioFile) {
          try {
            await createDanceRowAndGenerateImages({
              user,
              audioFile,
              lyricData,
              artistNameRef,
              savedIdRef,
              beatGrid,
              cinematicDirection: enrichedScene,
              words,
              renderData,
              audioDurationSec,
              setPipelineDanceId,
              setPipelineDanceUrl,
              setGenerationStatus,
              setSectionImageUrls,
              setSectionImageProgress,
              isInstrumental: true,
            });
          } catch (imgErr: any) {
            console.error("[pipeline] beat mode dance/image creation failed:", imgErr);
            setGenerationStatus((prev) => ({ ...prev, sectionImages: "error" }));
          }
        } else {
          // No user or audio — mark done without images
          setGenerationStatus((prev) => ({ ...prev, sectionImages: "done" }));
        }
      } catch (err) {
        console.error("[pipeline] instrumental cinematic failed:", err);
        setGenerationStatus((prev) => ({ ...prev, cinematicDirection: "error" }));
      }
    },
    [audioDurationSec, beatGrid, lyricData, renderData, sceneDescription, setGenerationStatus, setPipelineStages, user, audioFile, setPipelineDanceId, setPipelineDanceUrl, setSectionImageUrls, setSectionImageProgress],
  );

  useEffect(() => {
    if (filmMode !== "beat") return;
    if (!beatGridDone) return;
    if (!audioDurationSec) return;
    if (cinematicTriggeredRef.current) return;
    cinematicTriggeredRef.current = true;
    void startInstrumentalCinematic();
  }, [filmMode, beatGridDone, audioDurationSec, startInstrumentalCinematic, cinematicTriggeredRef]);

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
      if (filmMode === "beat") {
        setPipelineStages((prev) => ({ ...prev, transcript: "done" }));
        setTranscriptionDone(true);
      } else {
        setPipelineStages((prev) => ({ ...prev, transcript: "running" }));
      }
      startBeatAnalysis(file);
    },
    [filmMode, startBeatAnalysis, setPipelineStages, setTranscriptionDone],
  );

  const fitDisabled = filmMode === "beat" ? false : !transcriptionDone;

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
    setSpotifyTrackId(null);
    claimPublishedRef.current = false;
    cinematicTriggeredRef.current = false;
    pipelineTriggeredRef.current = false;
    hookDetectionRunRef.current = false;
    onNewProject?.();
  }, [onNewProject, setFitReadiness, setFitUnlocked, setGenerationStatus]);

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
    spotifyTrackId,
    setSpotifyTrackId,
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
    retryImages: retryGeneration,
    retryGeneration,
    resetProject,
    savedIdRef,
  };
}
