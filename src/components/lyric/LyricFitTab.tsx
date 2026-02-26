/**
 * LyricFitTab — Thin parent container with two-tab architecture.
 * Holds all shared state. Renders LyricFitToggle + LyricsTab or FitTab.
 * Analysis pipeline runs in background; Fit tab reads shared state.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";
import type { LyricData, LyricLine } from "./LyricDisplay";
import { songSignatureAnalyzer, type SongSignature } from "@/lib/songSignatureAnalyzer";
import { detectSections, type TimestampedLine } from "@/engine/sectionDetector";
import { LyricFitToggle, type LyricFitView } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";
import type { SceneContextResult } from "@/lib/sceneContexts";
import type { WaveformData } from "@/hooks/useAudioEngine";

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
}

export type PipelineStageStatus = "pending" | "running" | "done";
export interface PipelineStages {
  rhythm: PipelineStageStatus;
  renderData: PipelineStageStatus;
  cinematic: PipelineStageStatus;
  transcript: PipelineStageStatus;
}

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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(initialLyric?.id ?? null);
  const savedIdRef = useRef<string | null>(initialLyric?.id ?? null);
  const renderDataLoadedFromDbRef = useRef(false);
  const [lines, setLines] = useState<LyricLine[]>(initialLyric?.lines as any[] ?? []);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(initialLyric?.fmly_lines ?? null);
  const [versionMeta, setVersionMeta] = useState<any | null>(initialLyric?.version_meta ?? null);
  const [words, setWords] = useState<Array<{ word: string; start: number; end: number }> | null>(initialLyric?.words ?? null);

  const [renderData, setRenderData] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [songSignature, setSongSignature] = useState<SongSignature | null>(null);
  const [audioSections, setAudioSections] = useState<any[]>([]);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(null);
  // bgImageUrl and frameState removed — V3 derives from cinematicDirection

  const [fitReadiness, setFitReadiness] = useState<FitReadiness>("not_started");
  const [fitProgress, setFitProgress] = useState(0);
  const [fitStageLabel, setFitStageLabel] = useState("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStages>({
    rhythm: "pending", renderData: "pending", cinematic: "pending", transcript: "pending",
  });
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    beatGrid: "idle",
    renderData: "idle",
    cinematicDirection: "idle",
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

  const sectionsReady = audioSections.length > 0;

  useEffect(() => {
    const done = timestampedLines.length > 0;
    if (done) console.log(`[Transcribe Debug] transcriptionDone=true, lines=${timestampedLines.length}`);
    setTranscriptionDone(done);
  }, [timestampedLines]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).single()
      .then(({ data }) => { if (data?.display_name) artistNameRef.current = data.display_name; });
  }, [user]);

  // Debounced scene resolution
  useEffect(() => {
    if (!sceneDescription.trim() || sceneDescription.length < 10) return;
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
    console.log(`[Transcribe Debug] beatGridDone=true, bpm=${detectedGrid.bpm}`);
    setBeatGrid(detectedGrid);
    setBeatGridDone(true);
    setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "done" }));
    setFitProgress(prev => Math.max(prev, 35));
  }, [detectedGrid, beatGrid]);

  // Ensure audioBuffer is decoded when audioFile exists (e.g. loaded from DB)
  // songSignature needs audioBuffer even if beatGrid was loaded from saved data
  // PERF: Skip eager decode when all analysis data is already loaded — decode on demand
  const allAnalysisLoaded = !!(beatGrid && songSignature && cinematicDirection);
  useEffect(() => {
    if (audioBuffer || !audioFile || audioFile.size === 0) return;
    // If all analysis data is loaded from DB, defer decode until user needs playback
    if (allAnalysisLoaded) return;
    let cancelled = false;
    const ctx = new AudioContext();
    audioFile.arrayBuffer().then((ab) =>
      ctx.decodeAudioData(ab).then((buf) => {
        if (!cancelled) {
          console.log(`[Transcribe Debug] audioBufferReady=true, duration=${buf.duration.toFixed(1)}s`);
          setAudioBuffer(buf);
          setAudioBufferReady(true);
          setWaveformData(extractPeaksFromBuffer(buf));
        }
        ctx.close();
      })
    ).catch(() => ctx.close());
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
    if (savedSignature) setSongSignature(savedSignature as SongSignature);
    const savedSections = (initialLyric as any).cinematic_direction?.sections;
    if (Array.isArray(savedSections)) setAudioSections(savedSections);

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
          if (initialLyric.id) sessionAudio.set("lyric", initialLyric.id, file);
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
      console.log("[persistRenderData] success", id);
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

    // Always decode audioBuffer — songSignature needs it even if beatGrid is loaded from DB
    if (!audioBuffer) {
      try {
        const ctx = new AudioContext();
        const ab = await targetAudioFile.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        setAudioBuffer(buf);
        setAudioBufferReady(true);
        setWaveformData(extractPeaksFromBuffer(buf));
        ctx.close();
      } catch {
        console.warn("[Pipeline] AudioBuffer decode failed");
      }
    }

    // Data-existence guard: if we already have beatGrid (e.g. loaded from DB), skip detection
    if (beatGrid) {
      setBeatGridDone(true);
      setGenerationStatus(prev => prev.beatGrid === "done" ? prev : ({ ...prev, beatGrid: "done" }));
      return;
    }
    if (generationStatus.beatGrid === "running" || generationStatus.beatGrid === "done") return;

    console.log("[Pipeline] Starting beat grid analysis");
    setGenerationStatus(prev => ({ ...prev, beatGrid: "running" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "running" }));
  }, [beatGrid, generationStatus.beatGrid, audioBuffer]);

  const startSongDefaultsDerivation = useCallback(async () => {
    if (renderData) {
      setGenerationStatus(prev => prev.renderData === "done" ? prev : ({ ...prev, renderData: "done" }));
      return;
    }
    if (generationStatus.renderData === "running" || generationStatus.renderData === "done") return;

    setGenerationStatus(prev => ({ ...prev, renderData: "running" }));
    setPipelineStages(prev => ({ ...prev, renderData: "running" }));

    const nextSongDefaults = {
      source: "presetDerivation",
      generatedAt: new Date().toISOString(),
    };

    setRenderData(nextSongDefaults);
    setGenerationStatus(prev => ({ ...prev, renderData: "done" }));
    setPipelineStages(prev => ({ ...prev, renderData: "done" }));
    setFitProgress(prev => Math.max(prev, 70));

    if (savedIdRef.current) {
      await persistRenderData(savedIdRef.current, nextSongDefaults);
    }
  }, [generationStatus.renderData, persistRenderData, renderData]);

  const startCinematicDirection = useCallback(async (sourceLines: LyricLine[], force = false) => {
    if (!lyricData || !sourceLines.length) return;
    // Data-existence guard: if we already have cinematicDirection (e.g. loaded from DB), skip
    if (!force && cinematicDirection) {
      setGenerationStatus(prev => prev.cinematicDirection === "done" ? prev : ({ ...prev, cinematicDirection: "done" }));
      return;
    }
    if (!force && (generationStatus.cinematicDirection === "running" || generationStatus.cinematicDirection === "done")) return;

    setGenerationStatus(prev => ({ ...prev, cinematicDirection: "running" }));
    setPipelineStages(prev => ({ ...prev, cinematic: "running" }));

    try {
      const lyricsForDirection = sourceLines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

      const sceneContext = resolvedScene ?? null;

      const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
        body: {
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
          audioSections: audioSections.length ? audioSections : undefined,
          lyricId: savedIdRef.current || undefined,
          scene_context: sceneContext,
        },
      });

      if (dirResult?.cinematicDirection) {
        const enrichedDirection = beatGrid
          ? { ...dirResult.cinematicDirection, beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence } }
          : dirResult.cinematicDirection;
        setCinematicDirection(enrichedDirection);

        // Derive FrameRenderState from cinematic direction presets
        const { deriveFrameState } = await import("@/engine/presetDerivation");
        const { getTypography } = await import("@/engine/presetDerivation");

        const typoPreset = enrichedDirection.typography || "clean-modern";
        const typo = getTypography(typoPreset);

        const bgSystemMap: Record<string, string> = {
          void: "void", cinematic: "fracture", haze: "breath", split: "static",
          grain: "static", wash: "breath", glass: "pressure", clean: "void",
        };
        const atmospherePreset = enrichedDirection.atmosphere || "cinematic";

        deriveFrameState(enrichedDirection, 0, 0.5); // warm up cache

        // Persist cinematic direction back to render_data in DB
        if (savedIdRef.current) {
          const existingRenderData = renderData || {};
          persistRenderData(savedIdRef.current, { ...existingRenderData, cinematicDirection: enrichedDirection });
        }
      }

      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
      setFitProgress(prev => Math.max(prev, 85));
    } catch {
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "error" }));
    }
  }, [lyricData, generationStatus.cinematicDirection, beatGrid, cinematicDirection, renderData, persistRenderData, songSignature, audioSections]);

  const sectionPipelineRunningRef = useRef(false);
  const sectionPipelineDoneRef = useRef(false);

  const maybeRunSectionPipeline = useCallback(async () => {
    console.log(`[Transcribe Debug] maybeRunSectionPipeline called, flags: t=${transcriptionDone} b=${beatGridDone} a=${audioBufferReady}`);
    if (!transcriptionDone || !beatGridDone) return;
    if (!beatGrid) return;
    if (sectionPipelineRunningRef.current || sectionPipelineDoneRef.current) return;

    // If we already have both songSignature and audioSections from DB, skip entirely
    if (songSignature && audioSections.length > 0) {
      console.log(`[Transcribe Debug] section pipeline SKIPPED — data loaded from DB`);
      sectionPipelineDoneRef.current = true;
      return;
    }

    // songSignature analysis requires audioBuffer — wait for it only if we need to compute
    if (!songSignature && (!audioBufferReady || !audioBuffer)) return;

    console.log(`[Transcribe Debug] section pipeline RUNNING`);
    sectionPipelineRunningRef.current = true;
    try {
      let sig = songSignature;
      if (!sig) {
        const lyricsText = timestampedLines.map((line) => line.text).join("\n");
        sig = await songSignatureAnalyzer.analyze(audioBuffer!, beatGrid, lyricsText, audioDurationSec);
        setSongSignature(sig);
        if (savedIdRef.current) {
          await supabase
            .from("saved_lyrics")
            .update({ song_signature: sig as any, updated_at: new Date().toISOString() })
            .eq("id", savedIdRef.current);
        }
      }

      const nextSections = detectSections(sig, beatGrid, timestampedLines, audioDurationSec);
      console.log(`[Transcribe Debug] sections computed: ${nextSections.length} sections`);
      setAudioSections(nextSections);
      sectionPipelineDoneRef.current = true;
    } catch (error) {
      console.warn("[section-pipeline] failed", error);
    } finally {
      sectionPipelineRunningRef.current = false;
    }
  }, [transcriptionDone, beatGridDone, audioBufferReady, audioBuffer, beatGrid, timestampedLines, audioDurationSec, songSignature, audioSections.length]);

  useEffect(() => {
    void maybeRunSectionPipeline();
  }, [maybeRunSectionPipeline]);

  const pipelineTriggeredRef = useRef(false);
  const [pipelineRetryCount, setPipelineRetryCount] = useState(0);
  const cinematicTriggeredRef = useRef(false);
  useEffect(() => {
    if (!sectionsReady || !lines?.length) return;
    if (cinematicTriggeredRef.current && pipelineRetryCount === 0) return;
    cinematicTriggeredRef.current = true;
    console.log(`[Transcribe Debug] starting cinematic direction`);
    void startCinematicDirection(lines, pipelineRetryCount > 0);
  }, [sectionsReady, lines, pipelineRetryCount, startCinematicDirection]);

  // ── Fork 1: Beat grid starts when audio file is submitted (parallel with transcription) ──
  // Called from onAudioSubmitted callback, not from an effect waiting on lines.
  const handleAudioSubmitted = useCallback((file: File) => {
    console.log("[Pipeline] Audio submitted — starting beat grid analysis (parallel with transcription)");
    setActiveTab("lyrics");
    setPipelineStages(prev => ({ ...prev, transcript: "running" }));
    startBeatAnalysis(file);
  }, [startBeatAnalysis]);

  // ── Fork 2: Song defaults derivation starts when lyrics arrive ──
  useEffect(() => {
    if (!lines?.length) return;
    // If all data already loaded from DB, skip pipeline entirely
    if (renderData && beatGrid && cinematicDirection) {
      pipelineTriggeredRef.current = true;
      setGenerationStatus({ beatGrid: "done", renderData: "done", cinematicDirection: "done" });
      return;
    }
    if (!pipelineTriggeredRef.current || pipelineRetryCount > 0) {
      pipelineTriggeredRef.current = true;
      startSongDefaultsDerivation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, pipelineRetryCount, startSongDefaultsDerivation, renderData, beatGrid, cinematicDirection]);

  useEffect(() => {
    const values = Object.values(generationStatus);
    const allDone = values.every(v => v === "done");
    const hasRunning = values.includes("running");
    const hasError = values.includes("error");

    if (allDone) {
      setFitReadiness("ready");
      setFitProgress(100);
      setFitStageLabel("Ready");
      setPipelineStages(prev => ({ ...prev, transcript: "done" }));
      return;
    }
    if (hasRunning) {
      setFitReadiness("running");
      setFitStageLabel("Building your Fit…");
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
    setPipelineStages({ rhythm: "pending", renderData: "pending", cinematic: "pending", transcript: "pending" });
  }, [generationStatus]);

  const retryGeneration = useCallback(() => {
    if (!audioFile || !lines.length) return;
    console.log("[Pipeline] Retry requested — clearing all state");
    setRenderData(null);
    setCinematicDirection(null);
    setBeatGrid(null);
    setSongSignature(null);
    // frameState removed — V3 derives from cinematicDirection
    setAudioBuffer(null);
    setTranscriptionDone(false);
    setBeatGridDone(false);
    setAudioBufferReady(false);
    setAudioSections([]);
    setGenerationStatus({ beatGrid: "idle", renderData: "idle", cinematicDirection: "idle" });
    pipelineTriggeredRef.current = false;
    cinematicTriggeredRef.current = false;
    sectionPipelineRunningRef.current = false;
    sectionPipelineDoneRef.current = false;

    if (savedIdRef.current) {
      persistRenderData(savedIdRef.current, { cinematicDirection: null });
    }

    // Restart beat grid immediately, then bump retry counter for waterfall
    startBeatAnalysis(audioFile);
    setTimeout(() => {
      setPipelineRetryCount(c => c + 1);
    }, 100);
  }, [audioFile, lines, persistRenderData, startBeatAnalysis]);

  useEffect(() => {
    if (fitUnlocked || fitReadiness === "ready") {
      setFitUnlocked(true);
    }
  }, [fitUnlocked, fitReadiness]);

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if (nextView === "fit" && !fitUnlocked && fitReadiness !== "ready" && fitReadiness !== "not_started") return;
    setActiveTab(nextView);
  }, [fitUnlocked, fitReadiness]);

  const fitDisabled = !transcriptionDone;

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

      {activeTab === "lyrics" ? (
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
            setGenerationStatus({ beatGrid: "idle", renderData: "idle", cinematicDirection: "idle" });
            setFitReadiness("not_started");
            setFitUnlocked(false);
            cinematicTriggeredRef.current = false;
            pipelineTriggeredRef.current = false;
            sectionPipelineRunningRef.current = false;
            sectionPipelineDoneRef.current = false;
            onNewProject?.();
          }}
          onHeaderProject={onHeaderProject}
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
      ) : lyricData && audioFile ? (
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
          onRetry={retryGeneration}
          onHeaderProject={onHeaderProject}
          onBack={() => handleViewChange("lyrics")}
        />
      ) : null}
    </div>
  );
}
