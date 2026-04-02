/* cache-bust: 2026-03-06-V2 */

import * as React from "react";
import { useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import {
  useLyricPipeline,
  type FitReadiness,
  type PipelineStages,
  type PipelineStageStatus,
  type GenerationStatus,
} from "@/hooks/useLyricPipeline";
import type { LyricFitView } from "./LyricFitToggle";
import { LyricFitToggle } from "./LyricFitToggle";
import { LyricsTab, type HeaderProjectSetter } from "./LyricsTab";
import { FitTab } from "./FitTab";

export type { FitReadiness, PipelineStages, PipelineStageStatus, GenerationStatus };

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
  });

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if (
      (nextView === "fit" || nextView === "data") &&
      !p.fitUnlocked &&
      p.fitReadiness !== "ready" &&
      p.fitReadiness !== "not_started"
    )
      return;
    setActiveTab(nextView);
  }, [p.fitReadiness, p.fitUnlocked]);

  const handleBackToLyrics = useCallback(
    () => handleViewChange("lyrics"),
    [handleViewChange],
  );

  useEffect(() => {
    if (!claimMeta) return;
    if (p.lyricData && p.audioFile && activeTab === "lyrics") {
      setActiveTab("fit");
    }
  }, [claimMeta, p.lyricData, p.audioFile, activeTab]);

  const sceneInputNode = !p.lyricData ? (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type="text"
          value={sceneDescription}
          onChange={(e) => setSceneDescription(e.target.value)}
          placeholder="Where are you when this song plays? ex: driving at night. on a rooftop. in a crowded club."
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
          view={activeTab}
          onViewChange={handleViewChange}
          fitDisabled={p.fitDisabled}
          fitUnlocked={p.fitUnlocked}
          fitReadiness={p.fitReadiness}
          fitProgress={p.fitProgress}
          fitStageLabel={p.fitStageLabel}
          pipelineStages={p.pipelineStages}
          hasData={!!p.pipelineDanceId}
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
            setActiveTab("lyrics");
            p.setPipelineStages((prev) => ({ ...prev, transcript: "running" }));
            onUploadStartedProp?.(payload);
          }}
          onTitleChange={p.handleTitleChange}
          autoSubmitFile={autoSubmitFile}
        />
      </div>

      {p.lyricData && p.audioFile && (
        <div
          style={{
            display: activeTab === "fit" || activeTab === "data" ? "flex" : "none",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          <FitTab
            pipeline={p.pipelineCompat}
            lyricData={p.lyricData}
            audioFile={p.audioFile}
            hasRealAudio={p.hasRealAudio}
            savedId={p.savedId}
            renderData={p.renderData}
            beatGrid={p.beatGrid}
            cinematicDirection={p.cinematicDirection}
            generationStatus={p.generationStatus}
            words={p.words}
            onHeaderProject={activeTab === "fit" || activeTab === "data" ? onHeaderProject : undefined}
            onBack={handleBackToLyrics}
            pipelineStages={p.pipelineStages}
            parentWaveform={p.waveformData}
            initialDanceId={p.pipelineDanceId}
            initialDanceUrl={p.pipelineDanceUrl}
            sectionImageUrls={p.sectionImageUrls}
            sectionImageProgress={p.sectionImageProgress}
            sectionImageError={p.sectionImageError}
            onTitleChange={p.handleTitleChange}
            subView={activeTab === "data" ? "data" : "fit"}
          />
        </div>
      )}
    </div>
  );
}
