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
  /** Most-voted reaction emoji + count. Shown greyscale pre-vote, color post-vote. */
  topReaction?: { symbol: string; count: number } | null;
  /**
   * "embedded" — inside LyricDanceEmbed canvas (backdrop blur, py-3 buttons)
   * "fullscreen" — SongFitPostCard / ShareableLyricDance (no backdrop, py-2.5, rounded wrapper)
   */
  variant?: "embedded" | "fullscreen";
}

export function CardBottomBar({
  votedSide,
  score,
  onVoteYes,
  onVoteNo,
  onOpenReactions,
  onClose,
  panelOpen = false,
  topReaction,
  variant = "embedded",
}: CardBottomBarProps) {
  const py = variant === "embedded" ? "py-3" : "py-2.5";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch"
      : "flex items-stretch mx-1 my-1 rounded-md overflow-hidden";
  const wrapperStyle =
    variant === "embedded" ? {} : { background: "rgba(255,255,255,0.03)" };

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      {/* Left — vote state content */}
      {votedSide === null ? (
        /* Pre-vote: Run it back / Skip — no selection yet */
        <>
          <button
            onClick={() => { onVoteYes(); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors"
              style={{
                color: "rgba(255,255,255,0.40)",
              }}
            >
              Run it back
            </span>
          </button>
          <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
          <button
            onClick={() => { onVoteNo(); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors"
              style={{
                color: "rgba(255,255,255,0.40)",
              }}
            >
              Skip
            </span>
          </button>
        </>
      ) : (
        /* Post-vote: same buttons, active side highlighted, tapping the other side re-votes */
        <>
          <button
            onClick={() => { onVoteYes(); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors pb-px"
              style={{
                color: votedSide === "a" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.25)",
                borderBottom: votedSide === "a" ? "1px solid rgba(255,255,255,0.50)" : "1px solid transparent",
              }}
            >
              Run it back
            </span>
            {(score?.replay_yes ?? 0) > 0 && (
              <span className="text-[9px] font-mono text-white/20">
                {score!.replay_yes}
              </span>
            )}
          </button>
          <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
          <button
            onClick={() => { onVoteNo(); }}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span
              className="text-[11px] font-mono tracking-[0.15em] uppercase transition-colors pb-px"
              style={{
                color: votedSide === "b" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.25)",
                borderBottom: votedSide === "b" ? "1px solid rgba(255,255,255,0.50)" : "1px solid transparent",
              }}
            >
              Skip
            </span>
            {score != null && (score.total - score.replay_yes) > 0 && (
              <span className="text-[9px] font-mono text-white/20">
                {score.total - score.replay_yes}
              </span>
            )}
          </button>
        </>
      )}


      {/* Right — persistent reaction/X, always visible */}
      <div style={{ width: "0.5px" }} className="bg-white/10 self-stretch my-2" />
      <button
        onClick={() => {
          if (panelOpen) {
            onClose();
          } else {
            onOpenReactions();
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
