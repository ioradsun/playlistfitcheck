import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';
import type { LyricSection, LyricSectionLine } from '@/hooks/useLyricSections';
import type { LyricDancePlayer } from '@/engine/LyricDancePlayer';

interface ReactionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  danceId: string;
  activeLine: { text: string; lineIndex: number; sectionLabel: string | null } | null;
  allLines: LyricSectionLine[];
  sections: LyricSection[];
  currentTimeSec: number;
  palette: string[];
  onSeekTo: (sec: number) => void;
  player: LyricDancePlayer | null;
  durationSec: number;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  onReactionDataChange: (data: Record<string, { line: Record<number, number>; total: number }> | ((prev: Record<string, { line: Record<number, number>; total: number }>) => Record<string, { line: Record<number, number>; total: number }>)) => void;
  onReactionFired: (emoji: string) => void;
}

const EMOJIS = [
  { key: 'fire', symbol: '🔥', label: 'fire' },
  { key: 'dead', symbol: '💀', label: 'dead' },
  { key: 'mind_blown', symbol: '🤯', label: 'blown' },
  { key: 'emotional', symbol: '😭', label: 'felt' },
  { key: 'respect', symbol: '🙏', label: 'respect' },
  { key: 'accurate', symbol: '🎯', label: 'accurate' },
] as const;

type EmojiKey = typeof EMOJIS[number]['key'];

function ReactionPanel({ isOpen, onClose, danceId, activeLine, allLines, sections, currentTimeSec, palette, onSeekTo, player, durationSec, onReactionFired, reactionData, onReactionDataChange }: ReactionPanelProps) {
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<any[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [repeatTimeSec, setRepeatTimeSec] = useState(0);
  const [loopingLineIndex, setLoopingLineIndex] = useState<number | null>(null);
  const [expandedLineIndex, setExpandedLineIndex] = useState<number | null>(null);
  const repeatRafRef = useRef<number>(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHasSubmitted(false);
      setTextInput('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!danceId) return;
    supabase
      .from('lyric_dance_comments' as any)
      .select('id, text, line_index, submitted_at, is_pinned')
      .eq('dance_id', danceId)
      .order('is_pinned', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setComments((data ?? []) as any[]));
  }, [danceId, isOpen]);

  useEffect(() => {
    if (!repeatMode || !player) return;

    const audio = player.audio;
    let rafId = 0;

    const tick = () => {
      setRepeatTimeSec(audio.currentTime);
      if (!audio.paused) {
        rafId = requestAnimationFrame(tick);
        repeatRafRef.current = rafId;
      }
    };

    const onPlay = () => {
      rafId = requestAnimationFrame(tick);
      repeatRafRef.current = rafId;
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      repeatRafRef.current = 0;
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    if (!audio.paused) onPlay();

    return () => {
      cancelAnimationFrame(rafId);
      repeatRafRef.current = 0;
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [repeatMode, player]);

  useEffect(() => {
    if (!isOpen && repeatMode) {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      player?.pause();
      setRepeatMode(false);
      setLoopingLineIndex(null);
      setRepeatTimeSec(0);
      setExpandedLineIndex(null);
    }
  }, [isOpen, repeatMode, player]);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      cancelAnimationFrame(repeatRafRef.current);
    };
  }, []);

  const hotLines = useMemo(() => {
    const perLine: Record<number, { total: number; emojis: Record<string, number> }> = {};
    Object.entries(reactionData).forEach(([emoji, v]) => {
      Object.entries(v.line).forEach(([idx, count]) => {
        const n = Number(idx);
        if (!perLine[n]) perLine[n] = { total: 0, emojis: {} };
        perLine[n].total += count;
        perLine[n].emojis[emoji] = (perLine[n].emojis[emoji] ?? 0) + count;
      });
    });
    return Object.entries(perLine)
      .map(([lineIndex, info]) => {
        const line = allLines.find(l => l.lineIndex === Number(lineIndex));
        const topEmoji = Object.entries(info.emojis).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'fire';
        return { lineIndex: Number(lineIndex), text: line?.text ?? '...', total: info.total, topEmoji };
      })
      .sort((a, b) => b.total - a.total);
  }, [reactionData, allLines]);

  const repeatActiveLine = useMemo(() => {
    if (!repeatMode) return null;
    return allLines.find(
      l => repeatTimeSec >= l.startSec && repeatTimeSec < l.endSec + 0.1,
    ) ?? null;
  }, [repeatMode, repeatTimeSec, allLines]);

  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repeatMode || !activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [repeatActiveLine?.lineIndex, repeatMode]);

  const handleStartRepeat = () => {
    if (!player || durationSec <= 0) return;
    setRepeatMode(true);
    setLoopingLineIndex(null);
    setExpandedLineIndex(null);
    player.seek(0);
    player.play();
  };

  const handleLineTap = (line: LyricSectionLine) => {
    if (repeatMode) {
      setLoopingLineIndex(null);
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
      player?.seek(line.startSec);
      player?.play();
      if (!player) onSeekTo(line.startSec);
    } else {
      setExpandedLineIndex(prev => prev === line.lineIndex ? null : line.lineIndex);
    }
  };

  const handleReplay = (line: LyricSectionLine, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!player) return;

    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);

    const lineDuration = line.endSec - line.startSec;
    const playDuration = Math.max(lineDuration + 0.3, 2.5) * 1000;

    if (repeatMode) {
      setLoopingLineIndex(line.lineIndex);
      player.seek(line.startSec);
      player.play();

      const loop = () => {
        player.seek(line.startSec);
        player.play();
        loopTimeoutRef.current = setTimeout(loop, playDuration);
      };
      loopTimeoutRef.current = setTimeout(loop, playDuration);
    } else {
      setLoopingLineIndex(line.lineIndex);
      player.seek(line.startSec);
      player.play();
      loopTimeoutRef.current = setTimeout(() => {
        player.pause();
        setLoopingLineIndex(null);
      }, playDuration);
    }
  };

  const handleReact = async (emoji: EmojiKey, lineIndex?: number) => {
    if (!danceId) return;
    const sessionId = getSessionId();
    const targetLineIndex = lineIndex ?? activeLine?.lineIndex ?? null;
    const reactionKey = `${emoji}-${targetLineIndex ?? 'song'}`;
    if (sessionReacted.has(reactionKey)) return;

    if (repeatMode && player && !player.audio.paused) {
      player.pause();
    }

    setSessionReacted(prev => new Set([...prev, reactionKey]));
    onReactionFired(emoji);

    await supabase.from('lyric_dance_reactions' as any).insert({
      dance_id: danceId,
      line_index: targetLineIndex,
      section_index: null,
      emoji,
      session_id: sessionId,
    });

    onReactionDataChange(prev => {
      const updated = { ...prev };
      if (!updated[emoji]) updated[emoji] = { line: {}, total: 0 };
      updated[emoji].total++;
      if (targetLineIndex != null) {
        updated[emoji].line[targetLineIndex] =
          (updated[emoji].line[targetLineIndex] ?? 0) + 1;
      }
      return updated;
    });
  };

  const handleStopRepeat = () => {
    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    player?.pause();
    setRepeatMode(false);
    setLoopingLineIndex(null);
    setRepeatTimeSec(0);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || !danceId || hasSubmitted) return;
    const text = textInput.trim().slice(0, 200);
    const sessionId = getSessionId();
    const { data: inserted, error } = await supabase
      .from('lyric_dance_comments' as any)
      .insert({
        dance_id: danceId,
        text,
        session_id: sessionId,
        line_index: activeLine?.lineIndex ?? null,
      })
      .select('id, text, line_index, submitted_at, is_pinned')
      .single();
    if (error) {
      console.error('Comment insert failed:', error);
      return;
    }
    if (inserted) {
      setComments(prev => [inserted, ...prev]);
      setHasSubmitted(true);
      setTextInput('');
      onReactionFired('fire');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="fixed left-0 right-0 bottom-[48px] z-40 max-h-[72vh] overflow-y-auto"
          style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05] sticky top-0 z-10" style={{ background: '#0d0d0d' }}>
            <div className="flex items-center gap-3">
              {repeatMode ? (
                <button
                  onClick={handleStopRepeat}
                  className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400/70 animate-pulse" />
                  LIVE · tap to stop
                </button>
              ) : (
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30">
                  {activeLine?.sectionLabel ?? 'full lyrics'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!repeatMode && (
                <button
                  onClick={handleStartRepeat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.04] transition-all"
                >
                  <span>↺</span>
                  <span>Repeat</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-white/25 hover:text-white/60 transition-colors ml-1"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
                </svg>
              </button>
            </div>
          </div>

          {!repeatMode && hotLines.length > 0 && (
            <div className="px-5 py-3 border-b border-white/[0.04] flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {hotLines.slice(0, 4).map(hl => {
                const emojiMap: Record<string, string> = { fire:'🔥', dead:'💀', mind_blown:'🤯', emotional:'😭', respect:'🙏', accurate:'🎯' };
                return (
                  <button
                    key={hl.lineIndex}
                    onClick={() => {
                      const line = allLines.find(l => l.lineIndex === hl.lineIndex);
                      if (line) handleReplay(line, { stopPropagation: () => {} } as any);
                    }}
                    className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full border border-white/[0.07] hover:border-white/15 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <span className="text-sm leading-none">{emojiMap[hl.topEmoji] ?? '🔥'}</span>
                    <span className="text-[10px] font-mono text-white/40 max-w-[100px] truncate">{hl.text}</span>
                    <span className="text-[9px] font-mono text-white/25">×{hl.total}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-0 py-2 overflow-y-auto" style={{ maxHeight: 'calc(72vh - 160px)' }}>
            {sections.map((section, si) => (
              <div key={section.sectionIndex} className={si === 0 ? 'mb-1' : 'mt-4 mb-1'}>
                <div className="flex items-center gap-2 px-5 mb-2">
                  <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-white/20">
                    {section.label}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>

                {section.lines.map((line) => {
                  const isRepeatActive = repeatMode && repeatActiveLine?.lineIndex === line.lineIndex;
                  const isLooping = loopingLineIndex === line.lineIndex;
                  const isExpanded = expandedLineIndex === line.lineIndex;
                  const lineReactionTotal = Object.values(reactionData).reduce(
                    (sum, e) => sum + (e.line[line.lineIndex] ?? 0), 0,
                  );
                  const topEmojiForLine = (() => {
                    const emojiMap: Record<string, string> = { fire:'🔥', dead:'💀', mind_blown:'🤯', emotional:'😭', respect:'🙏', accurate:'🎯' };
                    const top = Object.entries(reactionData)
                      .sort((a, b) => (b[1].line[line.lineIndex] ?? 0) - (a[1].line[line.lineIndex] ?? 0))[0];
                    return top && (top[1].line[line.lineIndex] ?? 0) > 0
                      ? emojiMap[top[0]] : null;
                  })();

                  return (
                    <div
                      key={line.lineIndex}
                      ref={isRepeatActive ? activeLineRef : undefined}
                    >
                      <div
                        onClick={() => handleLineTap(line)}
                        className="flex items-center gap-2 px-5 py-2 cursor-pointer transition-colors"
                        style={{
                          background: isRepeatActive
                            ? 'rgba(255,255,255,0.04)'
                            : isExpanded
                            ? 'rgba(255,255,255,0.025)'
                            : 'transparent',
                          borderLeft: isRepeatActive
                            ? `2px solid ${palette[1] ?? '#ffffff'}`
                            : isLooping
                            ? `2px solid ${palette[0] ?? '#ffffff'}88`
                            : '2px solid transparent',
                        }}
                      >
                        <span
                          className="flex-1 text-[13px] font-light leading-relaxed transition-all duration-150"
                          style={{
                            color: isRepeatActive
                              ? 'rgba(255,255,255,0.92)'
                              : isLooping
                              ? 'rgba(255,255,255,0.75)'
                              : isExpanded
                              ? 'rgba(255,255,255,0.70)'
                              : 'rgba(255,255,255,0.40)',
                          }}
                        >
                          {line.text}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {lineReactionTotal > 0 && !isExpanded && (
                            <span className="text-[10px] font-mono text-white/25 flex items-center gap-1">
                              {topEmojiForLine}
                              <span>{lineReactionTotal}</span>
                            </span>
                          )}

                          <button
                            onClick={(e) => handleReplay(line, e)}
                            className={`text-[11px] transition-colors px-1 ${
                              isLooping
                                ? 'text-white/70'
                                : 'text-white/20 hover:text-white/55'
                            }`}
                            title="Replay this line"
                          >
                            {isLooping ? '⏸' : '↺'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && !repeatMode && (
                        <div
                          className="flex items-center justify-between px-5 py-3 border-t border-b border-white/[0.04]"
                          style={{ background: 'rgba(255,255,255,0.02)' }}
                        >
                          {EMOJIS.map(({ key, symbol }) => {
                            const count = reactionData[key]?.line[line.lineIndex] ?? 0;
                            const reacted = sessionReacted.has(`${key}-${line.lineIndex}`);
                            return (
                              <button
                                key={key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReact(key as EmojiKey, line.lineIndex);
                                }}
                                className={`flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all ${
                                  reacted ? 'scale-110' : 'active:scale-95'
                                }`}
                                style={{ minWidth: 40 }}
                              >
                                <span className="text-lg leading-none">{symbol}</span>
                                <span
                                  className="text-[9px] font-mono"
                                  style={{ color: reacted ? (palette[1] ?? '#ffffff') : 'rgba(255,255,255,0.25)', opacity: reacted ? 1 : 0.7 }}
                                >
                                  {count > 0 ? count : '·'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {isRepeatActive && repeatMode && (
                        <div
                          className="flex items-center justify-between px-5 py-3"
                          style={{ background: 'rgba(255,255,255,0.025)' }}
                        >
                          {EMOJIS.map(({ key, symbol }) => {
                            const count = reactionData[key]?.line[line.lineIndex] ?? 0;
                            const reacted = sessionReacted.has(`${key}-${line.lineIndex}`);
                            return (
                              <button
                                key={key}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReact(key as EmojiKey, line.lineIndex);
                                }}
                                className={`flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all ${
                                  reacted ? 'scale-110' : 'active:scale-95'
                                }`}
                                style={{ minWidth: 40 }}
                              >
                                <span className="text-lg leading-none">{symbol}</span>
                                <span
                                  className="text-[9px] font-mono"
                                  style={{ color: reacted ? (palette[1] ?? '#ffffff') : 'rgba(255,255,255,0.25)' }}
                                >
                                  {count > 0 ? count : '·'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-white/[0.05] sticky bottom-0" style={{ background: '#0d0d0d' }}>
            {!hasSubmitted ? (
              <div className="relative">
                <input
                  type="text"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleTextSubmit();
                    if (e.key === 'Escape') onClose();
                  }}
                  placeholder="drop your take..."
                  maxLength={200}
                  className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/15 pointer-events-none">
                  ↵
                </span>
              </div>
            ) : (
              <p className="text-[11px] font-mono text-white/30 text-center py-1">FMLY Notified</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { ReactionPanel };
export default ReactionPanel;
