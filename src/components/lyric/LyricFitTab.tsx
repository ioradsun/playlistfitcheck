/**
 * LyricFitTab — Thin parent container with two-tab architecture.
 * Holds all shared state. Renders LyricFitToggle + LyricsTab or FitTab.
 */

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sessionAudio } from "@/lib/sessionAudioCache";
import type { LyricData, LyricLine } from "./LyricDisplay";
import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { SongSignature } from "@/lib/songSignatureAnalyzer";
import type { SceneManifest as FullSceneManifest } from "@/engine/SceneManifest";
import { LyricFitToggle, type LyricFitView } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";
import type { ReactNode } from "react";

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

      // Restore saved beat grid
      const savedBg = (initialLyric as any).beat_grid;
      if (savedBg) setBeatGrid(savedBg as BeatGridData);

      // Restore saved song DNA
      const loadedSongDna = (initialLyric as any).song_dna ?? null;
      if (loadedSongDna) setSongDna(loadedSongDna);

      // Restore saved song signature
      const savedSignature = (initialLyric as any).song_signature;
      if (savedSignature) setSongSignature(savedSignature as SongSignature);

      setBgImageUrl((initialLyric as any).background_image_url ?? null);

      // Check session cache for real audio first
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

  const fitDisabled = !lines || lines.length === 0;

  return (
    <div className="flex flex-col flex-1">
      {/* Tab strip — only show when lyrics exist */}
      {lyricData && (
        <LyricFitToggle
          view={activeTab}
          onViewChange={setActiveTab}
          fitDisabled={fitDisabled}
        />
      )}

      {/* Tab content */}
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
          onProjectSaved={onProjectSaved}
          onNewProject={() => {
            // Reset all shared state
            setSongDna(null);
            setBeatGrid(null);
            setSongSignature(null);
            setCinematicDirection(null);
            setBgImageUrl(null);
            setSceneManifest(null);
            setLines([]);
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
        />
      ) : null}
    </div>
  );
}
