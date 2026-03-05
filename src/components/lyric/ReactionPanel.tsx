import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/sessionId';
import type { LyricSection, LyricSectionLine } from '@/hooks/useLyricSections';

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

function ReactionPanel({ isOpen, onClose, danceId, activeLine, allLines, palette, onSeekTo, onReactionFired, reactionData, onReactionDataChange }: ReactionPanelProps) {
  const [textInput, setTextInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionReacted, setSessionReacted] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<any[]>([]);

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

  const handleReact = async (emoji: EmojiKey) => {
    if (!danceId) return;
    const sessionId = getSessionId();
    const reactionKey = `${emoji}-${activeLine?.lineIndex ?? 'song'}`;
    if (sessionReacted.has(reactionKey)) return;

    setSessionReacted(prev => new Set([...prev, reactionKey]));
    onReactionFired(emoji);

    await supabase.from('lyric_dance_reactions' as any).insert({
      dance_id: danceId,
      line_index: activeLine?.lineIndex ?? null,
      section_index: null,
      emoji,
      session_id: sessionId,
    });

    onReactionDataChange(prev => {
      const updated = { ...prev };
      if (!updated[emoji]) updated[emoji] = { line: {}, total: 0 };
      updated[emoji].total++;
      if (activeLine?.lineIndex != null) {
        const li = activeLine.lineIndex;
        updated[emoji].line[li] = (updated[emoji].line[li] ?? 0) + 1;
      }
      return updated;
    });
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
          className="fixed left-0 right-0 bottom-[56px] z-40 max-h-[65vh] overflow-y-auto"
          style={{ background: '#0d0d0d', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="px-5 pt-5 pb-4 border-b border-white/[0.05]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30">{activeLine?.sectionLabel ?? 'now playing'}</span>
              <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors">✕</button>
            </div>
            <p className="text-[15px] text-white/80 leading-relaxed mb-3 font-light">{activeLine?.text ?? '...'}</p>
            {(() => {
              const lineTotal = activeLine ? Object.values(reactionData).reduce((sum, e) => sum + (e.line[activeLine.lineIndex] ?? 0), 0) : 0;
              const songTotal = Object.values(reactionData).reduce((sum, e) => sum + e.total, 0);
              const ratio = songTotal > 0 ? lineTotal / songTotal : 0;
              return lineTotal > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, ratio * 100 * 3)}%`, background: palette[1] ?? '#ffffff', opacity: 0.6 }} />
                  </div>
                  <span className="text-[9px] font-mono text-white/30 shrink-0">{lineTotal} {lineTotal === 1 ? 'reaction' : 'reactions'}</span>
                </div>
              ) : null;
            })()}
          </div>

          <div className="px-5 py-4 border-b border-white/[0.05]"><div className="flex items-center justify-between">{EMOJIS.map(({ key, symbol, label }) => {
            const count = activeLine ? (reactionData[key]?.line[activeLine.lineIndex] ?? 0) : (reactionData[key]?.total ?? 0);
            const reacted = sessionReacted.has(`${key}-${activeLine?.lineIndex ?? 'song'}`);
            return <button key={key} onClick={() => handleReact(key as EmojiKey)} className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all ${reacted ? 'bg-white/[0.07] scale-105' : 'hover:bg-white/[0.04] active:scale-95'}`} style={{ minWidth: 44 }}><span className="text-xl leading-none">{symbol}</span><span className="text-[9px] font-mono text-white/30">{count > 0 ? count : label}</span></button>;
          })}</div></div>

          {hotLines.length > 0 && <div className="px-5 py-4 border-b border-white/[0.05]"><p className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/25 mb-3">Hottest on this song</p><div className="reaction-hotlines space-y-1 max-h-[180px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>{hotLines.map((hl) => { const line = allLines.find(l => l.lineIndex === hl.lineIndex); const emoji = { fire: '🔥', dead: '💀', mind_blown: '🤯', emotional: '😭', respect: '🙏', accurate: '🎯' }[hl.topEmoji] ?? '🔥'; return <button key={hl.lineIndex} onClick={() => { if (line) onSeekTo(line.startSec); }} className="w-full flex items-center gap-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left px-2"><span className="text-base leading-none shrink-0">{emoji}</span><span className="flex-1 text-[12px] text-white/50 truncate font-light">{hl.text}</span><span className="text-[9px] font-mono text-white/25 shrink-0">×{hl.total}</span></button>; })}</div></div>}

          <div className="px-5 py-4">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/25 mb-3">Takes</p>
            {!hasSubmitted ? (
              <div className="relative mb-4"><input type="text" value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleTextSubmit(); if (e.key === 'Escape') onClose(); }} placeholder="drop your take..." maxLength={200} className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors pr-16" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono text-white/15 pointer-events-none">↵ send</span></div>
            ) : (
              <p className="text-[11px] font-mono text-white/30 text-center mb-4">FMLY Notified</p>
            )}
            <div className="space-y-3">{comments.map((c: any) => <div key={c.id} className="flex flex-col gap-1">{c.line_index != null && <button onClick={() => { const line = allLines.find(l => l.lineIndex === c.line_index); if (line) onSeekTo(line.startSec); }} className="text-[9px] font-mono text-white/25 hover:text-white/45 transition-colors text-left">on "{allLines.find(l => l.lineIndex === c.line_index)?.text?.slice(0, 40) ?? '...'}..."</button>}<p className={`text-[12px] leading-relaxed font-light ${c.is_pinned ? 'text-white/75' : 'text-white/45'}`}>{c.is_pinned && <span className="text-[9px] mr-1.5 opacity-50">♪</span>}{c.text}</p></div>)}</div>
          </div>
          <style>{`.reaction-hotlines::-webkit-scrollbar { display: none; }`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { ReactionPanel };
export default ReactionPanel;
