/* cache-bust: 2026-03-06-V2 */

import * as React from "react";
import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { invokeWithTimeout } from "@/lib/invokeWithTimeout";
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
import type { SceneContextResult } from "@/lib/sceneContexts";

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
  const siteCopy = useSiteCopy();

  const [activeTab, setActiveTab] = React.useState<LyricFitView>("lyrics");
  const [sceneDescription, setSceneDescription] = React.useState("");
  const [resolvedScene, setResolvedScene] = React.useState<SceneContextResult | null>(
    null,
  );
  const [resolvingScene, setResolvingScene] = React.useState(false);

  const p = useLyricPipeline({
    initialLyric,
    user,
    siteCopy,
    resolvedScene,
    onProjectSaved,
    onNewProject,
    onSavedId,
  });

  React.useEffect(() => {
    if (!sceneDescription.trim() || sceneDescription.trim().length < 10) return;
    const timer = setTimeout(async () => {
      setResolvingScene(true);
      try {
        const { data } = await invokeWithTimeout(
          "resolve-scene-context",
          { description: sceneDescription.trim() },
          15_000,
        );
        if (data && !data.error) setResolvedScene(data);
      } catch (e) {
        console.error("Scene resolve failed:", e);
      } finally {
        setResolvingScene(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [sceneDescription]);

  const handleViewChange = useCallback((nextView: LyricFitView) => {
    if (
      nextView === "fit" &&
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

  const sceneInputNode = !p.lyricData ? (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type="text"
          value={sceneDescription}
          onChange={(e) => {
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
          analysisModel={p.analysisModel}
          transcriptionModel={p.transcriptionModel}
          sceneInput={sceneInputNode}
          onAudioSubmitted={p.handleAudioSubmitted}
          onUploadStarted={(payload) => {
            setActiveTab("lyrics");
            p.setPipelineStages((prev) => ({ ...prev, transcript: "running" }));
            onUploadStartedProp?.(payload);
          }}
          onTitleChange={p.handleTitleChange}
        />
      </div>

      {p.lyricData && p.audioFile && (
        <div
          style={{
            display: activeTab === "fit" ? "flex" : "none",
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
            onHeaderProject={activeTab === "fit" ? onHeaderProject : undefined}
            onBack={handleBackToLyrics}
            pipelineStages={p.pipelineStages}
            parentWaveform={p.waveformData}
            initialDanceId={p.pipelineDanceId}
            initialDanceUrl={p.pipelineDanceUrl}
            sectionImageUrls={p.sectionImageUrls}
            sectionImageProgress={p.sectionImageProgress}
            sectionImageError={p.sectionImageError}
            onTitleChange={p.handleTitleChange}
          />
        </div>
      )}
    </div>
  );
}
