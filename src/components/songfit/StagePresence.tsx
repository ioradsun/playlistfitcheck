import { useEffect, useState } from "react";

interface Props {
  currentVotes: number;
  onUnlocked: () => void;
  hasPosted?: boolean;
}

function getGateCopy(votes: number, hasPosted: boolean): { text: string; isUnlocked: boolean } {
  const suffix = hasPosted ? "another song" : "your song";
  if (votes >= 3) return { text: "The stage is yours.", isUnlocked: true };
  if (votes === 2) return { text: `Give 1 more signal to drop ${suffix}`, isUnlocked: false };
  if (votes === 1) return { text: `Give 2 more signals to drop ${suffix}`, isUnlocked: false };
  return { text: `Give 3 signals to drop ${suffix}`, isUnlocked: false };
}

export function StagePresence({ currentVotes, onUnlocked, hasPosted = false }: Props) {
  const [fading, setFading] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (currentVotes >= 3 && !held) {
      setHeld(true);
      // Hold "The stage is yours." for 1000ms, then fade out and call onUnlocked
      const holdTimer = setTimeout(() => {
        setFading(true);
        const fadeTimer = setTimeout(() => onUnlocked(), 300);
        return () => clearTimeout(fadeTimer);
      }, 1000);
      return () => clearTimeout(holdTimer);
    }
  }, [currentVotes, held, onUnlocked]);

  const { text, isUnlocked } = getGateCopy(currentVotes, hasPosted);

  return (
    <div
      className={`relative flex flex-col items-center justify-center px-4 py-7 mx-4 my-3 border border-dashed border-border/40 rounded-lg bg-muted/5 transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
    >
      {/* Body */}
      <div className="flex flex-col items-center gap-2 text-center">
        <p
          className={`leading-tight transition-all duration-300 ${
            isUnlocked
              ? "text-[13px] font-medium text-foreground/70"
              : "text-[12px] font-medium text-foreground/60"
          }`}
        >
          {text}
        </p>

        {/* 3-bar indicator */}
        <div className="flex gap-1.5 mt-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-0.5 w-4 rounded-full transition-colors duration-500 ${
                i <= currentVotes ? "bg-primary/60" : "bg-border/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
