import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LyricSection, LyricSectionLine } from '@/hooks/useLyricSections';

interface HotSectionPillProps {
  sections: LyricSection[];
  currentTimeSec: number;
  reactionData: Record<string, { line: Record<number, number>; total: number }>;
  allLines: LyricSectionLine[];
  palette: string[];
  isVisible: boolean;
}

function HotSectionPill({ sections, currentTimeSec, reactionData, allLines, palette, isVisible }: HotSectionPillProps) {
  const hotPill = useMemo(() => {
    if (!isVisible) return null;
    const LOOKAHEAD_SEC = 8;
    const MIN_REACTIONS = 5;

    const sectionReactions = sections.map(section => {
      const total = section.lines.reduce((sum, line) => {
        const lineTotal = Object.values(reactionData).reduce((s, e) => s + (e.line[line.lineIndex] ?? 0), 0);
        return sum + lineTotal;
      }, 0);
      const emojiTotals = Object.entries(reactionData).map(([emoji, data]) => ({
        emoji,
        count: section.lines.reduce((s, l) => s + (data.line[l.lineIndex] ?? 0), 0),
      }));
      const topEmoji = emojiTotals.sort((a, b) => b.count - a.count)[0];
      return { section, total, topEmoji: topEmoji?.count > 0 ? topEmoji.emoji : null };
    });

    const upcoming = sectionReactions
      .filter(sr => sr.total >= MIN_REACTIONS && sr.section.startSec > currentTimeSec && sr.section.startSec <= currentTimeSec + LOOKAHEAD_SEC)
      .sort((a, b) => a.section.startSec - b.section.startSec)[0];

    if (!upcoming) return null;
    const secsAway = Math.ceil(upcoming.section.startSec - currentTimeSec);
    const emojiSymbol = {
      fire: '🔥', dead: '💀', mind_blown: '🤯', emotional: '😭', respect: '🙏', accurate: '🎯',
    }[upcoming.topEmoji ?? 'fire'] ?? '🔥';

    return { label: upcoming.section.label, total: upcoming.total, secsAway, emoji: emojiSymbol, startSec: upcoming.section.startSec };
  }, [sections, currentTimeSec, reactionData, allLines, isVisible]);

  return (
    <AnimatePresence>
      {hotPill && (
        <motion.div
          key={`pill-${hotPill.startSec}`}
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[12] pointer-events-none"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: `0 0 20px ${palette[1] ?? '#a855f7'}22` }}>
            <span className="text-base leading-none">{hotPill.emoji}</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.15em]" style={{ color: palette[1] ?? '#ffffff', opacity: 0.9 }}>{hotPill.label}</span>
            <span className="text-[9px] font-mono text-white/30">×{hotPill.total}</span>
            <span className="text-[9px] font-mono text-white/25">· {hotPill.secsAway}s</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { HotSectionPill };
export default HotSectionPill;
