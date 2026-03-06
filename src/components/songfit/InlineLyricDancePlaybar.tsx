/**
 * InlineLyricDancePlaybar — Now-playing chip + React button + progress bar
 * for the embedded InlineLyricDance player. Mirrors the ShareableLyricDance
 * bottom bar but in compact inline form.
 */

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLyricSections } from "@/hooks/useLyricSections";
import { ReactionPanel, type CanonicalAudioSection } from "@/components/lyric/ReactionPanel";
import type { LyricDancePlayer, LyricDanceData } from "@/engine/LyricDancePlayer";


const EMOJI_SYMBOLS: Record<string, string> = {
  fire: '🔥', dead: '💀', mind_blown: '🤯',
  emotional: '😭', respect: '🙏', accurate: '🎯',
};

function getTopEmojiForLine(
  reactionData: Record<string, { line: Record<number, number>; total: number }>,
  lineIndex: number
): string | null {
  let topKey: string | null = null;
  let topCount = 0;
  for (const [key, data] of Object.entries(reactionData)) {
    const count = data.line[lineIndex] ?? 0;
    if (count > topCount) { topCount = count; topKey = key; }
  }
  return topKey ? (EMOJI_SYMBOLS[topKey] ?? null) : null;
}

interface Props {
  player: LyricDancePlayer | null;
  playerReady: boolean;
  data: LyricDanceData | null;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange: (updater: (prev: Record<string, { line: Record<number, number>; total: number }>) => Record<string, { line: Record<number, number>; total: number }>) => void;
}

export const InlineLyricDancePlaybar = forwardRef<HTMLDivElement, Props>(function InlineLyricDancePlaybar(
  { player, playerReady, data, reactionData, onReactionDataChange }: Props,
  _ref,
) {
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [reactionPanelOpen, setReactionPanelOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [engagementMode, setEngagementMode] = useState<'spectator' | 'freezing' | 'engaged'>('spectator');
  const [frozenLineIndex, setFrozenLineIndex] = useState<number | null>(null);

  const currentTimeRef = useRef(0);
  const lastProgressRef = useRef(0);
  const engagementModeRef = useRef<'spectator' | 'freezing' | 'engaged'>('spectator');
  const freezeAtSecRef = useRef<number | null>(null);

  const durationSec = useMemo(() => {
    const lines = data?.lyrics ?? [];
    if (!lines.length) return 0;
    return (lines[lines.length - 1] as any).end ?? 0;
  }, [data?.lyrics]);

  const lyricSections = useLyricSections(
    data?.words ?? null,
    data?.beat_grid ?? null,
    data?.cinematic_direction ?? null,
    durationSec,
  );

  const audioSections = useMemo<CanonicalAudioSection[]>(() => {
    const sections = data?.cinematic_direction?.sections;
    const lines = data?.lyrics ?? [];
    const fallbackDurationSec = lines.length ? ((lines[lines.length - 1] as any).end ?? 0) : 0;
    const duration = Math.max(durationSec || fallbackDurationSec, 0);

    if (!Array.isArray(sections) || !sections.length || duration <= 0) return [];

    return sections
      .map((section: any, index: number): CanonicalAudioSection | null => {
        const startRatio = Number(section?.startRatio);
        const endRatio = Number(section?.endRatio);
        if (!Number.isFinite(startRatio) || !Number.isFinite(endRatio)) return null;
        const startSec = Math.max(0, startRatio * duration);
        const endSec = Math.max(startSec, endRatio * duration);
        if (endSec <= startSec) return null;
        return {
          sectionIndex: Number.isFinite(Number(section?.sectionIndex)) ? Number(section.sectionIndex) : index,
          startSec,
          endSec,
          role: typeof section?.mood === "string" ? section.mood : null,
        };
      })
      .filter((section): section is CanonicalAudioSection => section != null);
  }, [data?.cinematic_direction?.sections, data?.lyrics, durationSec]);

  const activeLine = useMemo(() => {
    if (!lyricSections.isReady) return null;
    const line = lyricSections.allLines.find(
      l => currentTimeSec >= l.startSec && currentTimeSec < l.endSec + 0.1,
    ) ?? null;
    if (!line) return null;
    const section = lyricSections.sections.find(
      s => s.lines.some(sl => sl.lineIndex === line.lineIndex),
    ) ?? null;
    return { text: line.text, lineIndex: line.lineIndex, sectionLabel: section?.label ?? null };
  }, [lyricSections, currentTimeSec]);

  useEffect(() => {
    engagementModeRef.current = engagementMode;
  }, [engagementMode]);

  // Time tracking + engagement freeze handling
  useEffect(() => {
    if (!player || !playerReady) return;
    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      const t = audio.currentTime;

      if (engagementModeRef.current === 'freezing') {
        const freezeAt = freezeAtSecRef.current ?? t;
        if (t >= freezeAt) {
          const clamped = Math.min(t, freezeAt);
          currentTimeRef.current = clamped;
          setCurrentTimeSec(clamped);
          audio.pause();
          setEngagementMode('engaged');
          freezeAtSecRef.current = null;
          return;
        }
      }

      if (Math.abs(t - currentTimeRef.current) > 0.05) {
        currentTimeRef.current = t;
        setCurrentTimeSec(t);
      }

      const lines = data?.lyrics ?? [];
      if (lines.length) {
        const songStart = Math.max(0, (lines[0] as any).start - 0.5);
        const songEnd = (lines[lines.length - 1] as any).end + 1;
        const dur = songEnd - songStart;
        const p = dur > 0 ? Math.max(0, Math.min(1, (t - songStart) / dur)) : 0;
        if (Math.abs(p - lastProgressRef.current) > 0.005) {
          lastProgressRef.current = p;
          setProgress(p);
        }
      }

      if (engagementModeRef.current === 'engaged') {
        rafId = 0;
        return;
      }

      if (!audio.paused && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(rafId); rafId = 0; };
    if (!audio.paused) onPlay();

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [player, playerReady, data?.lyrics]);

  useEffect(() => {
    if (!reactionPanelOpen && engagementMode !== 'spectator') {
      setEngagementMode('spectator');
      setFrozenLineIndex(null);
      freezeAtSecRef.current = null;
    }
  }, [reactionPanelOpen, engagementMode]);

  const handleEngagementStart = (targetLineIndex?: number) => {
    if (!player || !playerReady) return;

    if (engagementModeRef.current === 'engaged') {
      if (targetLineIndex != null) setFrozenLineIndex(targetLineIndex);
      return;
    }

    if (targetLineIndex != null) {
      setFrozenLineIndex(targetLineIndex);
    } else {
      const liveLine = lyricSections.allLines.find(
        (line) => player.audio.currentTime >= line.startSec && player.audio.currentTime < line.endSec + 0.1,
      );
      if (liveLine) setFrozenLineIndex(liveLine.lineIndex);
    }

    const currentLine = lyricSections.allLines.find(
      (line) => player.audio.currentTime >= line.startSec && player.audio.currentTime < line.endSec + 0.1,
    );
    freezeAtSecRef.current = currentLine?.endSec ?? player.audio.currentTime;
    setEngagementMode('freezing');
  };

  const handlePanelClose = () => {
    setReactionPanelOpen(false);
    freezeAtSecRef.current = null;
    setEngagementMode('spectator');
    setFrozenLineIndex(null);

    if (!player || player.audio.ended) return;

    try {
      // Resume both audio AND visual render loop via player.play()
      player.play();
    } catch (err) {
      console.warn('InlineLyricDance audio play error:', err);
    }
  };

  const palette = useMemo(
    () => Array.isArray(data?.palette) ? data!.palette as string[] : [],
    [data?.palette],
  );

  const isReady = playerReady && !!data;

  return (
    <div style={{ minHeight: 44 }}>
      {isReady ? (
        <>
          {/* Progress bar */}
          <div className="w-full h-1 cursor-pointer group relative" style={{ background: "rgba(255,255,255,0.05)" }}
            onClick={(e) => {
              if (!player || !data) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const lines = data.lyrics;
              const songStart = lines.length > 0 ? Math.max(0, (lines[0] as any).start - 0.5) : 0;
              const songEnd = lines.length > 0 ? (lines[lines.length - 1] as any).end + 1 : 0;
              player.seek(songStart + ratio * (songEnd - songStart));
            }}
          >
            <div className="absolute left-0 top-0 h-full transition-none"
              style={{ width: `${progress * 100}%`, background: palette[1] ?? "#a855f7", opacity: 0.6 }} />
          </div>

          {/* Now-playing row */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={(e) => e.stopPropagation()}>
            <button
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.07] text-left overflow-hidden min-w-0 group hover:border-white/15 transition-all"
              style={{ background: "rgba(255,255,255,0.02)" }}
              onClick={() => setReactionPanelOpen(true)}
            >
              {activeLine ? (
                <>
                  {(() => {
                    const topEmoji = getTopEmojiForLine(reactionData, activeLine.lineIndex);
                    return topEmoji ? (
                      <span className="text-[11px] leading-none shrink-0 select-none">{topEmoji}</span>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                        style={{ background: palette[1] ?? "#ffffff", opacity: 0.6 }} />
                    );
                  })()}
                  <span className="text-[10px] font-mono text-white/45 truncate group-hover:text-white/65 transition-colors">
                    {activeLine.text}
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-mono text-white/20 truncate">
                  {lyricSections.isReady ? "listening..." : "..."}
                </span>
              )}
            </button>

            <button
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-white/10 text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.04] transition-all shrink-0"
              onClick={() => setReactionPanelOpen(true)}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider">React</span>
              <span className="text-[9px] opacity-60">↑</span>
            </button>
          </div>

          <ReactionPanel
            displayMode="embedded"
            isOpen={reactionPanelOpen}
            onClose={handlePanelClose}
            danceId={data.id}
            activeLine={activeLine}
            allLines={lyricSections.allLines}
            audioSections={audioSections}
            currentTimeSec={currentTimeSec}
            palette={palette}
            onSeekTo={(sec) => player?.seek(sec)}
            player={player}
            durationSec={durationSec}
            reactionData={reactionData}
            onReactionDataChange={onReactionDataChange}
            onReactionFired={(emoji) => player?.fireComment(emoji)}
            engagementMode={engagementMode}
            frozenLineIndex={frozenLineIndex}
            onEngagementStart={handleEngagementStart}
            onResetEngagement={() => {
              setEngagementMode('spectator');
              setFrozenLineIndex(null);
              freezeAtSecRef.current = null;
            }}
          />
        </>
      ) : (
        <div style={{ height: 44, background: "rgba(0,0,0,0.85)" }} />
      )}
    </div>
  );
});
