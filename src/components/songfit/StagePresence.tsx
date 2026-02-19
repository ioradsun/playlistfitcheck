import { useEffect, useState } from "react";

interface Props {
  currentVotes: number;
  onUnlocked: () => void;
}

export function StagePresence({ currentVotes, onUnlocked }: Props) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (currentVotes >= 3) {
      setFading(true);
      const t = setTimeout(() => onUnlocked(), 300);
      return () => clearTimeout(t);
    }
  }, [currentVotes, onUnlocked]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center px-4 py-7 mx-4 my-3 border border-dashed border-border/40 rounded-lg bg-muted/5 transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
    >
      {/* Mono counter — top right */}
      <div className="absolute top-3 right-3 font-mono text-[9px] tracking-widest text-muted-foreground/40 uppercase">
        Signal Progress: {Math.min(currentVotes, 3)}/3
      </div>

      {/* Body */}
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[12px] font-medium text-foreground/60 leading-tight">
          Give 3 signals to drop your own.
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
