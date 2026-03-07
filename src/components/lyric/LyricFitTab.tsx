/* cache-bust: 2026-03-06-V2 */
/**
 * LyricFitTab — Thin parent container with two-tab architecture.
 * Holds all shared state. Renders LyricFitToggle + LyricsTab or FitTab.
 * Analysis pipeline runs in background; Fit tab reads shared state.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { useBeatGrid, preloadEssentia, type BeatGridData } from "@/hooks/useBeatGrid";
import type { LyricData, LyricLine } from "./LyricDisplay";
import { buildSongSignature, buildSongSignatureWithAudio, type SongSignature } from "@/lib/songSignatureAnalyzer";
import { detectSections, type SectionRole, type TimestampedLine } from "@/engine/sectionDetector";
import { LyricFitToggle, type LyricFitView } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";
import { useLyricSections } from "@/hooks/useLyricSections";
import { mergeSectionOverrides, type SectionOverride, type SectionOverrides } from "@/lib/mergeSectionOverrides";
import type { SceneContextResult } from "@/lib/sceneContexts";
import type { WaveformData } from "@/hooks/useAudioEngine";

// ── Pipeline Debug Logger ─────────────────────────────────────────────────────
// Structured logger that outputs to console with timestamps relative to pipeline start.
// Import pipelineLog anywhere to see the full trace.
const _pipelineT0 = performance.now();
const _pipelineLogs: Array<{ t: string; event: string; data?: any }> = [];

function plog(event: string, data?: any) {
  const t = `+${((performance.now() - _pipelineT0) / 1000).toFixed(2)}s`;
  _pipelineLogs.push({ t, event, data });
  if (data !== undefined) {
    console.log(`%c[Pipeline ${t}]%c ${event}`, "color:#a78bfa;font-weight:bold", "color:inherit", data);
  } else {
    console.log(`%c[Pipeline ${t}]%c ${event}`, "color:#a78bfa;font-weight:bold", "color:inherit");
  }
}

// Expose on window for debug panel access
if (typeof window !== "undefined") {
  (window as any).__pipelineLogs = _pipelineLogs;
  (window as any).__plog = plog;
}

const WAVEFORM_PEAK_COUNT = 200;

function extractPeaksFromBuffer(buf: AudioBuffer): WaveformData {
  const channel = buf.getChannelData(0);
  const blockSize = Math.floor(channel.length / WAVEFORM_PEAK_COUNT);
  const peaks: number[] = [];
  for (let i = 0; i < WAVEFORM_PEAK_COUNT; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const maxPeak = Math.max(...peaks, 0.01);
  return { peaks: peaks.map(p => p / maxPeak), duration: buf.duration };
}

export type FitReadiness = "not_started" | "running" | "ready" | "error";
export type GenerationJobStatus = "idle" | "running" | "done" | "error";

export interface GenerationStatus {
  beatGrid: GenerationJobStatus;
  renderData: GenerationJobStatus;
  cinematicDirection: GenerationJobStatus;
  sectionImages: GenerationJobStatus;
}

export type PipelineStageStatus = "pending" | "running" | "done";
export interface PipelineStages {
  rhythm: PipelineStageStatus;
  sections: PipelineStageStatus;
  cinematic: PipelineStageStatus;
  transcript: PipelineStageStatus;
}

export type PipelineStageTimes = Partial<Record<keyof PipelineStages, { start: number; end?: number }>>;

interface Props {
  initialLyric?: any;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
  onUploadStarted?: (payload: { file: File; projectId: string | null; title: string }) => void;
}

export function LyricFitTab({
  initialLyric,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
  onUploadStarted: onUploadStartedProp,
}: Props) {
  const { user } = useAuth();

  useEffect(() => { plog("ESSENTIA preload started"); preloadEssentia(); }, []);
  const artistNameRef = useRef<string>("artist");
  // Compute initial values synchronously from initialLyric to avoid flash of uploader
  const initLyricData = useMemo<LyricData | null>(() => {
    if (!initialLyric) return null;
    const filename = initialLyric.filename || "saved-lyrics.mp3";
    const normalizedTitle = (initialLyric.title || "").trim();
    const title = (normalizedTitle && normalizedTitle.toLowerCase() !== "unknown" && normalizedTitle.toLowerCase() !== "untitled")
      ? normalizedTitle
      : filename.replace(/\.[^/.]+$/, "").trim() || "Untitled";
    return { title, lines: initialLyric.lines as any[] };
  }, [initialLyric]);

  const [activeTab, setActiveTab] = useState<LyricFitView>("lyrics");
  const [sceneDescription, setSceneDescription] = useState('');
  const [resolvedScene, setResolvedScene] = useState<SceneContextResult | null>(null);
  const [resolvingScene, setResolvingScene] = useState(false);
  const [fitUnlocked, setFitUnlocked] = useState(false);
  const [lyricData, setLyricData] = useState<LyricData | null>(initLyricData);
  const [audioFile, setAudioFile] = useState<File | null>(() => {
    if (!initialLyric?.id) return null;
    return sessionAudio.get("lyric", initialLyric.id) ?? null;
  });
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(initialLyric?.id ?? null);
  const savedIdRef = useRef<string | null>(initialLyric?.id ?? null);
  const renderDataLoadedFromDbRef = useRef(false);
  const [lines, setLines] = useState<LyricLine[]>(initialLyric?.lines as any[] ?? []);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(initialLyric?.fmly_lines ?? null);
  const [versionMeta, setVersionMeta] = useState<any | null>(initialLyric?.version_meta ?? null);
  const [words, setWords] = useState<Array<{ word: string; start: number; end: number }> | null>(initialLyric?.words ?? null);
  const [sectionOverrides, setSectionOverrides] = useState<SectionOverrides | null>(initialLyric?.section_overrides ?? null);
  const [sectionsDirty, setSectionsDirty] = useState(false);

  const [renderData, setRenderData] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [songSignature, setSongSignature] = useState<SongSignature | null>(null);
  const [audioSections, setAudioSections] = useState<any[]>([]);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(null);
  const cinematicDirectionRef = useRef(cinematicDirection);
  cinematicDirectionRef.current = cinematicDirection;
  // bgImageUrl and frameState removed — V3 derives from cinematicDirection

  const [fitReadiness, setFitReadiness] = useState<FitReadiness>("not_started");
  const [fitProgress, setFitProgress] = useState(0);
  const [fitStageLabel, setFitStageLabel] = useState("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStages>({
    rhythm: "pending", sections: "pending", cinematic: "pending", transcript: "pending",
  });
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    beatGrid: "idle",
    renderData: "done",
    cinematicDirection: "idle",
    sectionImages: "idle",
  });

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [transcriptionDone, setTranscriptionDone] = useState(false);
  const [beatGridDone, setBeatGridDone] = useState(false);
  const [audioBufferReady, setAudioBufferReady] = useState(false);
  const { beatGrid: detectedGrid } = useBeatGrid(beatGrid ? null : audioBuffer);

  const [analysisModel, setAnalysisModel] = useState("google/gemini-2.5-flash");
  const [transcriptionModel, setTranscriptionModel] = useState("scribe");

  const timestampedLines = useMemo<TimestampedLine[]>(() => {
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
    const lastLineEnd = timestampedLines[timestampedLines.length - 1]?.endSec ?? 0;
    return Math.max(audioBuffer?.duration ?? 0, lastLineEnd);
  }, [audioBuffer, timestampedLines]);

  const { sections: detectedSections } = useLyricSections(words, beatGrid, cinematicDirection, audioDurationSec);
  const mergedSections = useMemo(
    () => mergeSectionOverrides(detectedSections, sectionOverrides),
    [detectedSections, sectionOverrides],
  );
  const mergedSectionsRef = useRef(mergedSections);
  mergedSectionsRef.current = mergedSections;

  const handleSectionOverridesChange = useCallback((overrides: SectionOverrides) => {
    const prev = sectionOverrides || [];
    const rolesChanged = overrides.some((override) => {
      const old = prev.find((item) => item.sectionIndex === override.sectionIndex);
      return !!(override.role && (!old || old.role !== override.role));
    });
    const newSections = overrides.some((override) => override.isNew && !prev.some((item) => item.sectionIndex === override.sectionIndex));
    if (rolesChanged || newSections) setSectionsDirty(true);
    setSectionOverrides(overrides);
  }, [sectionOverrides]);

  const handleAddSection = useCallback((role: SectionRole, startSec: number, endSec: number) => {
    const maxIndex = Math.max(0, ...(sectionOverrides || []).map((o) => o.sectionIndex), ...detectedSections.map((section) => section.sectionIndex));
    const newOverride: SectionOverride = {
      sectionIndex: maxIndex + 100,
      role,
      startSec,
      endSec: Math.min(endSec, audioDurationSec),
      isNew: true,
    };
    setSectionOverrides((prev) => [...(prev || []), newOverride]);
    setSectionsDirty(true);
  }, [sectionOverrides, detectedSections, audioDurationSec]);

  const handleRemoveSection = useCallback((sectionIndex: number) => {
    setSectionOverrides((prev) => {
      const current = prev || [];
      const existing = current.find((item) => item.sectionIndex === sectionIndex);
      if (existing?.isNew) {
        return current.filter((item) => item.sectionIndex !== sectionIndex);
      }
      const withoutExisting = current.filter((item) => item.sectionIndex !== sectionIndex);
      return [...withoutExisting, { sectionIndex, removed: true }];
    });
    setSectionsDirty(true);
  }, []);

  const sectionsReady = audioSections.length > 0;
  const fitPipelineT0Ref = useRef<number | null>(null);
  const fitPipelineMs = useCallback(() => fitPipelineT0Ref.current === null
    ? "0ms"
    : `${(performance.now() - fitPipelineT0Ref.current).toFixed(0)}ms`, []);

  useEffect(() => {
    const wasDone = transcriptionDone;
    setTranscriptionDone(timestampedLines.length > 0);
    if (!wasDone && timestampedLines.length > 0) {
      plog("TRANSCRIPTION done", { lines: timestampedLines.length, firstLine: timestampedLines[0]?.text?.slice(0, 50), lastEndSec: timestampedLines[timestampedLines.length - 1]?.endSec?.toFixed(1) });
    }
  }, [timestampedLines]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).single()
      .then(({ data }) => { if (data?.display_name) artistNameRef.current = data.display_name; });
  }, [user]);

  // Debounced scene resolution
  useEffect(() => {
    if (!sceneDescription.trim() || sceneDescription.trim().length < 10) return;
    const timer = setTimeout(async () => {
      setResolvingScene(true);
      try {
        const { data } = await supabase.functions.invoke('resolve-scene-context', {
          body: { description: sceneDescription.trim() },
        });
        if (data && !data.error) setResolvedScene(data);
      } catch (e) {
        console.error('Scene resolve failed:', e);
      } finally {
        setResolvingScene(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [sceneDescription]);

  useEffect(() => {
    if (!detectedGrid || beatGrid) return;
    plog("BEAT GRID detected", { bpm: detectedGrid.bpm, beats: detectedGrid.beats?.length, confidence: detectedGrid.confidence, hasAnalysis: !!detectedGrid._analysis, analysisFrames: detectedGrid._analysis?.frames?.length ?? 0 });
    setBeatGrid(detectedGrid);
    setBeatGridDone(true);
    setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "done" }));
    setFitProgress(prev => Math.max(prev, 35));

    // Persist beat_grid so we skip Essentia on next load
    if (savedIdRef.current) {
      void supabase.from("saved_lyrics")
        .update({
          beat_grid: {
            bpm: detectedGrid.bpm,
            beats: detectedGrid.beats,
            confidence: detectedGrid.confidence,
          } as any,
        })
        .eq("id", savedIdRef.current);
    }
  }, [detectedGrid, beatGrid]);

  // Ensure audioBuffer is decoded when audioFile exists (e.g. loaded from DB)
  // songSignature needs audioBuffer even if beatGrid was loaded from saved data
  // PERF: Skip eager decode when all analysis data is already loaded — decode on demand
  const allAnalysisLoaded = !!(beatGrid && songSignature && cinematicDirection);
  useEffect(() => {
    if (audioBuffer || !audioFile || audioFile.size === 0) return;
    if (allAnalysisLoaded) { plog("AUDIO DECODE skipped — all analysis loaded from DB"); return; }
    plog("AUDIO DECODE starting", { fileSize: audioFile.size, fileName: audioFile.name });
    let cancelled = false;
    const t0 = performance.now();
    const ctx = new AudioContext();
    audioFile.arrayBuffer().then((ab) =>
      ctx.decodeAudioData(ab).then((buf) => {
        if (!cancelled) {
          plog("AUDIO DECODE complete", { duration: buf.duration.toFixed(1) + "s", sampleRate: buf.sampleRate, channels: buf.numberOfChannels, decodeMs: Math.round(performance.now() - t0) });
          setAudioBuffer(buf);
          setAudioBufferReady(true);
          setWaveformData(extractPeaksFromBuffer(buf));
        }
        ctx.close();
      })
    ).catch((err) => { plog("AUDIO DECODE failed", err?.message); ctx.close(); });
    return () => { cancelled = true; };
  }, [audioFile, audioBuffer, allAnalysisLoaded]);


  // Lazy decode for playback — called when user hits play but audioBuffer isn't ready
  const decodeAudioOnDemand = useCallback(async () => {
    if (audioBuffer || !audioFile || audioFile.size === 0) return;
    try {
      const ctx = new AudioContext();
      const ab = await audioFile.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      setAudioBuffer(buf);
      setAudioBufferReady(true);
      setWaveformData(extractPeaksFromBuffer(buf));
      ctx.close();
    } catch {
      console.warn("[Pipeline] On-demand AudioBuffer decode failed");
    }
  }, [audioFile, audioBuffer]);

  const resolveProjectTitle = useCallback(
    (title: string | null | undefined, filename: string) => {
      const normalizedTitle = (title || "").trim();
      if (normalizedTitle && normalizedTitle.toLowerCase() !== "unknown" && normalizedTitle.toLowerCase() !== "untitled") {
        return normalizedTitle;
      }
      return filename.replace(/\.[^/.]+$/, "").trim() || "Untitled";
    },
    [],
  );

  useEffect(() => {
    supabase
      .from("site_copy")
      .select("copy_json")
      .limit(1)
      .single()
      .then(({ data }) => {
        const f = (data?.copy_json as any)?.features || {};
        if (f.lyric_analysis_model) setAnalysisModel(f.lyric_analysis_model);
        if (f.lyric_transcription_model) setTranscriptionModel(f.lyric_transcription_model);
      });
  }, []);

  useEffect(() => {
    savedIdRef.current = savedId;
  }, [savedId]);

  useEffect(() => {
    if (!sectionOverrides?.length || !mergedSections.length) return;
    const cd = cinematicDirectionRef.current;
    if (!cd || !Array.isArray(cd.sections)) return;

    const patchedSections = cd.sections.map((cs: any, i: number) => {
      const merged = mergedSections[i];
      if (!merged) return cs;
      return {
        ...cs,
        startSec: merged.startSec,
        endSec: merged.endSec,
        structuralLabel: merged.label,
      };
    });

    const same = cd.sections.every((sec: any, i: number) => {
      const next = patchedSections[i];
      return !!next && sec.startSec === next.startSec && sec.endSec === next.endSec && sec.structuralLabel === next.structuralLabel;
    });
    if (!same) {
      setCinematicDirection({ ...cd, sections: patchedSections });
    }
  }, [sectionOverrides, mergedSections]);

  useEffect(() => {
    if (!savedId || !sectionOverrides) return;
    const timer = setTimeout(() => {
      void supabase
        .from("saved_lyrics")
        .update({ render_data: { section_overrides: sectionOverrides } as any })
        .eq("id", savedId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [sectionOverrides, savedId]);

  // (persist effect moved below persistRenderData definition)

  // Hydrate remaining state from initialLyric (analysis data, audio file, etc.)
  // lyricData/lines/savedId/fmlyLines/versionMeta/words are already set via useState initializers
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!initialLyric || hydratedRef.current) return;
    hydratedRef.current = true;

    const filename = initialLyric.filename || "saved-lyrics.mp3";
    setTranscriptionDone(Array.isArray(initialLyric.lines) && initialLyric.lines.length > 0);

    const savedBg = (initialLyric as any).beat_grid;
    plog("HYDRATE start", {
      hasLines: Array.isArray(initialLyric.lines) && initialLyric.lines.length,
      hasWords: !!initialLyric.words?.length,
      hasBeatGrid: !!savedBg,
      hasSongSignature: !!(initialLyric as any).song_signature,
      hasCinematicDirection: !!(initialLyric as any).cinematic_direction,
      hasRenderData: !!(initialLyric as any).render_data,
      hasSectionImages: Array.isArray((initialLyric as any).section_images) && (initialLyric as any).section_images.some(Boolean),
      hasAudioUrl: !!(initialLyric as any).audio_url,
      hasCachedAudio: !!(initialLyric.id && sessionAudio.get("lyric", initialLyric.id)),
    });
    if (savedBg) {
      setBeatGrid(savedBg as BeatGridData);
      setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
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
      setGenerationStatus(prev => ({ ...prev, renderData: "done" }));

      const savedPeaks = (loadedRenderData as any)?.waveformPeaks;
      const savedDuration = (loadedRenderData as any)?.waveformDuration;
      if (Array.isArray(savedPeaks) && savedPeaks.length > 0 && savedDuration > 0) {
        setWaveformData({ peaks: savedPeaks, duration: savedDuration });
      }
    }

    if (loadedCinematicDirection) {
      setCinematicDirection(loadedCinematicDirection);
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
    }

    if (savedBg && loadedCinematicDirection) {
      pipelineTriggeredRef.current = true;
      setFitReadiness("ready");
      setFitProgress(100);
      setFitUnlocked(true);

      import("@/engine/presetDerivation").then(({ deriveFrameState }) => {
        import("@/engine/presetDerivation").then(({ getTypography }) => {
          const typoPreset = loadedCinematicDirection.typography || "clean-modern";
          const typo = getTypography(typoPreset);
          const bgSystemMap: Record<string, string> = {
            void: "void", cinematic: "fracture", haze: "breath", split: "static",
            grain: "static", wash: "breath", glass: "pressure", clean: "void",
          };
          const atm = loadedCinematicDirection.atmosphere || "cinematic";
          deriveFrameState(loadedCinematicDirection, 0, 0.5);
        });
      });
    }

    const savedSignature = (initialLyric as any).song_signature;
    if (savedSignature) {
      const sig = { ...savedSignature } as SongSignature;
      if (sig.energyCurve && !(sig.energyCurve instanceof Float32Array)) {
        const values = Object.values(sig.energyCurve) as number[];
        sig.energyCurve = new Float32Array(values);
      }
      if (sig.energyCurve && sig.energyCurve.length > 0) {
        plog("HYDRATE songSignature accepted", { energyCurveLength: sig.energyCurve.length, bpm: sig.bpm });
        setSongSignature(sig);
      } else {
        plog("HYDRATE songSignature REJECTED — empty energyCurve, will recompute");
      }
    }
    // NOTE: Do NOT hydrate audioSections from cinematic_direction.sections.
    // Those are AI-labeled sections, not detectSections() output.
    // audioSections must always come from detectSections() using the real energy curve.
    // The pipeline will re-derive them via maybeRunSectionPipeline.

    // Hydrate section_images from saved_lyrics — survives tab switches
    const savedSectionImages = (initialLyric as any).section_images;
    if (Array.isArray(savedSectionImages) && savedSectionImages.length > 0 && savedSectionImages.some(Boolean)) {
      
      setGenerationStatus(prev => ({ ...prev, sectionImages: "done" }));
    }

    const cachedAudio = initialLyric.id ? sessionAudio.get("lyric", initialLyric.id) : undefined;
    if (cachedAudio) {
      setAudioFile(cachedAudio);
      setHasRealAudio(true);
    } else if ((initialLyric as any).audio_url) {
      const audioUrl = (initialLyric as any).audio_url as string;
      fetch(audioUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], filename, { type: blob.type || "audio/mpeg" });
          setAudioFile(file);
          setHasRealAudio(true);
          if (initialLyric.id) sessionAudio.set("lyric", initialLyric.id, file, { ttlMs: 20 * 60 * 1000 });
        })
        .catch(() => {
          const dummyFile = new File([], filename, { type: "audio/mpeg" });
          setAudioFile(dummyFile);
          setHasRealAudio(false);
        });
    } else {
      const dummyFile = new File([], filename, { type: "audio/mpeg" });
      setAudioFile(dummyFile);
      setHasRealAudio(false);
    }
  }, [initialLyric]);

  const persistRenderData = useCallback(async (id: string, payload: Record<string, unknown>, attempt = 1): Promise<boolean> => {
    try {
      const { data: updated, error } = await supabase
        .from("saved_lyrics")
        .update({ render_data: payload as any, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) {
        console.warn("[persistRenderData] error attempt", attempt, error.message);
        if (attempt < 3) return persistRenderData(id, payload, attempt + 1);
        return false;
      }
      if (!updated) {
        console.warn("[persistRenderData] no row matched attempt", attempt, id);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          return persistRenderData(id, payload, attempt + 1);
        }
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn("[persistRenderData] exception attempt", attempt, e);
      if (attempt < 3) return persistRenderData(id, payload, attempt + 1);
      return false;
    }
  }, []);

  // Persist render_data whenever we have both a saved project and computed DNA
  // Only persist when renderData changes (not cinematicDirection alone — that's handled in startCinematicDirection)
  useEffect(() => {
    if (!savedIdRef.current || !renderData) return;
    // Skip the first trigger after loading from DB — no actual change occurred
    if (renderDataLoadedFromDbRef.current) {
      renderDataLoadedFromDbRef.current = false;
      return;
    }
    const payload = { ...renderData };
    if (cinematicDirection) payload.cinematicDirection = cinematicDirection;
    if (waveformData && waveformData.peaks.length > 0) {
      payload.waveformPeaks = waveformData.peaks;
      payload.waveformDuration = waveformData.duration;
    }
    persistRenderData(savedIdRef.current, payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId, renderData, waveformData, persistRenderData]);

  const startBeatAnalysis = useCallback(async (targetAudioFile: File) => {
    if (!targetAudioFile || targetAudioFile.size === 0) return;
    plog("BEAT ANALYSIS start", { fileName: targetAudioFile.name, fileSize: targetAudioFile.size, hasExistingBeatGrid: !!beatGrid, hasAudioBuffer: !!audioBuffer });

    if (!audioBuffer) {
      try {
        const t0 = performance.now();
        const ctx = new AudioContext();
        const ab = await targetAudioFile.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        plog("BEAT ANALYSIS decoded audioBuffer", { duration: buf.duration.toFixed(1) + "s", decodeMs: Math.round(performance.now() - t0) });
        setAudioBuffer(buf);
        setAudioBufferReady(true);
        setWaveformData(extractPeaksFromBuffer(buf));
        ctx.close();
      } catch {
        plog("BEAT ANALYSIS decode FAILED");
      }
    }

    if (beatGrid) {
      plog("BEAT ANALYSIS skipped — beatGrid already exists", { bpm: beatGrid.bpm });
      setBeatGridDone(true);
      setGenerationStatus(prev => prev.beatGrid === "done" ? prev : ({ ...prev, beatGrid: "done" }));
      return;
    }
    if (generationStatus.beatGrid === "running" || generationStatus.beatGrid === "done") return;

    plog("BEAT ANALYSIS running Essentia");
    setGenerationStatus(prev => ({ ...prev, beatGrid: "running" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "running" }));
  }, [beatGrid, generationStatus.beatGrid, audioBuffer]);

  // ── Hook Detection (parallel, non-blocking) ──
  const hookDetectionRunRef = useRef(false);
  const startHookDetection = useCallback(async () => {
    if (hookDetectionRunRef.current) return;
    if (!words?.length || !lines?.length) return;
    // Skip if hooks already loaded from DB
    if (renderData?.hook) return;

    hookDetectionRunRef.current = true;
    plog("HOOKS start", { linesCount: lines.length, wordsCount: words?.length, hasBeatGrid: !!beatGrid, hasEnergyCurve: !!songSignature?.energyCurve?.length });
    try {
      const linesForHook = lines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: Number(l.start ?? 0), end: Number(l.end ?? 0) }));

      const { data: hookResult, error } = await supabase.functions.invoke("detect-hooks", {
        body: {
          lyrics: linesForHook.map((l: { text: string }) => l.text).join("\n"),
          lines: linesForHook,
          words,
          beatGrid: beatGrid
            ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence }
            : { bpm: 120, beats: [], confidence: 0 },
          energyCurve: songSignature?.energyCurve
            ? Array.from(songSignature.energyCurve)
            : undefined,
          beatEnergies: beatGrid?.beatEnergies ?? undefined,
          durationSec: audioDurationSec,
        },
      });

      if (error) throw error;
      if (!hookResult?.hook) { plog("HOOKS — no hooks returned"); return; }

      plog("HOOKS complete", { hook1: `${hookResult.hook.start?.toFixed(1)}-${hookResult.hook.end?.toFixed(1)}s score=${hookResult.hook.score}`, hook2: hookResult.secondHook ? `${hookResult.secondHook.start?.toFixed(1)}-${hookResult.secondHook.end?.toFixed(1)}s` : "none", label1: hookResult.hookLabel, label2: hookResult.secondHookLabel });

      // Merge hooks into renderData
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
          void persistRenderData(savedIdRef.current, updated);
        }
        return updated;
      });
    } catch (err: any) {
      plog("HOOKS FAILED", err?.message || err);
    }
  }, [words, lines, beatGrid, songSignature, audioDurationSec, renderData?.hook, persistRenderData]);

  const startCinematicDirection = useCallback(async (sourceLines: LyricLine[], force = false) => {
    if (!lyricData || !sourceLines.length) return;
    // Data-existence guard: if we already have cinematicDirection (e.g. loaded from DB), skip
    if (!force && cinematicDirectionRef.current) {
      plog("CINEMATIC skipped — loaded from DB", { sectionsCount: cinematicDirectionRef.current?.sections?.length ?? 0 });
      setGenerationStatus(prev => {
        const next = { ...prev };
        if (next.cinematicDirection !== "done") next.cinematicDirection = "done";
        // Also resolve sectionImages if still idle — no image pipeline will run on this path
        if (next.sectionImages === "idle") next.sectionImages = "done";
        return next;
      });
      return;
    }
    if (!force && (generationStatus.cinematicDirection === "running" || generationStatus.cinematicDirection === "done")) return;

    setGenerationStatus(prev => ({ ...prev, cinematicDirection: "running", sectionImages: "idle" }));
    setPipelineStages(prev => ({ ...prev, cinematic: "running" }));

    plog("CINEMATIC start", { title: lyricData.title, force, sectionsCount: audioSections.length, hasWords: !!words?.length, hasScene: !!resolvedScene });


    try {
      const lyricsForDirection = sourceLines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

      const sceneContext = resolvedScene ?? null;
      const sectionSource = audioSections.length > 0 ? audioSections : mergedSectionsRef.current;
      const sectionsForAI = sectionSource.map((section: any, i: number) => ({
        index: i,
        startSec: section.startSec,
        endSec: section.endSec,
        role: section.role,
        avgEnergy: section.avgEnergy ?? 0.5,
        beatDensity: section.beatDensity ?? 1.5,
        confidence: section.confidence ?? 0.5,
        lyrics: sourceLines
          .filter((line) => line.start >= section.startSec - 0.5 && line.end <= section.endSec + 0.5)
          .map((line, lineIndex) => ({ text: line.text, lineIndex })),
      }));

      const sharedBody = {
        title: lyricData.title,
        artist: artistNameRef.current,
        lines: lyricsForDirection,
        lyrics: lyricsForDirection.map((line: { text: string }) => line.text).join("\n"),
        beatGrid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : undefined,
        beatGridSummary: beatGrid
          ? { bpm: beatGrid.bpm, confidence: beatGrid.confidence, totalBeats: beatGrid.beats.length }
          : undefined,
        songSignature: songSignature
          ? {
              bpm: songSignature.bpm,
              durationSec: songSignature.durationSec,
              tempoStability: songSignature.tempoStability,
              rmsMean: songSignature.rmsMean,
              rmsVariance: songSignature.rmsVariance,
              spectralCentroidHz: songSignature.spectralCentroidHz,
              lyricDensity: songSignature.lyricDensity,
            }
          : undefined,
        audioSections: sectionsForAI.length ? sectionsForAI : undefined,
        lyricId: savedIdRef.current || undefined,
        scene_context: sceneContext,
      };

      const { data: sceneResult } = await supabase.functions.invoke("cinematic-direction", {
        body: { ...sharedBody, mode: "scene" },
      });

      if (!sceneResult?.cinematicDirection) {
        throw new Error("Scene direction returned no data");
      }

      const sceneDirection = sceneResult.cinematicDirection;
      plog("SCENE DIRECTION complete", {
        sceneTone: sceneDirection.sceneTone,
        atmosphere: sceneDirection.atmosphere,
        motion: sceneDirection.motion,
        typography: sceneDirection.typography,
        emotionalArc: sceneDirection.emotionalArc,
        description: sceneDirection.description?.slice(0, 80),
        mood: sceneDirection.mood,
        hasMeaning: !!sceneDirection.meaning,
        sectionsReturned: sceneDirection.sections?.length ?? 0,
        sectionLabels: sceneDirection.sections?.map((s: any) => s.structuralLabel) ?? [],
      });

      const enrichedScene = beatGrid
        ? { ...sceneDirection, beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence } }
        : { ...sceneDirection };

      if (sectionsForAI.length > 0 && Array.isArray(enrichedScene.sections)) {
        enrichedScene.sections = enrichedScene.sections.map((s: any, i: number) => ({
          ...s,
          startSec: sectionsForAI[i]?.startSec ?? s.startSec,
          endSec: sectionsForAI[i]?.endSec ?? s.endSec,
        }));
      }

      setCinematicDirection(enrichedScene);

      // Flow song metadata to renderData so FitTab can display it
      if (enrichedScene.description || enrichedScene.mood || enrichedScene.meaning) {
        plog("METADATA → renderData", { description: enrichedScene.description?.slice(0, 60), mood: enrichedScene.mood, hasTheme: !!enrichedScene.meaning?.theme });
        const updatedRenderData = {
          ...(renderData || {}),
          description: enrichedScene.description,
          mood: enrichedScene.mood,
          meaning: enrichedScene.meaning,
        };
        setRenderData(updatedRenderData);
      }

      const { deriveFrameState } = await import("@/engine/presetDerivation");
      const { getTypography } = await import("@/engine/presetDerivation");
      const typoPreset = enrichedScene.typography || "clean-modern";
      getTypography(typoPreset);
      deriveFrameState(enrichedScene, 0, 0.5);

      const wordPromise = (async () => {
        const wt0 = performance.now();
        plog("WORDS start");
        try {
          const { data: wordResult } = await supabase.functions.invoke("cinematic-direction", {
            body: {
              ...sharedBody,
              mode: "words",
              sceneDirection: enrichedScene,
              words: words ?? undefined,
            },
          });

          if (wordResult?.cinematicDirection) {
            const { storyboard, wordDirectives } = wordResult.cinematicDirection;
            plog("WORDS complete", { storyboard: storyboard?.length ?? 0, wordDirectives: wordDirectives?.length ?? 0, durationMs: Math.round(performance.now() - wt0) });
            const merged = {
              ...enrichedScene,
              storyboard: storyboard || [],
              wordDirectives: wordDirectives || [],
            };
            setCinematicDirection(merged);
            cinematicDirectionRef.current = merged;

            if (savedIdRef.current) {
              // Use functional setter to read latest renderData — avoids stale closure
              setRenderData((prev: any) => {
                const updated = { ...(prev || {}), cinematicDirection: merged };
                void persistRenderData(savedIdRef.current!, updated);
                return updated;
              });
            }
          }
        } catch (wordErr: any) {
          plog("WORDS FAILED", wordErr?.message || wordErr);
        }
      })();

      const imagePromise = (async () => {
        const dirSections = enrichedScene?.sections;
        if (!Array.isArray(dirSections) || dirSections.length === 0 || !user) {
          plog("IMAGES skipped", { reason: !user ? "no user" : "no sections", sectionsCount: dirSections?.length ?? 0 });
          setGenerationStatus(prev => ({ ...prev, sectionImages: "done" }));
          return;
        }

        const currentSavedImages = initialLyric?.section_images;
        if (Array.isArray(currentSavedImages) && currentSavedImages.length > 0 && currentSavedImages.some(Boolean)) {
          plog("IMAGES skipped — loaded from DB", { count: currentSavedImages.filter(Boolean).length });
          setGenerationStatus(prev => ({ ...prev, sectionImages: "done" }));
          return;
        }

        plog("IMAGES start", { sectionsCount: dirSections.length });
        const it0 = performance.now();

        setGenerationStatus(prev => ({ ...prev, sectionImages: "running" }));
        setFitProgress(prev => Math.max(prev, 85));

        try {
          const songSlugVal = (await import("@/lib/slugify")).slugify(lyricData!.title || "untitled");
          const artistSlugVal = (await import("@/lib/slugify")).slugify(artistNameRef.current || "artist");

          let resolvedDanceId: string | null = null;
          const { data: existing }: any = await supabase
            .from("shareable_lyric_dances" as any)
            .select("id")
            .eq("user_id", user.id)
            .eq("song_slug", songSlugVal)
            .maybeSingle();
          if (existing?.id) {
            resolvedDanceId = existing.id;
            await supabase
              .from("shareable_lyric_dances" as any)
              .update({ cinematic_direction: enrichedScene } as any)
              .eq("id", resolvedDanceId);
          } else {
            const mainLines = lyricData!.lines.filter((l: any) => l.tag !== "adlib");
            const audioFileName = audioFile?.name || "audio.webm";
            const storagePath = savedIdRef.current
              ? (await import("@/lib/audioStoragePath")).getAudioStoragePath(user.id, savedIdRef.current, audioFileName)
              : `${user.id}/${artistSlugVal}/${songSlugVal}/lyric-dance.${audioFileName.split(".").pop() || "webm"}`;
            if (audioFile) {
              await supabase.storage
                .from("audio-clips")
                .upload(storagePath, audioFile, { upsert: true, contentType: audioFile.type || undefined });
            }
            const { data: urlData } = supabase.storage.from("audio-clips").getPublicUrl(storagePath);

            await supabase
              .from("shareable_lyric_dances" as any)
              .upsert({
                user_id: user.id,
                artist_slug: artistSlugVal,
                song_slug: songSlugVal,
                artist_name: artistNameRef.current || "artist",
                song_name: lyricData!.title || "Untitled",
                audio_url: urlData.publicUrl,
                lyrics: mainLines,
                cinematic_direction: enrichedScene,
                words: words ?? null,
                beat_grid: beatGrid ? { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence } : { bpm: 0, beats: [], confidence: 0 },
                palette: enrichedScene?.palette || ["#ffffff", "#a855f7", "#ec4899"],
                section_images: null,
              } as any, { onConflict: "artist_slug,song_slug" });

            const { data: newRow }: any = await supabase
              .from("shareable_lyric_dances" as any)
              .select("id")
              .eq("user_id", user.id)
              .eq("song_slug", songSlugVal)
              .maybeSingle();
            resolvedDanceId = newRow?.id ?? null;
          }

          if (!resolvedDanceId) {
            console.error("[Pipeline] Could not create dance row for image generation");
            setGenerationStatus(prev => ({ ...prev, sectionImages: "error" }));
            return;
          }

          const { data: result, error } = await supabase.functions.invoke("generate-section-images", {
            body: { lyric_dance_id: resolvedDanceId, force: true },
          });
          if (error) throw error;
          const urls = result?.urls || result?.section_images || [];

          plog("IMAGES complete", { generated: urls.filter(Boolean).length, total: dirSections.length, durationMs: Math.round(performance.now() - it0) });

          if (savedIdRef.current && urls.length > 0) {
            void supabase
              .from("saved_lyrics")
              .update({ section_images: urls as any })
              .eq("id", savedIdRef.current);
          }

          setGenerationStatus(prev => ({ ...prev, sectionImages: "done" }));
        } catch (imgErr: any) {
          plog("IMAGES FAILED", imgErr?.message || imgErr);
          console.error("[Pipeline] Image generation failed:", imgErr?.message || imgErr);
          setGenerationStatus(prev => ({ ...prev, sectionImages: "error" }));
        }
      })();

      await Promise.allSettled([wordPromise, imagePromise]);

      plog("CINEMATIC pipeline complete");
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
      setFitProgress(prev => Math.max(prev, 85));
    } catch (err) {
      plog("CINEMATIC FAILED", (err as any)?.message || err);
      console.error("[Pipeline] Cinematic direction failed:", err);
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "error", sectionImages: "idle" }));
    }
  }, [lyricData, generationStatus.cinematicDirection, beatGrid, renderData, persistRenderData, songSignature, audioSections, fitPipelineMs, words, user, audioFile, initialLyric]);

  const sectionPipelineRunningRef = useRef(false);
  const sectionPipelineDoneRef = useRef(false);

  const maybeRunSectionPipeline = useCallback(async () => {
    
    if (!transcriptionDone || !beatGridDone) return;
    if (!beatGrid) return;
    if (sectionPipelineRunningRef.current || sectionPipelineDoneRef.current) return;

    // If we already have both songSignature and audioSections from DB, skip entirely
    if (songSignature && audioSections.length > 0) {
      console.log("[section-pipeline] SKIPPED — cached:", { sigCurveLen: songSignature.energyCurve?.length ?? 0, audioSectionsCount: audioSections.length });
      sectionPipelineDoneRef.current = true;
      return;
    }

    // Wait for audioBuffer when _analysis is missing (reload from DB)
    // audioBuffer is needed to compute energy curve from raw audio
    if (!beatGrid._analysis && !audioBuffer) {
      console.log("[section-pipeline] WAITING — no _analysis and no audioBuffer");
      return;
    }

    fitPipelineT0Ref.current = performance.now();
    setPipelineStages(prev => ({ ...prev, sections: "running" }));
    sectionPipelineRunningRef.current = true;
    try {
      let sig = songSignature;
      if (!sig) {
        const lyricsText = timestampedLines.map((line) => line.text).join("\n");
        const usedRawAudio = !!audioBuffer;
        if (audioBuffer) {
          sig = buildSongSignatureWithAudio(audioBuffer, beatGrid, beatGrid._analysis, lyricsText, audioDurationSec);
        } else {
          sig = buildSongSignature(beatGrid, beatGrid._analysis, lyricsText, audioDurationSec);
        }

        // ── Section pipeline diagnostics ──
        const ec = sig.energyCurve;
        let ecMin = 1, ecMax = 0, ecDeltas = 0;
        for (let i = 0; i < ec.length; i++) {
          if (ec[i] < ecMin) ecMin = ec[i];
          if (ec[i] > ecMax) ecMax = ec[i];
          if (i > 0 && Math.abs(ec[i] - ec[i - 1]) >= 0.2) ecDeltas++;
        }
        console.log("[section-pipeline] diagnostics:", {
          path: usedRawAudio ? "raw-audio" : "analysis-frames",
          hasAnalysis: !!beatGrid._analysis,
          hasAudioBuffer: !!audioBuffer,
          audioBufferDuration: audioBuffer?.duration ?? 0,
          audioDurationSec,
          energyCurveLength: ec.length,
          energyCurveMin: ecMin.toFixed(3),
          energyCurveMax: ecMax.toFixed(3),
          energyCurveRange: (ecMax - ecMin).toFixed(3),
          energyBoundaries: ecDeltas,
          timestampedLinesCount: timestampedLines.length,
          beatsCount: beatGrid.beats?.length ?? 0,
          bpm: beatGrid.bpm,
          spectralCentroidHz: sig.spectralCentroidHz?.toFixed(0),
        });

        setSongSignature(sig);
        if (savedIdRef.current) {
          void supabase
            .from("saved_lyrics")
            .update({ song_signature: sig as any, updated_at: new Date().toISOString() })
            .eq("id", savedIdRef.current);
        }
      }

      const nextSections = detectSections(sig, beatGrid, timestampedLines, audioDurationSec);
      console.log("[section-pipeline] result:", nextSections.length, "sections", nextSections.map(s => `${s.role}@${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)} energy=${s.avgEnergy.toFixed(2)}`));
      setAudioSections(nextSections);
      setPipelineStages(prev => ({ ...prev, sections: "done" }));
      sectionPipelineDoneRef.current = true;
    } catch (error) {
      console.warn("[section-pipeline] failed", error);
    } finally {
      sectionPipelineRunningRef.current = false;
    }
  }, [transcriptionDone, beatGridDone, beatGrid, timestampedLines, audioDurationSec, songSignature, audioSections.length, audioBuffer, fitPipelineMs]);

  useEffect(() => {
    void maybeRunSectionPipeline();
  }, [maybeRunSectionPipeline, fitPipelineMs]);

  const pipelineTriggeredRef = useRef(false);
  const [pipelineRetryCount, setPipelineRetryCount] = useState(0);
  const cinematicTriggeredRef = useRef(false);
  useEffect(() => {
    if (!sectionsReady || !lines?.length) return;
    if (cinematicTriggeredRef.current && pipelineRetryCount === 0) return;
    cinematicTriggeredRef.current = true;
    plog("TRIGGER cinematic direction", { sectionsReady, linesCount: lines.length, retry: pipelineRetryCount > 0 });
    void startCinematicDirection(lines, pipelineRetryCount > 0);
  }, [sectionsReady, lines, pipelineRetryCount, startCinematicDirection, fitPipelineMs]);

  // ── Fork 1: Beat grid starts when audio file is submitted (parallel with transcription) ──
  // Called from onAudioSubmitted callback, not from an effect waiting on lines.
  const handleAudioSubmitted = useCallback((file: File) => {
    plog("AUDIO SUBMITTED", { name: file.name, size: file.size, type: file.type });
    setActiveTab("lyrics");
    setPipelineStages(prev => ({ ...prev, transcript: "running" }));
    startBeatAnalysis(file);
  }, [startBeatAnalysis]);

  // ── Fork 2: Initialize renderData when lyrics arrive ──
  useEffect(() => {
    if (!lines?.length) return;
    if (renderData && beatGrid && cinematicDirectionRef.current) {
      plog("FORK 2 short-circuit — all data loaded from DB");
      pipelineTriggeredRef.current = true;
      setGenerationStatus({ beatGrid: "done", renderData: "done", cinematicDirection: "done", sectionImages: "done" });
      return;
    }
    if (!pipelineTriggeredRef.current || pipelineRetryCount > 0) {
      pipelineTriggeredRef.current = true;
      plog("FORK 2 renderData stub created", { linesCount: lines.length, retry: pipelineRetryCount > 0 });
      if (!renderData) {
        const stub = { source: "presetDerivation", generatedAt: new Date().toISOString() };
        setRenderData(stub);
        if (savedIdRef.current) void persistRenderData(savedIdRef.current, stub);
      }
    }
  }, [lines, pipelineRetryCount, renderData, beatGrid, persistRenderData]);

  // ── Fork 3: Hook detection starts when transcription + beat grid ready ──
  useEffect(() => {
    if (!transcriptionDone || !beatGridDone) return;
    if (!words?.length || !lines?.length) return;
    plog("TRIGGER hook detection", { wordsCount: words.length, linesCount: lines.length });
    void startHookDetection();
  }, [transcriptionDone, beatGridDone, words, lines, startHookDetection]);

  useEffect(() => {
    const values = Object.values(generationStatus);
    const allDone = values.every(v => v === "done");
    const hasRunning = values.includes("running");
    const hasError = values.includes("error");

    plog("READINESS check", { ...generationStatus, allDone, hasRunning, hasError });

    if (allDone) {
      setFitReadiness("ready");
      setFitProgress(100);
      setFitStageLabel("Ready");
      setPipelineStages(prev => ({ ...prev, transcript: "done" }));
      return;
    }
    if (hasRunning) {
      setFitReadiness("running");
      if (generationStatus.renderData === "running" || generationStatus.beatGrid === "running") {
        setFitStageLabel("Analyzing song...");
      } else if (generationStatus.cinematicDirection === "running") {
        setFitStageLabel("Creating cinematic direction...");
      } else if (generationStatus.sectionImages === "running") {
        setFitStageLabel("Generating artwork...");
      } else {
        setFitStageLabel("Building your Fit…");
      }
      setPipelineStages(prev => ({ ...prev, transcript: "running" }));
      return;
    }
    if (hasError) {
      setFitReadiness("error");
      setFitStageLabel("Background generation failed");
      setPipelineStages(prev => ({ ...prev, transcript: "pending" }));
      return;
    }
    if (values.some(v => v === "done")) {
      setFitReadiness("running");
      setFitStageLabel("Finalizing background jobs…");
      return;
    }

    setFitReadiness("not_started");
    setFitProgress(0);
    setFitStageLabel("");
    setPipelineStages({ rhythm: "pending", sections: "pending", cinematic: "pending", transcript: "pending" });
  }, [generationStatus, fitPipelineMs]);

  const retryGeneration = useCallback(() => {
    if (!audioFile || !lines.length) return;
    plog("RETRY — recompute analysis (keeping beatGrid + audioBuffer)");
    // Keep: beatGrid (same audio = same BPM/beats), audioBuffer, transcriptionDone, lines, words
    // Clear: songSignature, audioSections, cinematicDirection, renderData, images
    setRenderData(null);
    setCinematicDirection(null);
    setSongSignature(null);
    setAudioSections([]);
    setGenerationStatus(prev => ({
      beatGrid: prev.beatGrid === "done" ? "done" : "idle",
      renderData: "done",
      cinematicDirection: "idle",
      sectionImages: "idle",
    }));
    pipelineTriggeredRef.current = false;
    cinematicTriggeredRef.current = false;
    sectionPipelineRunningRef.current = false;
    sectionPipelineDoneRef.current = false;
    hookDetectionRunRef.current = false;

    if (savedIdRef.current) {
      persistRenderData(savedIdRef.current, { cinematicDirection: null });
      void supabase
        .from("saved_lyrics")
        .update({ section_images: null } as any)
        .eq("id", savedIdRef.current);
    }

    // Bump retry counter → re-triggers Fork 2 + section pipeline + cinematic effects
    setTimeout(() => {
      setPipelineRetryCount(c => c + 1);
    }, 100);
  }, [audioFile, lines, persistRenderData]);

  useEffect(() => {
    if (fitUnlocked || fitReadiness === "ready") {
      setFitUnlocked(true);
    }
  }, [fitUnlocked, fitReadiness]);

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if (nextView === "fit" && !fitUnlocked && fitReadiness !== "ready" && fitReadiness !== "not_started") return;
    setActiveTab(nextView);
  }, [fitUnlocked, fitReadiness]);

  const handleBackToLyrics = useCallback(() => handleViewChange("lyrics"), [handleViewChange]);

  const handleImageGenerationStatusChange = useCallback((status: "idle" | "running" | "done" | "error") => {
    setGenerationStatus(prev => ({ ...prev, sectionImages: status }));
  }, []);

  const fitDisabled = !transcriptionDone;

  const handleRegenerateSectionsVisuals = useCallback(() => {
    setSectionsDirty(false);
    void startCinematicDirection(lines, true);
  }, [lines, startCinematicDirection]);


  const sceneInputNode = !lyricData ? (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type="text"
          value={sceneDescription}
          onChange={e => {
            setSceneDescription(e.target.value);
            setResolvedScene(null);
          }}
          placeholder="Where are you when this song plays? ex: driving at night. on a rooftop. in a crowded club."
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-foreground text-sm placeholder:text-muted-foreground/50 placeholder:italic focus:outline-none focus:ring-1 focus:ring-primary/50"
          maxLength={200}
          aria-label="Scene description"
        />
        {resolvingScene && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono animate-pulse">
            reading vibe...
          </div>
        )}
      </div>
      {resolvedScene && !resolvingScene ? (
        <p className="text-primary text-xs font-mono">
          ✓ {resolvedScene.moodSummary}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex flex-col flex-1">
      {lyricData && (
        <LyricFitToggle
          view={activeTab}
          onViewChange={handleViewChange}
          fitDisabled={fitDisabled}
          fitUnlocked={fitUnlocked}
          fitReadiness={fitReadiness}
          fitProgress={fitProgress}
          fitStageLabel={fitStageLabel}
          pipelineStages={pipelineStages}
        />
      )}

      <div style={{ display: activeTab === "lyrics" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <LyricsTab
          lyricData={lyricData}
          setLyricData={setLyricData}
          audioFile={audioFile}
          setAudioFile={setAudioFile}
          hasRealAudio={hasRealAudio}
          setHasRealAudio={setHasRealAudio}
          savedId={savedId}
          setSavedId={setSavedId}
          setLines={setLines}
          waveformData={waveformData}
          fmlyLines={fmlyLines}
          setFmlyLines={setFmlyLines}
          versionMeta={versionMeta}
          setVersionMeta={setVersionMeta}
          beatGrid={beatGrid}
          setWords={setWords}
          onProjectSaved={onProjectSaved}
          onNewProject={() => {
            setRenderData(null);
            setBeatGrid(null);
            setSongSignature(null);
            setCinematicDirection(null);
            setLines([]);
            setAudioBuffer(null);
            setWaveformData(null);
            setTranscriptionDone(false);
            setBeatGridDone(false);
            setAudioBufferReady(false);
            setAudioSections([]);
            setGenerationStatus({ beatGrid: "idle", renderData: "done", cinematicDirection: "idle", sectionImages: "idle" });
            setSectionOverrides(null);
            setSectionsDirty(false);
            setFitReadiness("not_started");
            setFitUnlocked(false);
            cinematicTriggeredRef.current = false;
            pipelineTriggeredRef.current = false;
            sectionPipelineRunningRef.current = false;
            sectionPipelineDoneRef.current = false;
            hookDetectionRunRef.current = false;
            onNewProject?.();
          }}
          onHeaderProject={activeTab === "lyrics" ? onHeaderProject : undefined}
          onSavedId={onSavedId}
          analysisModel={analysisModel}
          transcriptionModel={transcriptionModel}
          sceneInput={sceneInputNode}
          onAudioSubmitted={handleAudioSubmitted}
          onUploadStarted={(payload) => {
            setActiveTab("lyrics");
            setPipelineStages(prev => ({ ...prev, transcript: "running" }));
            onUploadStartedProp?.(payload);
          }}
        />
      </div>
      <div style={{ display: activeTab === "fit" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {lyricData && audioFile ? (
        <FitTab
          lyricData={lyricData}
          audioFile={audioFile}
          hasRealAudio={hasRealAudio}
          savedId={savedId}
          renderData={renderData}
          setRenderData={setRenderData}
          beatGrid={beatGrid}
          setBeatGrid={setBeatGrid}
          songSignature={songSignature}
          setSongSignature={setSongSignature}
          cinematicDirection={cinematicDirection}
          setCinematicDirection={setCinematicDirection}
          generationStatus={generationStatus}
          audioSections={audioSections}
          words={words}
          sectionOverrides={sectionOverrides}
          onSectionOverridesChange={handleSectionOverridesChange}
          mergedSections={mergedSections}
          sectionsDirty={sectionsDirty}
          onRegenerateSectionsVisuals={handleRegenerateSectionsVisuals}
          onAddSection={handleAddSection}
          onRemoveSection={handleRemoveSection}
           onRetry={retryGeneration}
           onHeaderProject={activeTab === "fit" ? onHeaderProject : undefined}
           onBack={handleBackToLyrics}
           onImageGenerationStatusChange={handleImageGenerationStatusChange}
           pipelineStages={pipelineStages}
           cinematicSections={
             Array.isArray(cinematicDirection?.sections)
               ? cinematicDirection.sections
               : undefined
           }
        />
        ) : null}
      </div>
    </div>
  );
}
