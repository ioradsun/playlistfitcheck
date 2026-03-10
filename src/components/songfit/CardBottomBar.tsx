import { useState } from "react";
import { X } from "lucide-react";

interface CardBottomBarProps {
  votedSide: "a" | "b" | null;
  score: { total: number; replay_yes: number } | null;
  note: string;
  onNoteChange: (note: string) => void;
  onVoteYes: () => void;
  onVoteNo: () => void;
  onSubmit: () => void;
  onOpenReactions: () => void;
  onClose: () => void;
  /** When true the panel is open — render X instead of emoji */
  panelOpen?: boolean;
  /** Most-voted reaction emoji + count. Greyscale pre-vote, color post-vote. */
  topReaction?: { symbol: string; count: number } | null;
  /**
   * "embedded" — inside LyricDanceEmbed canvas (py-3 buttons)
   * "fullscreen" — SongFitPostCard / ShareableLyricDance (py-2.5, rounded wrapper)
   */
  variant?: "embedded" | "fullscreen";
}

export function CardBottomBar({
  votedSide,
  score,
  note,
  onNoteChange,
  onVoteYes,
  onVoteNo,
  onSubmit,
  onOpenReactions,
  onClose,
  panelOpen = false,
  topReaction,
  variant = "embedded",
}: CardBottomBarProps) {
  const [commentFocused, setCommentFocused] = useState(false);
  const py = variant === "embedded" ? "py-3" : "py-2.5";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch"
      : "flex items-stretch mx-1 my-1 rounded-md overflow-hidden";
  const wrapperStyle =
    variant === "embedded" ? {} : { background: "rgba(255,255,255,0.05)", borderTop: "1px solid rgba(255,255,255,0.06)" };

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>

      {/* Left — three states */}
      {votedSide === null ? (
        /* Pre-vote: Run it back / Skip */
        <>
          <button
            onClick={() => { onVoteYes(); setCommentFocused(true); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
              Run it back
            </span>
            {(score?.replay_yes ?? 0) > 0 && (
              <span className="text-[9px] font-mono text-white/20">{score!.replay_yes}</span>
            )}
          </button>
          <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
          <button
            onClick={() => { onVoteNo(); setCommentFocused(true); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
              Skip
            </span>
            {score != null && (score.total - score.replay_yes) > 0 && (
              <span className="text-[9px] font-mono text-white/20">{score.total - score.replay_yes}</span>
            )}
          </button>
        </>
      ) : commentFocused ? (
        /* Post-vote: comment input */
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
              setCommentFocused(false);
            }
            if (e.key === "Escape") setCommentFocused(false);
          }}
          onBlur={() => {
            if (!note) setCommentFocused(false);
          }}
          placeholder="drop your take..."
          autoFocus
          className={`flex-1 bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/30 outline-none px-3 ${py} tracking-wide min-w-0`}
        />
      ) : (
        /* Post-vote: social proof */
        <div className={`flex-1 flex items-center px-3 ${py} overflow-hidden min-w-0`}>
          {score && score.total > 0 ? (
            <span className="text-[10px] font-mono text-emerald-400 truncate">
              {votedSide === "a"
                ? `You + ${Math.max(0, score.replay_yes - 1)} FMLY would Replay this`
                : `${score.replay_yes} / ${score.total} FMLY would Replay this`}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-white/20 truncate">calibrating...</span>
          )}
        </div>
      )}

      {/* Right — persistent emoji/X, always visible */}
      <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
      <button
        onClick={() => {
          if (panelOpen) {
            onClose();
          } else {
            onOpenReactions();
            if (votedSide !== null) setCommentFocused(true);
          }
        }}
        className={`flex items-center justify-center gap-1 px-4 ${py} hover:bg-white/[0.04] transition-colors group shrink-0`}
      >
        {panelOpen ? (
          <X size={14} className="text-white/40 group-hover:text-white/80 transition-colors" />
        ) : (
          <>
            <span
              className="text-[13px] leading-none transition-all duration-300"
              style={{
                filter: votedSide !== null ? "none" : "grayscale(1)",
                opacity: votedSide !== null ? 1 : 0.4,
              }}
            >
              {topReaction?.symbol ?? "🔥"}
            </span>
            {topReaction && topReaction.count > 0 && (
              <span className="text-[9px] font-mono text-white/25 group-hover:text-white/50 transition-colors">
                {topReaction.count}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
