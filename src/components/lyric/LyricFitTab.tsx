/* cache-bust: 2026-03-06-V2 */

import * as React from "react";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import {
  useLyricPipeline,
  type GenerationStatus,
} from "@/hooks/useLyricPipeline";
import type { LyricFitView } from "./LyricFitToggle";
import { LyricFitToggle } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";

export type { GenerationStatus };
export type FilmMode = "song" | "beat";

interface Props {
  initialLyric?: any;
  onProjectSaved?: () => void;
  onNewProject?: () => void;
  onHeaderProject?: HeaderProjectSetter;
  onSavedId?: (id: string) => void;
  onUploadStarted?: (payload: {
    file: File;
    projectId: string | null;
    title: string;
  }) => void;
  claimMeta?: {
    artistSlug: string;
    songSlug: string;
    artistName: string;
    songName: string;
    albumArtUrl: string | null;
    ghostProfileId: string;
    spotifyTrackId: string;
  } | null;
  autoSubmitFile?: File | null;
  onClaimPublished?: (danceUrl: string) => void;
}

export function LyricFitTab({
  initialLyric,
  onProjectSaved,
  onNewProject,
  onHeaderProject,
  onSavedId,
  onUploadStarted: onUploadStartedProp,
  claimMeta,
  autoSubmitFile = null,
  onClaimPublished,
}: Props) {
  const { user } = useAuth();
  const siteCopy = useSiteCopy();

  const [activeTab, setActiveTab] = React.useState<LyricFitView>("lyrics");
  const [sceneDescription, setSceneDescription] = React.useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [filmMode, setFilmMode] = React.useState<FilmMode>(() => {
    if (searchParams.get("mode") === "beat") return "beat";
    if (initialLyric) {
      const cd = initialLyric.cinematic_direction
        ?? initialLyric.render_data?.cinematicDirection
        ?? initialLyric.render_data?.cinematic_direction;
      if (cd?._instrumental === true) return "beat";
      if (
        initialLyric.beat_grid &&
        Array.isArray(initialLyric.lines) &&
        initialLyric.lines.length === 0
      ) {
        return "beat";
      }
    }
    return "song";
  });

  const p = useLyricPipeline({
    initialLyric,
    user,
    siteCopy,
    sceneDescription,
    onProjectSaved,
    onNewProject,
    onSavedId,
    claimMeta: claimMeta ?? null,
    onClaimPublished,
    filmMode,
  });

  const fitReady = p.isComplete;

  const handleFilmModeChange = React.useCallback((m: FilmMode) => {
    setFilmMode(m);
    setSearchParams(m === "beat" ? { mode: "beat" } : {}, { replace: true });
    if (!p.audioFile) {
      p.resetProject();
    }
  }, [setSearchParams, p.audioFile, p.resetProject]);

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if ((nextView === "fit" || nextView === "data") && !fitReady) return;
    if (nextView === "data" && !p.savedId) return;
    setActiveTab(nextView);
  }, [fitReady, p.savedId]);

  const handleBackToLyrics = useCallback(
    () => handleViewChange("lyrics"),
    [handleViewChange],
  );

  useEffect(() => {
    if (!claimMeta) return;
    if (p.lyricData && (p.audioFile || p.savedId) && activeTab === "lyrics" && p.isComplete) {
      setActiveTab("fit");
    }
  }, [claimMeta, p.lyricData, p.audioFile, p.savedId, activeTab, p.isComplete]);

  useEffect(() => {
    if (filmMode !== "beat") return;
    if (activeTab !== "lyrics") return;
    if (p.audioFile || p.savedId || p.cinematicDirection) {
      setActiveTab("fit");
    }
  }, [filmMode, activeTab, p.audioFile, p.savedId, p.cinematicDirection]);

  const sceneInputNode = !p.lyricData ? (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type="text"
          value={sceneDescription}
          onChange={(e) => setSceneDescription(e.target.value)}
          placeholder={filmMode === "beat"
            ? "What energy does this beat carry? Dark and heavy. Euphoric. 3am in the studio."
            : "Where does this song live? Late night drive. Club at 1am. Crying in the shower."}
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-foreground text-sm placeholder:text-muted-foreground/50 placeholder:italic focus:outline-none focus:ring-1 focus:ring-primary/50"
          maxLength={200}
          aria-label="Scene description"
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col flex-1">
      {p.lyricData && (
        <LyricFitToggle
          filmMode={filmMode}
          view={activeTab}
          onViewChange={handleViewChange}
          fitDisabled={p.fitDisabled}
          fitReady={fitReady}
          isRunning={
            p.generationStatus.beatGrid === "running" ||
            p.generationStatus.cinematicDirection === "running" ||
            p.generationStatus.sectionImages === "running"
          }
          isError={Object.values(p.generationStatus).includes("error")}
          hasData={!!p.savedId}
        />
      )}

      <div
        style={{
          display: activeTab === "lyrics" ? "flex" : "none",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <LyricsTab
          lyricData={p.lyricData}
          setLyricData={p.setLyricData}
          audioFile={p.audioFile}
          setAudioFile={p.setAudioFile}
          hasRealAudio={p.hasRealAudio}
          setHasRealAudio={p.setHasRealAudio}
          savedId={p.savedId}
          setSavedId={p.setSavedId}
          setLines={p.setLines}
          words={p.words}
          waveformData={p.waveformData}
          fmlyLines={p.fmlyLines}
          setFmlyLines={p.setFmlyLines}
          versionMeta={p.versionMeta}
          setVersionMeta={p.setVersionMeta}
          beatGrid={p.beatGrid}
          setWords={p.setWords}
          onProjectSaved={onProjectSaved}
          onNewProject={p.resetProject}
          onHeaderProject={activeTab === "lyrics" ? onHeaderProject : undefined}
          onSavedId={onSavedId}
          sceneInput={sceneInputNode}
          onAudioSubmitted={p.handleAudioSubmitted}
          onUploadStarted={(payload) => {
            if (filmMode !== "beat") {
              setActiveTab("lyrics");
            }
            p.setPipelineStages((prev) => ({
              ...prev,
              transcript: filmMode === "beat" ? "done" : "running",
            }));
            onUploadStartedProp?.(payload);
          }}
          onTitleChange={p.handleTitleChange}
          spotifyTrackId={p.spotifyTrackId}
          setSpotifyTrackId={p.setSpotifyTrackId}
          autoSubmitFile={autoSubmitFile}
          filmMode={filmMode}
          onFilmModeChange={handleFilmModeChange}
        />
      </div>

      {p.lyricData && (p.audioFile || p.savedId) && (
        <div
          style={{
            display: activeTab === "fit" || activeTab === "data" ? "flex" : "none",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <FitTab
            pipeline={{
              retryImages: p.retryImages,
              setSectionImageUrls: p.setSectionImageUrls,
              setSectionImageProgress: p.setSectionImageProgress,
              setGenerationStatus: p.setGenerationStatus,
              spotifyTrackId: p.spotifyTrackId,
              setSpotifyTrackId: p.setSpotifyTrackId,
            }}
            lyricData={p.lyricData}
            audioFile={p.audioFile}
            hasRealAudio={p.hasRealAudio}
            savedId={p.savedId}
            renderData={p.renderData}
            beatGrid={p.beatGrid}
            cinematicDirection={p.cinematicDirection}
            generationStatus={p.generationStatus}
            words={p.words}
            initialLyric={initialLyric}
            onHeaderProject={activeTab === "fit" || activeTab === "data" ? onHeaderProject : undefined}
            onBack={handleBackToLyrics}
            
            parentWaveform={p.waveformData}
            sectionImageUrls={p.sectionImageUrls}
            sectionImageProgress={p.sectionImageProgress}
            sectionImageError={p.sectionImageError}
            onTitleChange={p.handleTitleChange}
            subView={activeTab === "data" ? "data" : "fit"}
            filmMode={filmMode}
          />
        </div>
      )}
    </div>
  );
}
