import { useState, useEffect } from "react";
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
  /** When true the panel is open — render X instead of 🔥 */
  panelOpen?: boolean;
  /**
   * "embedded" — inside LyricDanceEmbed canvas (backdrop blur, py-3 buttons)
   * "fullscreen" — SongFitPostCard / ShareableLyricDance (no backdrop, py-2.5, rounded wrapper)
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
  variant = "embedded",
}: CardBottomBarProps) {
  const [commentFocused, setCommentFocused] = useState(false);
  const py = variant === "embedded" ? "py-3" : "py-2.5";

  // Auto-open comment input immediately after voting
  useEffect(() => {
    if (votedSide !== null) setCommentFocused(true);
  }, [votedSide]);

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch"
      : "flex items-stretch mx-1 my-1 rounded-md overflow-hidden";
  const wrapperStyle =
    variant === "embedded" ? {} : { background: "rgba(255,255,255,0.03)" };

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      {votedSide === null ? (
        /* Pre-vote: Run it back / Skip */
        <>
          <button
            onClick={onVoteYes}
            className={`flex-1 flex items-center justify-center ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
              Run it back
            </span>
          </button>
          <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
          <button
            onClick={onVoteNo}
            className={`flex-1 flex items-center justify-center ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white/40 group-hover:text-white/80 transition-colors">
              Skip
            </span>
          </button>
        </>
      ) : commentFocused ? (
        /* Post-vote comment input */
        <>
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
          <button
            onClick={() => {
              setCommentFocused(false);
              onClose();
            }}
            className={`flex items-center justify-center px-4 ${py} hover:bg-white/[0.04] transition-colors group shrink-0`}
          >
            <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
          </button>
        </>
      ) : (
        /* Post-vote default: social proof + 🔥 */
        <>
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
          <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
          <button
            onClick={() => {
              if (panelOpen) {
                onClose();
              } else {
                onOpenReactions();
                setCommentFocused(true);
              }
            }}
            className={`flex items-center justify-center px-4 ${py} hover:bg-white/[0.04] transition-colors group shrink-0`}
          >
            {panelOpen
              ? <X size={14} className="text-white/40 group-hover:text-white/80 transition-colors" />
              : <span className="text-[15px] grayscale opacity-40 group-hover:opacity-70 transition-opacity">🔥</span>
            }
          </button>
        </>
      )}
    </div>
  );
}
