import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { BillboardMode, FeedView } from "./types";
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

const recentSubViews: { key: FeedView; label: string; desc: string }[] = [
  { key: "recent", label: "Recent", desc: "All live submissions" },
  { key: "pending", label: "Pending", desc: "No signals yet" },
  { key: "resolved", label: "Resolved", desc: "Signaled submissions" },
];

interface Props {
  view: FeedView;
  onViewChange: (v: FeedView) => void;
  billboardMode: BillboardMode;
  onModeChange: (m: BillboardMode) => void;
  isLoggedIn?: boolean;
}

export function BillboardToggle({ view, onViewChange, billboardMode, onModeChange, isLoggedIn }: Props) {
  const [recentDropdownOpen, setRecentDropdownOpen] = useState(false);
  const [billboardDropdownOpen, setBillboardDropdownOpen] = useState(false);

  const isRecentActive = view === "recent" || view === "pending" || view === "resolved";
  const isBillboardActive = view === "billboard";
  const showRecentChevron = isLoggedIn && isRecentActive;

  return (
    <div className="border-b border-border/40">
      <div className="flex">
        {/* Recent tab */}
        <div className="flex-1 flex items-center justify-center">
          <DropdownMenu
            open={recentDropdownOpen}
            onOpenChange={(o) => {
              if (o && (!isRecentActive || !isLoggedIn)) return;
              setRecentDropdownOpen(o);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isRecentActive) {
                    onViewChange("recent");
                  } else if (isLoggedIn) {
                    setRecentDropdownOpen((prev) => !prev);
                  }
                }}
                className={cn(
                  "flex items-center gap-0.5 py-2.5 text-sm transition-all duration-150",
                  isRecentActive
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground"
                )}
              >
                {view === "pending" ? "Pending" : view === "resolved" ? "Resolved" : "Recent"}
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-all duration-150",
                    showRecentChevron ? "opacity-60" : "opacity-0 w-0"
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-40 bg-popover z-50">
              {recentSubViews.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => { onViewChange(key); setRecentDropdownOpen(false); }}
                  className={cn(
                    "text-sm",
                    view === key && "text-foreground font-medium"
                  )}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* FMLY Top 40 tab */}
        <div className="flex-1 flex items-center justify-center">
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
                  "flex items-center gap-0.5 py-2.5 text-sm transition-all duration-150",
                  isBillboardActive
                    ? "font-medium text-foreground"
                    : "font-normal text-muted-foreground"
                )}
              >
                FMLY Top 40
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-all duration-150",
                    isBillboardActive ? "opacity-60" : "opacity-0 w-0"
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 bg-popover z-50">
              {billboardModes.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => { onModeChange(key); onViewChange("billboard"); setBillboardDropdownOpen(false); }}
                  className={cn(
                    "text-sm",
                    billboardMode === key && "text-foreground font-medium"
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
