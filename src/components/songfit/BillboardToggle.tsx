import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { BillboardMode, ContentFilter, FeedView } from "./types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const billboardModes: { key: BillboardMode; label: string }[] = [
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "all_time", label: "All-Time" },
];

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
  contentFilter: ContentFilter;
  onContentFilterChange: (f: ContentFilter) => void;
  isLoggedIn?: boolean;
  compact?: boolean;
}

const contentLabels: Record<ContentFilter, string> = {
  all: "All",
  lyrics: "Lyrics",
  beats: "Beats",
};

export function BillboardToggle({
  view,
  onViewChange,
  billboardMode,
  onModeChange,
  contentFilter,
  onContentFilterChange,
  isLoggedIn: _isLoggedIn,
  compact = false,
}: Props) {
  const [billboardDropdownOpen, setBillboardDropdownOpen] = useState(false);
  const [contentDropdownOpen, setContentDropdownOpen] = useState(false);

  const isRecentActive = view === "all";
  const isBillboardActive = view === "billboard";

  return (
    <div className={compact ? "" : undefined}>
      <div className={cn("flex items-center", !compact && "w-full", compact && "whitespace-nowrap gap-2")}>
        {/* Recent tab */}
        <div className="flex items-center justify-center">
          <DropdownMenu
            open={contentDropdownOpen}
            onOpenChange={(o) => {
              if (o && !isRecentActive) return;
              setContentDropdownOpen(o);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isRecentActive) {
                    onViewChange("all");
                  } else {
                    setContentDropdownOpen((prev) => !prev);
                  }
                }}
                className={cn(
                  "flex items-center gap-0.5 transition-all duration-150",
                  compact ? "py-1.5 text-xs px-2" : "py-2.5 text-sm px-4",
                  isRecentActive
                    ? compact
                      ? "font-medium text-white"
                      : "font-medium text-foreground"
                    : compact
                      ? "font-normal text-white/50"
                      : "font-normal text-muted-foreground",
                )}
              >
                {contentLabels[contentFilter]}
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-all duration-150",
                    isRecentActive ? "opacity-60" : "opacity-0 w-0",
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-32 bg-popover z-50">
              {(["all", "lyrics", "beats"] as ContentFilter[]).map((f) => (
                <DropdownMenuItem
                  key={f}
                  onClick={() => {
                    onContentFilterChange(f);
                    onViewChange("all");
                    setContentDropdownOpen(false);
                  }}
                  className={cn(
                    "text-sm",
                    contentFilter === f && "text-foreground font-medium",
                  )}
                >
                  {contentLabels[f]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Separator */}
        <div className={cn("w-px self-stretch", compact ? "bg-white/20 my-2" : "bg-border/60 my-2")} />

        {/* FMLY Top 40 tab */}
        <div className="flex items-center justify-center">
          <DropdownMenu
            open={billboardDropdownOpen}
            onOpenChange={(o) => {
              if (o && !isBillboardActive) return;
              setBillboardDropdownOpen(o);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isBillboardActive) {
                    onViewChange("billboard");
                  } else {
                    setBillboardDropdownOpen((prev) => !prev);
                  }
                }}
                className={cn(
                  "flex items-center gap-0.5 transition-all duration-150 whitespace-nowrap",
                  compact ? "py-1.5 text-xs px-2" : "py-2.5 text-sm px-4",
                  isBillboardActive
                    ? compact
                      ? "font-medium text-white"
                      : "font-medium text-foreground"
                    : compact
                      ? "font-normal text-white/50"
                      : "font-normal text-muted-foreground",
                )}
              >
                FMLY Top 40
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-all duration-150",
                    isBillboardActive ? "opacity-60" : "opacity-0 w-0",
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="w-44 bg-popover z-50"
            >
              {billboardModes.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    onModeChange(key);
                    onViewChange("billboard");
                    setBillboardDropdownOpen(false);
                  }}
                  className={cn(
                    "text-sm",
                    billboardMode === key && "text-foreground font-medium",
                  )}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
