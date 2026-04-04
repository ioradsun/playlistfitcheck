/**
 * SongFitFeed — CrowdFit feed.
 *
 * Clean rewrite. IntersectionObserver for infinite scroll + card lifecycle.
 * Supports reels mode (full-screen snap scroll) and standard mode.
 * PostCommentPanel is the sole comment UX (inline in card).
 */
import { memo, useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { Loader2, Plus, User, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useFeedPosts } from "./useFeedPosts";
import { SongFitPostCard } from "./SongFitPostCard";
import { SongFitInlineComposer } from "./SongFitInlineComposer";
import { BillboardToggle } from "./BillboardToggle";
import { audioController } from "@/lib/audioController";
import { logImpression } from "@/lib/engagementTracking";
import { cn } from "@/lib/utils";
import { useVoteGate } from "@/hooks/useVoteGate";
import { PanelShell } from "@/components/shared/panel/PanelShell";

// ── Skeleton ────────────────────────────────────────────────────────────────
function FeedSkeleton({ reelsMode }: { reelsMode: boolean }) {
  if (reelsMode) return <div className="h-[100dvh] snap-start bg-black" />;
  return (
    <div className="space-y-3 pt-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-2 pb-3">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="h-8 w-8 rounded-full bg-white/[0.04]" />
              <div className="h-3 w-32 rounded bg-white/[0.04]" />
            </div>
            <div style={{ height: 320 }} />
            <div className="flex items-stretch" style={{ height: 48 }}>
              <div className="flex-1 flex items-center justify-center">
                <div className="h-3 w-16 rounded bg-white/[0.03]" />
              </div>
              <div className="w-px bg-white/[0.04] self-stretch my-3" />
              <div className="flex-1 flex items-center justify-center">
                <div className="h-3 w-16 rounded bg-white/[0.03]" />
              </div>
              <div className="w-px bg-white/[0.04] self-stretch my-3" />
              <div className="w-16 flex items-center justify-center">
                <div className="h-3 w-3 rounded bg-white/[0.03]" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Observed card: two IntersectionObservers ────────────────────────────────
// 1. Wide margin (200px): drives cold/warm lifecycle
// 2. Tight margin (center 20%): reports "I'm at center" to FeedList
const ObservedCard = memo(function ObservedCard({
  post,
  rank,
  onRefresh,
  isBillboard,
  signalData,
  lyricDanceData,
  reelsMode,
  isFirst,
  preload,
  onCenterEnter,
  onCenterLeave,
  cardRefsMap,
}: {
  post: any;
  rank?: number;
  onRefresh: () => void;
  isBillboard?: boolean;
  signalData?: any;
  lyricDanceData?: any;
  reelsMode?: boolean;
  isFirst?: boolean;
  preload?: boolean;
  onCenterEnter: (postId: string) => void;
  onCenterLeave: (postId: string) => void;
  cardRefsMap: MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const loggedRef = useRef(false);

  // Register DOM ref for geometric center scoring
  useEffect(() => {
    const el = ref.current;
    if (el) cardRefsMap.current.set(post.id, el);
    return () => {
      cardRefsMap.current.delete(post.id);
    };
  }, [post.id, cardRefsMap]);

  // Wide observer: visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          if (!loggedRef.current) {
            loggedRef.current = true;
            logImpression(post.id);
          }
        }
      },
      { rootMargin: reelsMode ? "50% 0px" : "200px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, reelsMode]);

  // Tight observer: center detection — only the middle 30% of viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onCenterEnter(post.id);
        else onCenterLeave(post.id);
      },
      { rootMargin: reelsMode ? "-45% 0px -45% 0px" : "-35% 0px -35% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, onCenterEnter, onCenterLeave, reelsMode]);

  return (
    <div ref={ref} className={cn("shrink-0", reelsMode && "h-[100dvh] snap-start")}>
      <SongFitPostCard
        post={post}
        rank={rank}
        onRefresh={onRefresh}
        isBillboard={isBillboard}
        signalData={signalData}
        lyricDanceData={lyricDanceData}
        visible={visible}
        reelsMode={reelsMode}
        isFirst={isFirst}
        preload={preload}
      />
    </div>
  );
});

// ── Feed list ───────────────────────────────────────────────────────────────
function FeedList({
  posts,
  feedView,
  signalMap,
  loadingMore,
  hasMore,
  loadMore,
  onRefresh,
  lyricDataMap,
  reelsMode,
}: {
  posts: any[];
  feedView: string;
  signalMap: any;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  onRefresh: () => void;
  lyricDataMap: Map<string, any>;
  reelsMode: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [preloadId, setPreloadId] = useState<string | null>(null);
  const centerSetRef = useRef<Set<string>>(new Set());
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const pickBestCandidate = useCallback((): string | null => {
    const set = centerSetRef.current;
    if (set.size === 0) return null;
    if (set.size === 1) return set.values().next().value!;
    const vpCenter = window.innerHeight / 2;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const id of set) {
      const el = cardRefsMap.current.get(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - vpCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }, []);

  const scheduleSettle = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      audioController.setAutoPrimary(pickBestCandidate());
    }, 120);
  }, [pickBestCandidate]);

  const onCenterEnter = useCallback((postId: string) => {
    centerSetRef.current.add(postId);
    setPreloadId(postId);
    scheduleSettle();
  }, [scheduleSettle]);

  const onCenterLeave = useCallback((postId: string) => {
    centerSetRef.current.delete(postId);
    audioController.clearExplicitIf(postId);
    // If the leaving card was the preload target, pick the last remaining
    setPreloadId((prev) => {
      if (prev !== postId) return prev;
      const remaining = centerSetRef.current;
      if (remaining.size === 0) return null;
      return Array.from(remaining).pop()!;
    });
    scheduleSettle();
  }, [scheduleSettle]);

  useEffect(() => {
    return () => {
      if (settleRef.current) clearTimeout(settleRef.current);
      audioController.setAutoPrimary(null);
    };
  }, []);

  // Infinite scroll sentinel
  useEffect(() => {
    if (feedView === "billboard" || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feedView, hasMore, loadingMore, loadMore]);

  return (
    <div className={reelsMode ? "" : "pb-24"}>
      {posts.map((post, idx) => (
        <ObservedCard
          key={post.id}
          post={post}
          rank={feedView === "billboard" ? idx + 1 : undefined}
          onRefresh={onRefresh}
          isBillboard={feedView === "billboard"}
          signalData={feedView === "billboard" ? signalMap[post.id] : undefined}
          lyricDanceData={post.lyric_dance_id ? lyricDataMap.get(post.lyric_dance_id) ?? null : null}
          reelsMode={reelsMode}
          isFirst={idx === 0}
          preload={post.id === preloadId}
          cardRefsMap={cardRefsMap}
          onCenterEnter={onCenterEnter}
          onCenterLeave={onCenterLeave}
        />
      ))}

      {hasMore && feedView !== "billboard" && <div ref={sentinelRef} className="h-1" />}

      {loadingMore && (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ── Main feed ───────────────────────────────────────────────────────────────
interface SongFitFeedProps {
  reelsMode?: boolean;
}

export function SongFitFeed({ reelsMode = false }: SongFitFeedProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate, credits, required } = useVoteGate();
  const [showFloatingAnchor, setShowFloatingAnchor] = useState(false);
  const [reelsComposerOpen, setReelsComposerOpen] = useState(false);
  const hasFadedIn = useRef(false);

  const feed = useFeedPosts();

  // Floating anchor on scroll (standard mode only)
  useEffect(() => {
    if (!canCreate || reelsMode) { setShowFloatingAnchor(false); return; }
    const handleScroll = () => {
      const el = document.getElementById("songfit-scroll-container");
      if (el) setShowFloatingAnchor(el.scrollTop > 300);
    };
    document.addEventListener("scroll", handleScroll, true);
    handleScroll();
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [canCreate, reelsMode]);

  const handleLoadNewDrops = useCallback(() => {
    feed.consumeNewDrops();
    document.getElementById("songfit-scroll-container")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [feed]);

  return (
    <div className={reelsMode ? "w-full" : "w-full max-w-[470px] mx-auto"}>
      {/* ── Reels mode: floating UI ── */}
      {reelsMode ? (
        <>
          <div className="fixed top-14 left-0 right-0 z-30 flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-black/50 backdrop-blur-md rounded-full px-1 border border-white/10">
              <BillboardToggle
                view={feed.feedView}
                onViewChange={feed.setFeedView}
                billboardMode={feed.billboardMode}
                onModeChange={feed.setBillboardMode}
                isLoggedIn={!!user}
                compact
              />
            </div>
          </div>
          {feed.pendingNewCount > 0 && !feed.loading && (
            <div className="fixed top-[6.5rem] left-0 right-0 z-30 flex justify-center pointer-events-none">
              <button
                onClick={handleLoadNewDrops}
                className="pointer-events-auto bg-black/60 backdrop-blur-md rounded-full px-4 py-1.5 border border-white/10 text-[10px] font-mono tracking-[0.12em] text-green-400 hover:text-green-300 transition-colors"
              >
                {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ── Standard mode: composer + tabs ── */}
          {user ? (
            <div className="animate-fade-in">
              <SongFitInlineComposer onPostCreated={feed.refresh} />
            </div>
          ) : (
            <div
              className="border-b border-border/40 cursor-pointer"
              onClick={() => navigate("/auth?mode=signup", { state: { returnTab: "songfit" } })}
            >
              <div className="flex gap-3 px-4 pt-3 pb-3">
                <div className="h-10 w-10 rounded-full bg-muted border border-border shrink-0 mt-1 flex items-center justify-center">
                  <User size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 flex items-center">
                  <span className="text-base text-muted-foreground/60">
                    Drop your song and get signals
                  </span>
                </div>
              </div>
            </div>
          )}
          <BillboardToggle
            view={feed.feedView}
            onViewChange={feed.setFeedView}
            billboardMode={feed.billboardMode}
            onModeChange={feed.setBillboardMode}
            isLoggedIn={!!user}
          />
        </>
      )}

      {/* New drops banner (standard mode) */}
      {feed.pendingNewCount > 0 && !feed.loading && !reelsMode && (
        <button
          onClick={handleLoadNewDrops}
          className="w-full py-2 text-center text-[11px] font-mono tracking-[0.1em] text-primary hover:text-primary/80 transition-colors border-b border-border/30"
        >
          {feed.pendingNewCount} New Drop{feed.pendingNewCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* ── Feed content ── */}
      {feed.loading ? (
        (() => { console.log("[SongFitFeed] rendering skeleton, loading=true"); return null; })()
        || <FeedSkeleton reelsMode={reelsMode} />
      ) : feed.posts.length === 0 ? (
        (() => { console.log("[SongFitFeed] rendering empty state, posts.length=0"); return null; })()
        || <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground text-sm">No live submissions yet. Be the first!</p>
        </div>
      ) : (
        <div
          style={{ animation: hasFadedIn.current ? "none" : "fadeIn 0.3s ease forwards" }}
          ref={() => { hasFadedIn.current = true; }}
        >
          <style>{"@keyframes fadeIn{from{opacity:0}to{opacity:1}}"}</style>
          <FeedList
            posts={feed.posts}
            feedView={feed.feedView}
            signalMap={feed.signalMap}
            loadingMore={feed.loadingMore}
            hasMore={feed.hasMore}
            loadMore={feed.loadMore}
            onRefresh={feed.refresh}
            lyricDataMap={feed.lyricDataMap}
            reelsMode={reelsMode}
          />
        </div>
      )}

      {/* ── Reels: floating composer ── */}
      {reelsMode && (
        <>
          <button
            onClick={() => canCreate && setReelsComposerOpen(true)}
            className="fixed top-3 right-3 z-[60] flex items-center justify-center rounded-full transition-all"
            style={{
              width: 40,
              height: 40,
              background: canCreate ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
              backdropFilter: "blur(8px)",
            }}
          >
            {canCreate ? (
              <Plus size={18} className="text-white/80" />
            ) : (
              <div className="flex gap-0.5">
                {Array.from({ length: required }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: i < credits ? "#22c55e" : "rgba(255,255,255,0.2)" }}
                  />
                ))}
              </div>
            )}
          </button>

          <div className="fixed inset-x-0 bottom-0 z-[70]">
            <div className="relative">
              <PanelShell isOpen={reelsComposerOpen} variant="embedded" maxHeight="60%">
                <div className="px-4 pt-3 pb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono tracking-wide uppercase text-white/40">Post your song</span>
                    <button onClick={() => setReelsComposerOpen(false)} className="p-1 text-white/30 hover:text-white/60">
                      <X size={14} />
                    </button>
                  </div>
                  <SongFitInlineComposer
                    onPostCreated={() => { setReelsComposerOpen(false); feed.refresh(); }}
                    onNavigateLyricDance={() => setReelsComposerOpen(false)}
                  />
                </div>
              </PanelShell>
            </div>
          </div>
        </>
      )}

      {/* ── Standard: floating anchor ── */}
      {showFloatingAnchor && !reelsMode && (
        <button
          onClick={() => {
            document.getElementById("songfit-scroll-container")?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="sticky bottom-6 left-1/2 -translate-x-1/2 z-[500] border border-border/50 bg-background text-foreground/70 hover:text-foreground hover:border-border text-[11px] font-mono tracking-wide px-5 py-2 rounded-full shadow-sm transition-all duration-200"
        >
          + Drop Your Song
        </button>
      )}
    </div>
  );
}
