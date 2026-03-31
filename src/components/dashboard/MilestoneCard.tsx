import { useCallback, useRef } from "react";

interface MilestoneProps {
  number: string;
  label: string;
  sublabel?: string;
  songTitle: string;
  accentColor?: string;
}

export function MilestoneCard({
  number,
  label,
  sublabel,
  songTitle,
  accentColor = "rgba(255,120,30,0.8)",
}: MilestoneProps) {
  const cardRef = useRef<HTMLButtonElement>(null);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;

    try {
      const el = cardRef.current;
      const canvas = document.createElement("canvas");
      const dpr = 2;
      canvas.width = el.offsetWidth * dpr;
      canvas.height = el.offsetHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      ctx.fillStyle = "#0a0a10";
      ctx.fillRect(0, 0, el.offsetWidth, el.offsetHeight);

      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, 4, el.offsetHeight);

      ctx.font = "bold 48px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(number, 24, 60);

      ctx.font = "14px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(label, 24, 85);

      if (sublabel) {
        ctx.font = "11px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(sublabel.slice(0, 30), 24, 104);
      }

      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText(songTitle.slice(0, 20), 24, el.offsetHeight - 16);

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillText("tools.fm", el.offsetWidth - 60, el.offsetHeight - 16);

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const file = new File([blob], "milestone.png", { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            text: `${number} ${label.toLowerCase()} on "${songTitle}" 🔥 tools.fm`,
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "milestone.png";
          a.click();
          URL.revokeObjectURL(url);
        }
      }, "image/png");
    } catch {
      // Ignore share cancel.
    }
  }, [accentColor, label, number, songTitle, sublabel]);

  return (
    <button
      ref={cardRef}
      onClick={handleShare}
      className="w-full text-left glass-card rounded-xl overflow-hidden border border-border/10 hover:border-primary/20 transition-colors active:scale-[0.98]"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="p-4 space-y-1">
        <p className="text-[28px] font-mono font-bold text-foreground/90">{number}</p>
        <p className="text-[11px] font-mono text-foreground/50">{label}</p>
        {sublabel && <p className="text-[9px] font-mono text-muted-foreground/30">{sublabel}</p>}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[9px] font-mono text-muted-foreground/25 truncate">{songTitle}</p>
          <p className="text-[8px] font-mono text-muted-foreground/15">tap to share · tools.fm</p>
        </div>
      </div>
    </button>
  );
}
