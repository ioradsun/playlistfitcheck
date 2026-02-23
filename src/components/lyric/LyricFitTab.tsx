/**
 * LyricFitTab — Thin parent container with two-tab architecture.
 * Holds all shared state. Renders LyricFitToggle + LyricsTab or FitTab.
 * Analysis pipeline runs in background; Fit tab reads shared state.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { safeManifest } from "@/engine/validateManifest";
import { buildManifestFromDna } from "@/engine/buildManifestFromDna";
import { useBeatGrid, type BeatGridData } from "@/hooks/useBeatGrid";
import type { LyricData, LyricLine } from "./LyricDisplay";
import type { SongSignature } from "@/lib/songSignatureAnalyzer";
import type { SceneManifest as FullSceneManifest } from "@/engine/SceneManifest";
import { LyricFitToggle, type LyricFitView } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";

export type FitReadiness = "not_started" | "running" | "ready" | "error";
export type GenerationJobStatus = "idle" | "running" | "done" | "error";

export interface GenerationStatus {
  beatGrid: GenerationJobStatus;
  songDna: GenerationJobStatus;
  cinematicDirection: GenerationJobStatus;
}

export type PipelineStageStatus = "pending" | "running" | "done";
export interface PipelineStages {
  rhythm: PipelineStageStatus;
  songDna: PipelineStageStatus;
  cinematic: PipelineStageStatus;
  transcript: PipelineStageStatus;
}

interface Props {
  initialLyric?: any;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
}

export function LyricFitTab({
  initialLyric,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
}: Props) {
  const [activeTab, setActiveTab] = useState<LyricFitView>("lyrics");
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(null);
  const [versionMeta, setVersionMeta] = useState<any | null>(null);

  const [songDna, setSongDna] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [songSignature, setSongSignature] = useState<SongSignature | null>(null);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [sceneManifest, setSceneManifest] = useState<FullSceneManifest | null>(null);

  const [fitReadiness, setFitReadiness] = useState<FitReadiness>("not_started");
  const [fitProgress, setFitProgress] = useState(0);
  const [fitStageLabel, setFitStageLabel] = useState("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStages>({
    rhythm: "pending", songDna: "pending", cinematic: "pending", transcript: "pending",
  });
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    beatGrid: "idle",
    songDna: "idle",
    cinematicDirection: "idle",
  });

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const { beatGrid: detectedGrid } = useBeatGrid(beatGrid ? null : audioBuffer);

  useEffect(() => {
    if (!detectedGrid || beatGrid) return;
    setBeatGrid(detectedGrid);
    setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "done" }));
    setFitProgress(prev => Math.max(prev, 35));
  }, [detectedGrid, beatGrid]);

  const [analysisModel, setAnalysisModel] = useState("google/gemini-2.5-flash");
  const [transcriptionModel, setTranscriptionModel] = useState("scribe");

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

  useEffect(() => { savedIdRef.current = savedId; }, [savedId]);

  useEffect(() => {
    if (initialLyric && !lyricData) {
      const filename = initialLyric.filename || "saved-lyrics.mp3";
      const newData: LyricData = {
        title: resolveProjectTitle(initialLyric.title, filename),
        artist: initialLyric.artist,
        lines: initialLyric.lines as any[],
      };
      setLyricData(newData);
      setLines(initialLyric.lines as any[]);
      setSavedId(initialLyric.id);
      savedIdRef.current = initialLyric.id;
      setFmlyLines((initialLyric as any).fmly_lines ?? null);
      setVersionMeta((initialLyric as any).version_meta ?? null);

      const savedBg = (initialLyric as any).beat_grid;
      if (savedBg) {
        setBeatGrid(savedBg as BeatGridData);
        setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
      }

      const loadedSongDna = (initialLyric as any).song_dna ?? null;
      if (loadedSongDna) {
        setSongDna(loadedSongDna);
        setGenerationStatus(prev => ({ ...prev, songDna: "done" }));
        if ((loadedSongDna as any).cinematicDirection) {
          setCinematicDirection((loadedSongDna as any).cinematicDirection);
          setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
        }
      }

      const savedSignature = (initialLyric as any).song_signature;
      if (savedSignature) setSongSignature(savedSignature as SongSignature);

      setBgImageUrl((initialLyric as any).background_image_url ?? null);

      if (loadedSongDna) {
        const m = buildManifestFromDna(loadedSongDna as Record<string, unknown>);
        if (m) setSceneManifest(safeManifest(m).manifest);
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
    }
  }, [initialLyric, lyricData, resolveProjectTitle]);

  const persistSongDna = useCallback(async (id: string, payload: Record<string, unknown>, attempt = 1): Promise<boolean> => {
    try {
      const { data: updated, error } = await supabase
        .from("saved_lyrics")
        .update({ song_dna: payload as any, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) {
        if (attempt < 3) return persistSongDna(id, payload, attempt + 1);
        return false;
      }
      if (!updated) {
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          return persistSongDna(id, payload, attempt + 1);
        }
        return false;
      }
      return true;
    } catch {
      if (attempt < 3) return persistSongDna(id, payload, attempt + 1);
      return false;
    }
  }, []);

  const startBeatAnalysis = useCallback(async (targetAudioFile: File) => {
    if (!targetAudioFile || !hasRealAudio || targetAudioFile.size === 0) return;
    if (beatGrid) {
      setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
      return;
    }
    if (generationStatus.beatGrid === "running" || generationStatus.beatGrid === "done") return;

    setGenerationStatus(prev => ({ ...prev, beatGrid: "running" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "running" }));

    try {
      const ctx = new AudioContext();
      const ab = await targetAudioFile.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      setAudioBuffer(buf);
      ctx.close();
    } catch {
      setGenerationStatus(prev => ({ ...prev, beatGrid: "error" }));
    }
  }, [hasRealAudio, beatGrid, generationStatus.beatGrid]);

  const startLyricAnalyze = useCallback(async (sourceLines: LyricLine[], targetAudioFile: File) => {
    if (!lyricData || !sourceLines.length || !targetAudioFile) return;
    if (generationStatus.songDna === "running" || generationStatus.songDna === "done") return;

    setGenerationStatus(prev => ({ ...prev, songDna: "running" }));
    setPipelineStages(prev => ({ ...prev, songDna: "running" }));

    const lyricsText = sourceLines
      .filter((l: any) => l.tag !== "adlib")
      .map((l: any) => l.text)
      .join("\n");

    let audioBase64: string | undefined;
    let format: string | undefined;

    if (hasRealAudio && targetAudioFile.size > 0) {
      try {
        const arrayBuffer = await targetAudioFile.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        audioBase64 = btoa(binary);
        const name = targetAudioFile.name.toLowerCase();
        if (name.endsWith(".wav")) format = "wav";
        else if (name.endsWith(".m4a")) format = "m4a";
        else if (name.endsWith(".flac")) format = "flac";
        else if (name.endsWith(".ogg")) format = "ogg";
        else if (name.endsWith(".webm")) format = "webm";
        else format = "mp3";
      } catch {}
    }

    const { data: dnaResult, error: dnaError } = await supabase.functions.invoke("lyric-analyze", {
      body: {
        title: lyricData.title,
        artist: lyricData.artist,
        lyrics: lyricsText,
        audioBase64,
        format,
        beatGrid: beatGrid ? { bpm: beatGrid.bpm, confidence: beatGrid.confidence } : undefined,
        includeHooks: true,
      },
    });

    if (dnaError) {
      console.error("[Pipeline] lyric-analyze error:", dnaError);
      setGenerationStatus(prev => ({ ...prev, songDna: "error" }));
      return;
    }

    const rawHooks = Array.isArray(dnaResult?.hottest_hooks)
      ? dnaResult.hottest_hooks
      : dnaResult?.hottest_hook ? [dnaResult.hottest_hook] : [];

    const parseHook = (raw: any) => {
      if (!raw?.start_sec) return null;
      const startSec = Number(raw.start_sec);
      const durationSec = Number(raw.duration_sec) || 10;
      const conf = Number(raw.confidence) || 0;
      if (conf < 0.5) return null;
      return {
        hook: { start: startSec, end: startSec + durationSec, score: Math.round(conf * 100), reasonCodes: [], previewText: "", status: conf >= 0.75 ? "confirmed" : "candidate" },
        justification: raw.justification,
        label: raw.label,
      };
    };

    const parsedHooks = rawHooks.map(parseHook).filter(Boolean);
    const primary = parsedHooks[0] || null;
    const secondary = parsedHooks[1] || null;

    const nextSongDna = {
      mood: dnaResult?.mood,
      description: dnaResult?.description,
      meaning: dnaResult?.meaning,
      hook: primary?.hook || null,
      secondHook: secondary?.hook || null,
      hookJustification: primary?.justification,
      secondHookJustification: secondary?.justification,
      hookLabel: primary?.label,
      secondHookLabel: secondary?.label,
      physicsSpec: dnaResult?.physics_spec || null,
      scene_manifest: dnaResult?.scene_manifest || dnaResult?.sceneManifest || null,
    };

    setSongDna(nextSongDna);
    setGenerationStatus(prev => ({ ...prev, songDna: "done" }));
    setPipelineStages(prev => ({ ...prev, songDna: "done" }));
    setFitProgress(prev => Math.max(prev, 70));

    const builtManifest = buildManifestFromDna(nextSongDna as Record<string, unknown>);
    if (builtManifest) {
      setSceneManifest(safeManifest(builtManifest).manifest);
    } else if (nextSongDna.scene_manifest) {
      setSceneManifest(safeManifest(nextSongDna.scene_manifest).manifest);
    }

    if (savedIdRef.current) {
      await persistSongDna(savedIdRef.current, { ...nextSongDna, cinematicDirection });
    }
  }, [lyricData, generationStatus.songDna, hasRealAudio, beatGrid, cinematicDirection, persistSongDna]);

  const startCinematicDirection = useCallback(async (sourceLines: LyricLine[]) => {
    if (!lyricData || !sourceLines.length) return;
    if (generationStatus.cinematicDirection === "running" || generationStatus.cinematicDirection === "done") return;

    setGenerationStatus(prev => ({ ...prev, cinematicDirection: "running" }));
    setPipelineStages(prev => ({ ...prev, cinematic: "running" }));

    try {
      const lyricsForDirection = sourceLines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

      const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
        body: {
          title: lyricData.title,
          artist: lyricData.artist,
          lines: lyricsForDirection,
          beatGrid: beatGrid ? { bpm: beatGrid.bpm } : undefined,
          lyricId: savedIdRef.current || undefined,
        },
      });

      if (dirResult?.cinematicDirection) {
        const enrichedDirection = beatGrid
          ? { ...dirResult.cinematicDirection, beat_grid: { bpm: beatGrid.bpm, confidence: beatGrid.confidence } }
          : dirResult.cinematicDirection;
        setCinematicDirection(enrichedDirection);
      }

      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
      setFitProgress(prev => Math.max(prev, 85));
    } catch {
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "error" }));
    }
  }, [lyricData, generationStatus.cinematicDirection, beatGrid]);

  useEffect(() => {
    if (!lines?.length || !audioFile) return;
    startBeatAnalysis(audioFile);
    startLyricAnalyze(lines, audioFile);
    startCinematicDirection(lines);
  }, [lines, audioFile, startBeatAnalysis, startLyricAnalyze, startCinematicDirection]);

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
    setPipelineStages({ rhythm: "pending", songDna: "pending", cinematic: "pending", transcript: "pending" });
  }, [generationStatus]);

  const retryGeneration = useCallback(() => {
    if (!audioFile || !lines.length) return;
    setGenerationStatus(prev => ({
      beatGrid: prev.beatGrid === "error" ? "idle" : prev.beatGrid,
      songDna: prev.songDna === "error" ? "idle" : prev.songDna,
      cinematicDirection: prev.cinematicDirection === "error" ? "idle" : prev.cinematicDirection,
    }));
    startBeatAnalysis(audioFile);
    startLyricAnalyze(lines, audioFile);
    startCinematicDirection(lines);
  }, [audioFile, lines, startBeatAnalysis, startLyricAnalyze, startCinematicDirection]);

  const fitDisabled = !lines || lines.length === 0;

  return (
    <div className="flex flex-col flex-1">
      {lyricData && (
        <LyricFitToggle
          view={activeTab}
          onViewChange={setActiveTab}
          fitDisabled={fitDisabled}
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
          fmlyLines={fmlyLines}
          setFmlyLines={setFmlyLines}
          versionMeta={versionMeta}
          setVersionMeta={setVersionMeta}
          beatGrid={beatGrid}
          onProjectSaved={onProjectSaved}
          onNewProject={() => {
            setSongDna(null);
            setBeatGrid(null);
            setSongSignature(null);
            setCinematicDirection(null);
            setBgImageUrl(null);
            setSceneManifest(null);
            setLines([]);
            setGenerationStatus({ beatGrid: "idle", songDna: "idle", cinematicDirection: "idle" });
            setFitReadiness("not_started");
            onNewProject?.();
          }}
          onHeaderProject={onHeaderProject}
          onSavedId={onSavedId}
          analysisModel={analysisModel}
          transcriptionModel={transcriptionModel}
        />
      ) : lyricData && audioFile ? (
        <FitTab
          lyricData={lyricData}
          audioFile={audioFile}
          hasRealAudio={hasRealAudio}
          savedId={savedId}
          songDna={songDna}
          setSongDna={setSongDna}
          beatGrid={beatGrid}
          setBeatGrid={setBeatGrid}
          songSignature={songSignature}
          setSongSignature={setSongSignature}
          sceneManifest={sceneManifest}
          setSceneManifest={setSceneManifest}
          cinematicDirection={cinematicDirection}
          setCinematicDirection={setCinematicDirection}
          bgImageUrl={bgImageUrl}
          setBgImageUrl={setBgImageUrl}
          generationStatus={generationStatus}
          onRetry={retryGeneration}
          onHeaderProject={onHeaderProject}
          onBack={() => setActiveTab("lyrics")}
        />
      ) : null}
    </div>
  );
}
