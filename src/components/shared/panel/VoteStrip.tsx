interface VoteStripProps {
  votedSide: 'a' | 'b' | null;
  score: { total: number; replay_yes: number } | null;
  onVoteYes: () => void;
  onVoteNo: () => void;
  onReplay?: () => void;
  palette?: string[];
}

export function VoteStrip({
  votedSide,
  score,
  onVoteYes,
  onVoteNo,
  onReplay,
  palette,
}: VoteStripProps) {
  const accent = palette?.[1] ?? 'rgba(255,255,255,0.7)';

  const replayCount = score?.replay_yes ?? 0;
  const skipCount = score != null ? score.total - score.replay_yes : 0;

  const activeStyle = (active: boolean) => ({
    color: active ? accent : 'rgba(255,255,255,0.25)',
    borderBottom: active ? `1px solid ${accent}` : '1px solid transparent',
  });

  return (
    <div
      className="flex items-center shrink-0 border-b border-white/[0.06]"
      style={{ height: 40 }}
    >
      <button
        onClick={onVoteYes}
        className="flex-1 flex items-center justify-center gap-2 h-full px-3 hover:bg-white/[0.03] transition-colors focus:outline-none"
      >
        <span
          className="text-[11px] font-mono tracking-[0.12em] uppercase transition-colors pb-px"
          style={activeStyle(votedSide === 'a')}
        >
          Run it back
        </span>
        {replayCount > 0 && (
          <span className="text-[9px] font-mono text-white/20">{replayCount}</span>
        )}
      </button>

      <div className="w-px self-stretch my-2 bg-white/10 shrink-0" />

      <button
        onClick={onVoteNo}
        className="flex-1 flex items-center justify-center gap-2 h-full px-3 hover:bg-white/[0.03] transition-colors focus:outline-none"
      >
        <span
          className="text-[11px] font-mono tracking-[0.12em] uppercase transition-colors pb-px"
          style={activeStyle(votedSide === 'b')}
        >
          Not For Me
        </span>
        {skipCount > 0 && (
          <span className="text-[9px] font-mono text-white/20">{skipCount}</span>
        )}
      </button>

      {onReplay && (
        <>
          <div className="w-px self-stretch my-2 bg-white/10 shrink-0" />
          <button
            onClick={onReplay}
            className="flex items-center justify-center px-3 h-full text-[11px] font-mono text-white/25 hover:text-white/60 transition-colors focus:outline-none shrink-0"
          >
            ↺
          </button>
        </>
      )}
    </div>
  );
}
