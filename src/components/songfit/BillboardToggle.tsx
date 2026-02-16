import { useState } from "react";
import type { BillboardMode, FeedView } from "./types";
import { cn } from "@/lib/utils";
import { Flame, Trophy, Target, TrendingUp } from "lucide-react";

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
}

const modes: { key: BillboardMode; label: string; icon: React.ReactNode }[] = [
  { key: "trending", label: "Trending", icon: <Flame size={13} /> },
  { key: "top", label: "Top", icon: <Trophy size={13} /> },
  { key: "best_fit", label: "Best Fit", icon: <Target size={13} /> },
  { key: "all_time", label: "All-Time", icon: <TrendingUp size={13} /> },
];

export function BillboardToggle({ view, onViewChange, billboardMode, onModeChange }: Props) {
  return (
    <div className="border-b border-border/40">
      {/* Main toggle */}
      <div className="flex">
        <button
          onClick={() => onViewChange("recent")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold text-center transition-colors border-b-2",
            view === "recent"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Recent
        </button>
        <button
          onClick={() => onViewChange("billboard")}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold text-center transition-colors border-b-2",
            view === "billboard"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Billboard
        </button>
      </div>

      {/* Billboard sub-modes */}
      {view === "billboard" && (
        <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                billboardMode === m.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
