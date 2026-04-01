import { useEffect, useState } from "react";
import type { CanonicalAudioSection } from "@/components/lyric/ReactionPanel";
import type { LyricSectionLine } from "@/hooks/useLyricSections";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";

interface LyricInteractionLayerProps {
  variant: "embedded" | "fullscreen" | "reels";
  danceId: string;
  currentMoment?: {
    index: number;
    total: number;
    label: string | null;
    text?: string;
    startSec?: number;
    endSec?: number;
  } | null;
  activeLine?: { text: string; lineIndex: number; sectionLabel: string | null } | null;
  allLines?: LyricSectionLine[];
  audioSections?: CanonicalAudioSection[];
  phrases?: any[] | null;
  words?: any[] | null;
  beatGrid?: any | null;
  currentTimeSec?: number;
  durationSec?: number;
  palette?: string[];
  accent?: string;
  reactionData?: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange?: (data: any) => void;
  empowermentPromise?: any | null;
  fmlyHookEnabled?: boolean;
  refreshKey?: number;
  isLive?: boolean;
  muted?: boolean;
  hasFired?: boolean;
  totalFireCount?: number;
  lastFiredAt?: string | null;
  songEnded?: boolean;
  player?: LyricDancePlayer | null;
  onFireTap?: () => void;
  onFireHoldStart?: () => void;
  onFireHoldEnd?: (holdMs: number) => void;
  onFireLine?: (lineIndex: number, holdMs: number) => void;
  onLineVisible?: (lineIndex: number) => void;
  onReactionFired?: (emoji: string) => void;
  onComment?: (text: string, momentIndex: number | null) => void;
  onPause?: () => void;
  onResume?: () => void;
  onSeekTo?: (sec: number) => void;
  externalPanelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  source?: "feed" | "shareable" | "embed";
}

export function LyricInteractionLayer({
  variant,
  danceId,
  currentMoment,
  activeLine = null,
  allLines = [],
  audioSections = [],
  phrases = null,
  words = null,
  beatGrid = null,
  currentTimeSec = 0,
  durationSec = 0,
  palette = ["#ffffff", "#ffffff", "#ffffff"],
  accent,
  reactionData = {},
  onReactionDataChange,
  empowermentPromise = null,
  fmlyHookEnabled,
  refreshKey = 0,
  isLive = false,
  muted = false,
  hasFired = false,
  totalFireCount = 0,
  lastFiredAt = null,
  songEnded = false,
  player = null,
  onFireTap,
  onFireHoldStart,
  onFireHoldEnd,
  onFireLine,
  onLineVisible,
  onReactionFired,
  onComment,
  onPause,
  onResume,
  onSeekTo,
  externalPanelOpen,
  onPanelOpenChange,
}: LyricInteractionLayerProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (externalPanelOpen !== undefined) setPanelOpen(externalPanelOpen);
  }, [externalPanelOpen]);

  const isFullscreen = variant === "fullscreen" || variant === "reels";
  const BAR_H = isFullscreen ? 68 : 48;

  const openPanel = () => {
    setPanelOpen(true);
    onPanelOpenChange?.(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    onPanelOpenChange?.(false);
  };

  return (
    <>
      {variant === "embedded" ? (
        <div style={{ flexShrink: 0 }}>
          <ReactionPanel
            displayMode="embedded"
            isOpen={panelOpen}
            onClose={closePanel}
            onCloseWithPosition={(timeSec) => {
              if (player && timeSec != null) player.seek(timeSec);
              onResume?.();
            }}
            bottomOffset={BAR_H}
            refreshKey={refreshKey}
            danceId={danceId}
            activeLine={muted ? null : activeLine}
            allLines={allLines}
            audioSections={audioSections as any}
            phrases={phrases as any}
            words={words as any}
            beatGrid={beatGrid as any}
            currentTimeSec={currentTimeSec}
            palette={palette}
            onSeekTo={(sec) => onSeekTo?.(sec)}
            player={player}
            durationSec={durationSec}
            reactionData={reactionData}
            onReactionDataChange={(data) => onReactionDataChange?.(data)}
            onReactionFired={(emoji) => onReactionFired?.(emoji)}
            onPause={onPause}
            onResume={onResume}
            onFireLine={onFireLine}
            onLineVisible={onLineVisible}
            empowermentPromise={empowermentPromise}
            fmlyHookEnabled={fmlyHookEnabled}
          />
          <CardBottomBar
            variant="embedded"
            panelOpen={panelOpen}
            onOpenReactions={openPanel}
            onClose={closePanel}
            currentMoment={currentMoment}
            onFireTap={onFireTap}
            onFireHoldStart={onFireHoldStart}
            onFireHoldEnd={onFireHoldEnd}
            onComment={(text) => onComment?.(text, currentMoment?.index ?? null)}
            onPauseForInput={onPause}
            onResumeAfterInput={onResume}
            accent={accent}
            hasFired={hasFired}
            isLive={isLive}
            totalFireCount={totalFireCount}
            lastFiredAt={lastFiredAt}
            songEnded={songEnded}
          />
        </div>
      ) : variant === "reels" ? (
        <>
          <ReactionPanel
            displayMode="reels"
            isOpen={panelOpen}
            onClose={closePanel}
            onCloseWithPosition={(timeSec) => {
              if (player && timeSec != null) {
                player.seek(timeSec);
                player.setMuted(false);
                player.play();
              }
              onResume?.();
            }}
            refreshKey={refreshKey}
            danceId={danceId}
            activeLine={activeLine}
            allLines={allLines}
            audioSections={audioSections as any}
            phrases={phrases as any}
            words={words as any}
            beatGrid={beatGrid as any}
            currentTimeSec={currentTimeSec}
            palette={palette}
            onSeekTo={(sec) => onSeekTo?.(sec)}
            player={player}
            durationSec={durationSec}
            reactionData={reactionData}
            onReactionDataChange={(data) => onReactionDataChange?.(data)}
            onReactionFired={(emoji) => onReactionFired?.(emoji)}
            onPause={onPause}
            onResume={onResume}
            onFireLine={onFireLine}
            onLineVisible={onLineVisible}
            empowermentPromise={empowermentPromise}
            fmlyHookEnabled={fmlyHookEnabled}
            bottomOffset={BAR_H}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 80,
              background: "#0a0a0a",
            }}
          >
            <CardBottomBar
              variant="fullscreen"
              panelOpen={panelOpen}
              onOpenReactions={openPanel}
              onClose={closePanel}
              currentMoment={currentMoment}
              onFireTap={onFireTap}
              onFireHoldStart={onFireHoldStart}
              onFireHoldEnd={onFireHoldEnd}
              onComment={(text) => onComment?.(text, currentMoment?.index ?? null)}
              onPauseForInput={onPause}
              onResumeAfterInput={onResume}
              accent={accent}
              hasFired={hasFired}
              isLive={isLive}
              totalFireCount={totalFireCount}
              lastFiredAt={lastFiredAt}
              songEnded={songEnded}
            />
          </div>
        </>
      ) : (
        <>
          <ReactionPanel
            displayMode="fullscreen"
            isOpen={panelOpen}
            onClose={closePanel}
            onCloseWithPosition={(timeSec) => {
              if (player && timeSec != null) {
                player.seek(timeSec);
                player.setMuted(false);
                player.play();
              }
              onResume?.();
            }}
            refreshKey={refreshKey}
            danceId={danceId}
            activeLine={activeLine}
            allLines={allLines}
            audioSections={audioSections as any}
            phrases={phrases as any}
            words={words as any}
            beatGrid={beatGrid as any}
            currentTimeSec={currentTimeSec}
            palette={palette}
            onSeekTo={(sec) => onSeekTo?.(sec)}
            player={player}
            durationSec={durationSec}
            reactionData={reactionData}
            onReactionDataChange={(data) => onReactionDataChange?.(data)}
            onReactionFired={(emoji) => onReactionFired?.(emoji)}
            onPause={onPause}
            onResume={onResume}
            onFireLine={onFireLine}
            onLineVisible={onLineVisible}
            empowermentPromise={empowermentPromise}
            fmlyHookEnabled={fmlyHookEnabled}
            bottomOffset={BAR_H}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 80,
              background: "#0a0a0a",
            }}
          >
            <CardBottomBar
              variant="fullscreen"
              panelOpen={panelOpen}
              onOpenReactions={openPanel}
              onClose={closePanel}
              currentMoment={currentMoment}
              onFireTap={onFireTap}
              onFireHoldStart={onFireHoldStart}
              onFireHoldEnd={onFireHoldEnd}
              onComment={(text) => onComment?.(text, currentMoment?.index ?? null)}
              onPauseForInput={onPause}
              onResumeAfterInput={onResume}
              accent={accent}
              hasFired={hasFired}
              isLive={isLive}
              totalFireCount={totalFireCount}
              lastFiredAt={lastFiredAt}
              songEnded={songEnded}
            />
          </div>
        </>
      )}
    </>
  );
}
