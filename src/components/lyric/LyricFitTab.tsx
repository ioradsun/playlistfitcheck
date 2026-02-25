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
  const { user } = useAuth();
  const artistNameRef = useRef<string>("artist");
  const [activeTab, setActiveTab] = useState<LyricFitView>("lyrics");
  const [sceneDescription, setSceneDescription] = useState('');
  const [resolvedScene, setResolvedScene] = useState<SceneContextResult | null>(null);
  const [resolvingScene, setResolvingScene] = useState(false);
  const [fitUnlocked, setFitUnlocked] = useState(false);
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedIdRef = useRef<string | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(null);
  const [versionMeta, setVersionMeta] = useState<any | null>(null);
  const [words, setWords] = useState<Array<{ word: string; start: number; end: number }> | null>(null);

  const [songDna, setSongDna] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [songSignature, setSongSignature] = useState<SongSignature | null>(null);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [sceneManifest, setSceneManifest] = useState<any | null>(null);

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

  const audioSections = useMemo(() => {
    if (!songSignature || !beatGrid || !audioDurationSec) return [];
    return detectSections(songSignature, beatGrid, timestampedLines, audioDurationSec);
  }, [songSignature, beatGrid, timestampedLines, audioDurationSec]);

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
    setBeatGrid(detectedGrid);
    setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
    setPipelineStages(prev => ({ ...prev, rhythm: "done" }));
    setFitProgress(prev => Math.max(prev, 35));
  }, [detectedGrid, beatGrid]);

  useEffect(() => {
    if (!audioBuffer || !beatGrid || songSignature) return;
    const lyricsText = timestampedLines.map((line) => line.text).join("\n");
    let cancelled = false;

    songSignatureAnalyzer
      .analyze(audioBuffer, beatGrid, lyricsText, audioDurationSec)
      .then(async (signature) => {
        if (cancelled) return;
        setSongSignature(signature);
        if (savedIdRef.current) {
          await supabase
            .from("saved_lyrics")
            .update({ song_signature: signature as any, updated_at: new Date().toISOString() })
            .eq("id", savedIdRef.current);
        }
      })
      .catch((error) => {
        console.warn("[song-signature] failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [audioBuffer, beatGrid, songSignature, timestampedLines, audioDurationSec]);


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

  // (persist effect moved below persistSongDna definition)

  useEffect(() => {
    if (initialLyric && !lyricData) {
      const filename = initialLyric.filename || "saved-lyrics.mp3";
      const newData: LyricData = {
        title: resolveProjectTitle(initialLyric.title, filename),
        lines: initialLyric.lines as any[],
      };
      setLyricData(newData);
      setLines(initialLyric.lines as any[]);
      setSavedId(initialLyric.id);
      savedIdRef.current = initialLyric.id;
      setFmlyLines((initialLyric as any).fmly_lines ?? null);
      setVersionMeta((initialLyric as any).version_meta ?? null);
      setWords((initialLyric as any).words ?? null);

      const savedBg = (initialLyric as any).beat_grid;
      if (savedBg) {
        setBeatGrid(savedBg as BeatGridData);
        setGenerationStatus(prev => ({ ...prev, beatGrid: "done" }));
      }

      const loadedSongDna = (initialLyric as any).song_dna ?? null;
      const loadedCinematicDirection =
        (initialLyric as any).cinematic_direction ??
        (loadedSongDna as any)?.cinematicDirection ??
        (loadedSongDna as any)?.cinematic_direction ??
        null;

      if (loadedSongDna) {
        setSongDna(loadedSongDna);
        setGenerationStatus(prev => ({ ...prev, songDna: "done" }));
      }

      if (loadedCinematicDirection) {
        setCinematicDirection(loadedCinematicDirection);
        setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
      }

      // If all three analysis results exist, lock the pipeline gate immediately
      if (savedBg && loadedCinematicDirection) {
        pipelineTriggeredRef.current = true;
        setFitReadiness("ready");
        setFitProgress(100);
        setFitUnlocked(true);
      }

      const savedSignature = (initialLyric as any).song_signature;
      if (savedSignature) setSongSignature(savedSignature as SongSignature);

      setBgImageUrl((initialLyric as any).background_image_url ?? null);

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
        console.warn("[persistSongDna] error attempt", attempt, error.message);
        if (attempt < 3) return persistSongDna(id, payload, attempt + 1);
        return false;
      }
      if (!updated) {
        console.warn("[persistSongDna] no row matched attempt", attempt, id);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          return persistSongDna(id, payload, attempt + 1);
        }
        return false;
      }
      console.log("[persistSongDna] success", id);
      return true;
    } catch (e) {
      console.warn("[persistSongDna] exception attempt", attempt, e);
      if (attempt < 3) return persistSongDna(id, payload, attempt + 1);
      return false;
    }
  }, []);

  // Persist song_dna whenever we have both a saved project and computed DNA
  // Only persist when songDna changes (not cinematicDirection alone — that's handled in startCinematicDirection)
  useEffect(() => {
    if (savedIdRef.current && songDna) {
      const payload = { ...songDna };
      // Only include cinematicDirection if it's not null (avoid overwriting a deliberate clear)
      if (cinematicDirection) payload.cinematicDirection = cinematicDirection;
      persistSongDna(savedIdRef.current, payload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId, songDna, persistSongDna]);

  const startBeatAnalysis = useCallback(async (targetAudioFile: File) => {
    if (!targetAudioFile || !hasRealAudio || targetAudioFile.size === 0) return;
    // Data-existence guard: if we already have beatGrid (e.g. loaded from DB), skip
    if (beatGrid) {
      setGenerationStatus(prev => prev.beatGrid === "done" ? prev : ({ ...prev, beatGrid: "done" }));
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

  const startSongDefaultsDerivation = useCallback(async () => {
    if (songDna) {
      setGenerationStatus(prev => prev.songDna === "done" ? prev : ({ ...prev, songDna: "done" }));
      return;
    }
    if (generationStatus.songDna === "running" || generationStatus.songDna === "done") return;

    setGenerationStatus(prev => ({ ...prev, songDna: "running" }));
    setPipelineStages(prev => ({ ...prev, songDna: "running" }));

    const nextSongDefaults = {
      source: "presetDerivation",
      generatedAt: new Date().toISOString(),
    };

    setSongDna(nextSongDefaults);
    setGenerationStatus(prev => ({ ...prev, songDna: "done" }));
    setPipelineStages(prev => ({ ...prev, songDna: "done" }));
    setFitProgress(prev => Math.max(prev, 70));

    if (savedIdRef.current) {
      await persistSongDna(savedIdRef.current, nextSongDefaults);
    }
  }, [generationStatus.songDna, persistSongDna, songDna]);

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

        // Section images are generated after dance publish (PublishLyricDanceButton)

        const derivedPreset = (enrichedDirection as any)?.presetDerivation ?? null;
        if (derivedPreset) setSceneManifest(derivedPreset);

        // Persist cinematic direction back to song_dna in DB
        if (savedIdRef.current) {
          const existingSongDna = songDna || {};
          persistSongDna(savedIdRef.current, { ...existingSongDna, cinematicDirection: enrichedDirection });
        }
      }

      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "done" }));
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
      setFitProgress(prev => Math.max(prev, 85));
    } catch {
      setGenerationStatus(prev => ({ ...prev, cinematicDirection: "error" }));
    }
  }, [lyricData, generationStatus.cinematicDirection, beatGrid, cinematicDirection, songDna, persistSongDna, songSignature, audioSections]);

  const pipelineTriggeredRef = useRef(false);
  const [pipelineRetryCount, setPipelineRetryCount] = useState(0);
  useEffect(() => {
    if (!lines?.length || !audioFile) return;
    if (pipelineTriggeredRef.current && pipelineRetryCount === 0) return;
    // If all data already loaded from DB, skip pipeline entirely
    if (songDna && beatGrid && cinematicDirection) {
      pipelineTriggeredRef.current = true;
      setGenerationStatus({ beatGrid: "done", songDna: "done", cinematicDirection: "done" });
      return;
    }
    pipelineTriggeredRef.current = true;
    console.log("[Pipeline] Starting pipeline, retry:", pipelineRetryCount);
    startBeatAnalysis(audioFile);
    startSongDefaultsDerivation();
    startCinematicDirection(lines, pipelineRetryCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, audioFile, pipelineRetryCount, startSongDefaultsDerivation, startCinematicDirection, songDna, beatGrid, cinematicDirection]);

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
    console.log("[Pipeline] Retry requested — clearing all state");
    // Reset all state
    setSongDna(null);
    setCinematicDirection(null);
    setBeatGrid(null);
    setSceneManifest(null);
    setAudioBuffer(null);
    setGenerationStatus({ beatGrid: "idle", songDna: "idle", cinematicDirection: "idle" });
    pipelineTriggeredRef.current = false;

    // Clear from DB
    if (savedIdRef.current) {
      persistSongDna(savedIdRef.current, { cinematicDirection: null });
    }

    // Bump retry counter — the pipeline effect will re-run with fresh closures
    // after React processes the state clears above
    setTimeout(() => {
      setPipelineRetryCount(c => c + 1);
    }, 100);
  }, [audioFile, lines, persistSongDna]);

  useEffect(() => {
    if (fitUnlocked || fitReadiness === "ready") {
      setFitUnlocked(true);
    }
  }, [fitUnlocked, fitReadiness]);

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if (nextView === "fit" && !fitUnlocked && fitReadiness !== "ready" && fitReadiness !== "not_started") return;
    setActiveTab(nextView);
  }, [fitUnlocked, fitReadiness]);

  const fitDisabled = !lines || lines.length === 0;

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
          fmlyLines={fmlyLines}
          setFmlyLines={setFmlyLines}
          versionMeta={versionMeta}
          setVersionMeta={setVersionMeta}
          beatGrid={beatGrid}
          setWords={setWords}
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
            setFitUnlocked(false);
            onNewProject?.();
          }}
          onHeaderProject={onHeaderProject}
          onSavedId={onSavedId}
          analysisModel={analysisModel}
          transcriptionModel={transcriptionModel}
          sceneInput={sceneInputNode}
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
          words={words}
          onRetry={retryGeneration}
          onHeaderProject={onHeaderProject}
          onBack={() => handleViewChange("lyrics")}
        />
      ) : null}
    </div>
  );
}
