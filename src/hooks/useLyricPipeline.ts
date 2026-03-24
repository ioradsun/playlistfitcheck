import { useMemo, useReducer, useRef } from "react";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { WaveformData } from "@/hooks/useAudioEngine";
import type { LyricLine } from "@/components/lyric/LyricDisplay";

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

export type PipelinePhase =
  | "idle"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "generating"
  | "ready"
  | "error";

export interface PipelineState {
  phase: PipelinePhase;
  error: string | null;
  savedId: string | null;
  danceId: string | null;
  danceUrl: string | null;
  lines: LyricLine[];
  words: Array<{ word: string; start: number; end: number }> | null;
  beatGrid: BeatGridData | null;
  cinematicDirection: Record<string, unknown> | null;
  renderData: Record<string, unknown> | null;
  sectionImageUrls: (string | null)[];
  sectionImageProgress: { done: number; total: number } | null;
  audioFile: File | null;
  audioBuffer: AudioBuffer | null;
  hasRealAudio: boolean;
  audioReady: boolean;
  waveformData: WaveformData | null;
  fitStageLabel: string;
  transcriptionDone: boolean;
  beatGridDone: boolean;
}

export type PipelineAction =
  | { type: "HYDRATE"; initialLyric: Record<string, unknown> | null | undefined }
  | { type: "UPLOAD_START"; file: File; savedId: string | null }
  | { type: "TRANSCRIPTION_SUCCESS"; lines: LyricLine[]; words: Array<{ word: string; start: number; end: number }> | null }
  | { type: "TRANSCRIPTION_FAILURE"; error: string }
  | { type: "RESET" };

const defaultGenerationStatus: GenerationStatus = {
  beatGrid: "idle",
  renderData: "done",
  cinematicDirection: "idle",
  sectionImages: "idle",
};

function buildInitialState(initialLyric?: Record<string, unknown> | null): PipelineState {
  const renderData = (initialLyric?.render_data as Record<string, unknown> | undefined) ?? null;
  const initialLines = Array.isArray(initialLyric?.lines)
    ? (initialLyric.lines as LyricLine[])
    : [];
  const audioReady = Boolean(initialLyric?.id);
  return {
    phase: initialLyric ? "analyzing" : "idle",
    error: null,
    savedId: (initialLyric?.id as string | null | undefined) ?? null,
    danceId: (renderData?.pipelineDanceId as string | null | undefined) ?? null,
    danceUrl: (renderData?.pipelineDanceUrl as string | null | undefined) ?? null,
    lines: initialLines,
    words: Array.isArray(initialLyric?.words)
      ? (initialLyric.words as Array<{ word: string; start: number; end: number }>)
      : null,
    beatGrid: (initialLyric?.beat_grid as BeatGridData | null | undefined) ?? null,
    cinematicDirection:
      ((initialLyric?.cinematic_direction as Record<string, unknown> | null | undefined) ??
        (renderData?.cinematicDirection as Record<string, unknown> | null | undefined) ??
        null),
    renderData,
    sectionImageUrls: Array.isArray(initialLyric?.section_images)
      ? initialLyric.section_images
      : [],
    sectionImageProgress: null,
    audioFile: null,
    audioBuffer: null,
    hasRealAudio: audioReady,
    audioReady,
    waveformData: null,
    fitStageLabel: "",
    transcriptionDone: initialLines.length > 0,
    beatGridDone: Boolean(initialLyric?.beat_grid),
  };
}

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "HYDRATE":
      return buildInitialState(action.initialLyric);
    case "UPLOAD_START":
      return {
        ...state,
        phase: "transcribing",
        error: null,
        audioFile: action.file,
        savedId: action.savedId,
        hasRealAudio: action.file.size > 0,
        audioReady: action.file.size > 0,
      };
    case "TRANSCRIPTION_SUCCESS":
      return {
        ...state,
        phase: "analyzing",
        lines: action.lines,
        words: action.words,
        transcriptionDone: true,
      };
    case "TRANSCRIPTION_FAILURE":
      return {
        ...state,
        phase: "error",
        error: action.error,
      };
    case "RESET":
      return buildInitialState();
    default:
      return state;
  }
}

interface UseLyricPipelineParams {
  initialLyric?: Record<string, unknown> | null;
}

export function useLyricPipeline({ initialLyric }: UseLyricPipelineParams) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(initialLyric));
  const savedIdRef = useRef<string | null>(state.savedId);
  savedIdRef.current = state.savedId;

  const fitReadiness: FitReadiness = useMemo(() => {
    if (state.phase === "error") return "error";
    if (state.phase === "ready") return "ready";
    if (state.phase === "idle") return "not_started";
    return "running";
  }, [state.phase]);

  const pipelineStages: PipelineStages = useMemo(
    () => ({
      rhythm: state.beatGridDone ? "done" : state.transcriptionDone ? "running" : "pending",
      sections: state.cinematicDirection ? "done" : "pending",
      cinematic: state.cinematicDirection ? "done" : state.transcriptionDone ? "running" : "pending",
      transcript: state.transcriptionDone ? "done" : "running",
    }),
    [state.beatGridDone, state.cinematicDirection, state.transcriptionDone],
  );

  return {
    state,
    dispatch,
    fitReadiness,
    fitDisabled: !state.transcriptionDone,
    fitUnlocked: fitReadiness === "ready",
    generationStatus: defaultGenerationStatus,
    pipelineStages,
    savedIdRef,
    startTranscription: async () => undefined,
    startRetry: () => undefined,
    handleAudioSubmitted: () => undefined,
    decodeAudioOnDemand: async () => undefined,
    retryImages: async () => undefined,
    resetProject: () => dispatch({ type: "RESET" }),
  };
}

export type UseLyricPipelineReturn = ReturnType<typeof useLyricPipeline>;
