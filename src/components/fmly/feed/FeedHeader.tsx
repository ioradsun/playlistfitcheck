import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BillboardToggle } from "@/components/fmly/BillboardToggle";
import { cn } from "@/lib/utils";
import type { FeedState } from "@/components/fmly/useFeedPosts";
import type { ContentFilter } from "@/components/fmly/types";
import { useFeedHeader } from "./useFeedHeader";

interface FeedHeaderProps {
  reelsMode: boolean;
  feed: FeedState;
  contentFilter: ContentFilter;
  setContentFilter: (next: ContentFilter) => void;
  user: { id?: string } | null;
  hasSearchQuery: boolean;
}

export function FeedHeader({
  reelsMode,
  feed,
  contentFilter,
  setContentFilter,
  user,
  hasSearchQuery,
}: FeedHeaderProps) {
  const navigate = useNavigate();
  const {
    plusOpen,
    setPlusOpen,
    searchFocused,
    setSearchFocused,
    setSearchOpen,
    searchInputRef,
    searchUiVisible,
    openSearch,
    clearSearch,
  } = useFeedHeader({ reelsMode, feed });

  if (reelsMode) {
    return (
      <>
        <div className="fixed top-14 left-0 right-0 z-[60] flex justify-center pointer-events-none">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/80 backdrop-blur-md px-1">
            {!searchUiVisible && (
              <>
                <BillboardToggle
                  view={feed.feedView}
                  onViewChange={feed.setFeedView}
                  billboardMode={feed.billboardMode}
                  onModeChange={feed.setBillboardMode}
                  contentFilter={contentFilter}
                  onContentFilterChange={setContentFilter}
                  isLoggedIn={!!user}
                  compact
                />
                <div className="h-4 w-px bg-border/60" />
              </>
            )}

            {!searchUiVisible && (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={openSearch}
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open search"
                >
                  <Search size={14} />
                </button>
                <button
                  onClick={() => setPlusOpen((v) => !v)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Add music"
                >
                  <Plus size={16} />
                </button>
                <AnimatePresence>
                  {plusOpen && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex items-center gap-1 overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          navigate("/the-director?mode=song");
                        }}
                        className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                      >
                        song
                      </button>
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          navigate("/the-director?mode=beat");
                        }}
                        className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                      >
                        beat
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {searchUiVisible && (
              <div className="flex items-center w-[220px] bg-card/70 px-2 rounded-full">
                <button
                  type="button"
                  onClick={clearSearch}
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Close search"
                >
                  <X size={14} />
                </button>
                <input
                  ref={searchInputRef}
                  value={feed.searchTerm}
                  onChange={(e) => feed.setSearchTerm(e.target.value)}
                  onFocus={() => {
                    setSearchFocused(true);
                    setSearchOpen(true);
                  }}
                  onBlur={() => {
                    setSearchFocused(false);
                    if (!feed.searchTerm.trim()) setSearchOpen(false);
                  }}
                  placeholder="Search artists or songs"
                  className="w-full bg-transparent py-2 pr-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clearSearch();
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {hasSearchQuery && (
          <div className="fixed top-14 left-0 right-0 z-[59] flex justify-center pointer-events-none">
            <div className="pointer-events-auto rounded-full bg-background/80 backdrop-blur-md px-3 py-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
              {feed.searchLoading
                ? `Searching "${feed.searchTerm.trim()}"...`
                : `${feed.searchResults.length} result${feed.searchResults.length !== 1 ? "s" : ""} for "${feed.searchTerm.trim()}"`}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="border-b border-border/40">
      <div className="flex items-center justify-center px-3 py-2">
        <div className="flex w-full items-center justify-center gap-2">
          {!searchUiVisible && (
            <>
              <BillboardToggle
                view={feed.feedView}
                onViewChange={feed.setFeedView}
                billboardMode={feed.billboardMode}
                onModeChange={feed.setBillboardMode}
                contentFilter={contentFilter}
                onContentFilterChange={setContentFilter}
                isLoggedIn={!!user}
              />
              <div className="h-4 w-px bg-border/60" />
            </>
          )}

          <div
            className={cn(
              "flex items-center overflow-hidden rounded-full transition-all duration-200",
              searchUiVisible ? "w-[220px] bg-card/70 px-2" : "w-10 px-0.5",
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (searchUiVisible || hasSearchQuery) clearSearch();
                else openSearch();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={searchUiVisible || hasSearchQuery ? "Close search" : "Open search"}
            >
              {searchUiVisible || hasSearchQuery ? <X size={14} /> : <Search size={14} />}
            </button>
            <input
              ref={searchInputRef}
              value={feed.searchTerm}
              onChange={(e) => feed.setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search artists or songs"
              className={cn(
                "w-full bg-transparent py-2 pr-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground transition-opacity",
                searchUiVisible ? "opacity-100" : "pointer-events-none w-0 opacity-0",
              )}
              onKeyDown={(e) => {
                if (e.key === "Escape") clearSearch();
              }}
            />
          </div>

          {!searchUiVisible && (
            <>
              <div className="h-4 w-px bg-border/60" />
              <button
                onClick={() => setPlusOpen((v) => !v)}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Add music"
              >
                <Plus size={16} />
              </button>
              <AnimatePresence>
                {plusOpen && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex items-center gap-1 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        setPlusOpen(false);
                        navigate("/the-director?mode=song");
                      }}
                      className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                    >
                      song
                    </button>
                    <button
                      onClick={() => {
                        setPlusOpen(false);
                        navigate("/the-director?mode=beat");
                      }}
                      className="whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-mono tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
                    >
                      beat
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {hasSearchQuery && (
        <div className="px-3 pb-2 text-center font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
          {feed.searchLoading
            ? `Searching “${feed.searchTerm.trim()}”...`
            : `${feed.searchResults.length} result${feed.searchResults.length !== 1 ? "s" : ""} for “${feed.searchTerm.trim()}”`}
        </div>
      )}
    </div>
  );
}
