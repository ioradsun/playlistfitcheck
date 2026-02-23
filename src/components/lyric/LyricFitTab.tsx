/**
 * LyricFitTab — Thin parent container with two-tab architecture.
 * Holds all shared state. Renders LyricFitToggle + LyricsTab or FitTab.
 * Analysis pipeline runs in background; Fit tab locked until ready.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionAudio } from "@/lib/sessionAudioCache";
import { toast } from "sonner";
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
  // ── Shared state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<LyricFitView>("lyrics");
  const [lyricData, setLyricData] = useState<LyricData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [hasRealAudio, setHasRealAudio] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [fmlyLines, setFmlyLines] = useState<any[] | null>(null);
  const [versionMeta, setVersionMeta] = useState<any | null>(null);

  // Fit tab state
  const [songDna, setSongDna] = useState<any | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [songSignature, setSongSignature] = useState<SongSignature | null>(null);
  const [cinematicDirection, setCinematicDirection] = useState<any | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [sceneManifest, setSceneManifest] = useState<FullSceneManifest | null>(null);

  // Pipeline readiness
  const [fitReadiness, setFitReadiness] = useState<FitReadiness>("not_started");
  const [fitProgress, setFitProgress] = useState(0);
  const [fitStageLabel, setFitStageLabel] = useState("");
  const [pipelineStages, setPipelineStages] = useState<PipelineStages>({
    rhythm: "pending", songDna: "pending", cinematic: "pending", transcript: "pending",
  });
  const pipelineRanOnce = useRef(false);

  // Beat grid detection from decoded audio
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const { beatGrid: detectedGrid } = useBeatGrid(beatGrid ? null : audioBuffer);

  useEffect(() => {
    if (detectedGrid && !beatGrid) setBeatGrid(detectedGrid);
  }, [detectedGrid, beatGrid]);

  // Pipeline model config
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

  // Read pipeline model config from site_copy
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

  // Load saved lyric from dashboard navigation
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
      setFmlyLines((initialLyric as any).fmly_lines ?? null);
      setVersionMeta((initialLyric as any).version_meta ?? null);

      const savedBg = (initialLyric as any).beat_grid;
      if (savedBg) setBeatGrid(savedBg as BeatGridData);

      const loadedSongDna = (initialLyric as any).song_dna ?? null;
      if (loadedSongDna) {
        setSongDna(loadedSongDna);
        // Restore cinematicDirection if persisted inside song_dna
        if ((loadedSongDna as any).cinematicDirection) {
          setCinematicDirection((loadedSongDna as any).cinematicDirection);
        }
      }

      const savedSignature = (initialLyric as any).song_signature;
      if (savedSignature) setSongSignature(savedSignature as SongSignature);

      setBgImageUrl((initialLyric as any).background_image_url ?? null);

      // If we already have songDna + sceneManifest from a previous run, mark ready
      if (loadedSongDna) {
        const m = buildManifestFromDna(loadedSongDna as Record<string, unknown>);
        if (m) {
          setSceneManifest(safeManifest(m).manifest);
          setFitReadiness("ready");
          pipelineRanOnce.current = true;
        }
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

  // ── Background analysis pipeline ─────────────────────────────────────
  const runPipeline = useCallback(async (forceRetry = false) => {
    if (!lyricData || !audioFile || !lines.length) return;
    if (pipelineRanOnce.current && !forceRetry) return;

    pipelineRanOnce.current = true;
    setFitReadiness("running");
    setFitProgress(5);
    setFitStageLabel("Analyzing rhythm…");
    setPipelineStages({ rhythm: "running", songDna: "pending", cinematic: "pending", transcript: "pending" });

    // 1. Fetch latest lines (internal, no stage label)
    let freshLines = lines;
    if (savedId) {
      try {
        const { data: saved } = await supabase
          .from("saved_lyrics")
          .select("lines")
          .eq("id", savedId)
          .single();
        if (saved?.lines && Array.isArray(saved.lines)) {
          freshLines = saved.lines as unknown as LyricLine[];
        }
      } catch {}
    }

    setFitProgress(10);
    setFitStageLabel("Analyzing rhythm…");

    // 2. Decode audio for beat detection if needed
    if (!beatGrid && hasRealAudio && audioFile.size > 0) {
      try {
        const ctx = new AudioContext();
        const ab = await audioFile.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        setAudioBuffer(buf);
        ctx.close();
      } catch {}
    }

    setFitProgress(25);
    setFitStageLabel("Generating Song DNA…");
    setPipelineStages(prev => ({ ...prev, rhythm: "done", songDna: "running" }));

    // 3. lyric-analyze
    const lyricsText = freshLines
      .filter((l: any) => l.tag !== "adlib")
      .map((l: any) => l.text)
      .join("\n");

    let audioBase64: string | undefined;
    let format: string | undefined;
    if (hasRealAudio && audioFile.size > 0) {
      try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
        }
        audioBase64 = btoa(binary);
        const name = audioFile.name.toLowerCase();
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
      setFitReadiness("error");
      setFitStageLabel("Analysis failed");
      toast.error("Song DNA analysis failed — you can retry from the Fit tab");
      return;
    }

    setFitProgress(55);

    const result = dnaResult;
    const rawHooks = Array.isArray(result?.hottest_hooks)
      ? result.hottest_hooks
      : result?.hottest_hook ? [result.hottest_hook] : [];

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
      mood: result?.mood,
      description: result?.description,
      meaning: result?.meaning,
      hook: primary?.hook || null,
      secondHook: secondary?.hook || null,
      hookJustification: primary?.justification,
      secondHookJustification: secondary?.justification,
      hookLabel: primary?.label,
      secondHookLabel: secondary?.label,
      physicsSpec: result?.physics_spec || null,
      scene_manifest: result?.scene_manifest || result?.sceneManifest || null,
    };

    setSongDna(nextSongDna);

    const builtManifest = buildManifestFromDna(nextSongDna as Record<string, unknown>);
    if (builtManifest) {
      setSceneManifest(safeManifest(builtManifest).manifest);
    } else if (nextSongDna.scene_manifest) {
      setSceneManifest(safeManifest(nextSongDna.scene_manifest).manifest);
    }

    setFitProgress(60);
    setFitStageLabel("Creating cinematic direction…");
    setPipelineStages(prev => ({ ...prev, songDna: "done", cinematic: "running" }));

    // 4. cinematic-direction (runs after DNA since we need the result first)
    let resolvedCinematic: any = null;
    try {
      const lyricsForDirection = freshLines
        .filter((l: any) => l.tag !== "adlib")
        .map((l: any) => ({ text: l.text, start: l.start, end: l.end }));

      const { data: dirResult } = await supabase.functions.invoke("cinematic-direction", {
        body: {
          title: lyricData.title,
          artist: lyricData.artist,
          lines: lyricsForDirection,
          beatGrid: beatGrid ? { bpm: beatGrid.bpm } : undefined,
          lyricId: savedId || undefined,
        },
      });

      if (dirResult?.cinematicDirection) {
        resolvedCinematic = dirResult.cinematicDirection;
        setCinematicDirection(resolvedCinematic);
      }
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
    } catch (e) {
      console.warn("[Pipeline] cinematic direction failed:", e);
      setPipelineStages(prev => ({ ...prev, cinematic: "done" }));
    }

    setFitProgress(90);
    setFitStageLabel("Final transcript sync…");
    setPipelineStages(prev => ({ ...prev, cinematic: "done", transcript: "running" }));

    // 5. Persist songDna + cinematicDirection to saved_lyrics
    if (savedId) {
      try {
        await supabase
          .from("saved_lyrics")
          .update({ song_dna: { ...nextSongDna, cinematicDirection: resolvedCinematic } as any, updated_at: new Date().toISOString() })
          .eq("id", savedId);
      } catch (e) {
        console.warn("[Pipeline] Failed to persist song_dna:", e);
      }
    }

    setPipelineStages(prev => ({ ...prev, transcript: "done" }));

    setFitProgress(100);
    setFitReadiness("ready");
    setFitStageLabel("Ready");
    toast.success("Your Fit is ready! 🎬", { description: "Switch to the Fit tab to explore your song's DNA." });
  }, [lyricData, audioFile, lines, savedId, hasRealAudio, beatGrid]);

  // Auto-trigger pipeline when lyrics are first transcribed
  const prevLinesLen = useRef(0);
  useEffect(() => {
    if (lines.length > 0 && prevLinesLen.current === 0 && !pipelineRanOnce.current && audioFile && lyricData) {
      runPipeline();
    }
    prevLinesLen.current = lines.length;
  }, [lines, audioFile, lyricData, runPipeline]);

  const fitLocked = fitReadiness !== "ready";
  const fitDisabled = !lines || lines.length === 0;

  return (
    <div className="flex flex-col flex-1">
      {lyricData && (
        <LyricFitToggle
          view={activeTab}
          onViewChange={setActiveTab}
          fitDisabled={fitDisabled || fitLocked}
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
            setFitReadiness("not_started");
            pipelineRanOnce.current = false;
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
          onRetry={() => runPipeline(true)}
        />
      ) : null}
    </div>
  );
}
