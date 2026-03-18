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
  panelOpen?: boolean;
  topReaction?: { symbol: string; count: number } | null;
  trackTitle?: string;
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
  trackTitle,
  variant = "embedded",
}: CardBottomBarProps) {
  const py = variant === "embedded" ? "py-3" : "py-2.5";

  const wrapperClass =
    variant === "embedded"
      ? "flex items-stretch h-[48px]"
      : "flex items-stretch mx-1 mt-1 rounded-md overflow-hidden h-[44px]";
  const wrapperStyle = variant === "fullscreen"
    ? { background: "rgba(255,255,255,0.07)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }
    : { background: "#0a0a0a" };

  return (
    <div className={wrapperClass} style={wrapperStyle} onClick={(e) => e.stopPropagation()}>
      {/* ── Left side ── */}
      {panelOpen ? (
        /* Panel open: comment input */
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="What hit the most?"
          autoFocus
          className={`flex-1 bg-transparent text-[11px] font-mono text-white/60 placeholder:text-white/25 outline-none px-3 ${py} tracking-wide min-w-0`}
        />
      ) : votedSide === null ? (
        /* Pre-vote: Run it back / Not for me */
        <>
          <button
            onClick={onVoteYes}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white transition-colors">
              Run it back
            </span>
            {(score?.replay_yes ?? 0) > 0 && (
              <span className="text-[9px] font-mono text-white/15">{score!.replay_yes}</span>
            )}
          </button>
          <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
          <button
            onClick={onVoteNo}
            className={`flex-1 flex items-center justify-center gap-2 ${py} hover:bg-white/[0.04] transition-colors group`}
          >
            <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white transition-colors">
              Not For Me
            </span>
            {score != null && score.total - score.replay_yes > 0 && (
              <span className="text-[9px] font-mono text-white/15">{score.total - score.replay_yes}</span>
            )}
          </button>
        </>
      ) : (
        /* Post-vote: social proof — single line */
        <div className={`flex-1 flex items-center px-3 ${py} overflow-hidden min-w-0`}>
          <span className="text-[9px] font-mono tracking-[0.08em] text-white/60 truncate">
            {(() => {
              const total = score?.total ?? 0;
              const replay_yes = score?.replay_yes ?? 0;
              const notForMeCount = total - replay_yes;
              const majorityRanItBack = replay_yes > total / 2;
              const isSplit = total > 0 && replay_yes === total / 2;
              const userAgrees = votedSide === "a" ? majorityRanItBack : !majorityRanItBack;

              let verdict: string;
              let tally: string;

              if (total < 20) {
                verdict = "FMLY STILL VOTING";
                tally = `${replay_yes} / ${total} RAN "${trackTitle || "IT"}" BACK`;
              } else if (isSplit) {
                verdict = "FMLY IS SPLIT";
                tally = `${replay_yes} / ${total} RAN "${trackTitle || "IT"}" BACK`;
              } else {
                verdict = `FMLY ${userAgrees ? "AGREES" : "DISAGREES"}`;
                tally = majorityRanItBack
                  ? `${replay_yes} / ${total} RAN "${trackTitle || "IT"}" BACK`
                  : `${notForMeCount} / ${total} NOT FOR ME`;
              }

              return `${verdict} · ${tally}`;
            })()}
          </span>
        </div>
      )}

      {/* ── Divider — always present ── */}
      <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />

      {/* ── Right side: 🔥 / ✕ — always in the same position ── */}
      <button
        onClick={() => {
          if (panelOpen) {
            onClose();
          } else {
            onOpenReactions();
          }
        }}
        className={`relative z-[500] flex items-center justify-center gap-1 px-4 min-w-[56px] ${py} hover:bg-white/[0.04] transition-colors group shrink-0 focus:outline-none`}
      >
        {panelOpen ? (
          <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
        ) : (
          <>
            <span
              className="text-[13px] leading-none transition-all duration-300"
              style={{
                opacity: 0.7,
              }}
            >
              {topReaction?.symbol ?? "🔥"}
            </span>
            {topReaction && topReaction.count > 0 && (
              <span className="text-[9px] font-mono text-white/15 group-hover:text-white/40 transition-colors">
                {topReaction.count}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
