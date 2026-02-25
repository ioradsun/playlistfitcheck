/**
 * InlineBattleFeed — Renders an inline hook battle canvas in the CrowdFit feed.
 * Parses slugs from the battle URL, looks up the battle_id, then renders
 * InlineBattle in a feed-friendly autoplay mode (both visible, muted).
 * Tap a side to unmute that hook.
 */

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Loader2, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineBattle } from "@/components/hookfit/InlineBattle";
import type { HookData } from "@/hooks/useHookCanvas";

interface Props {
  /** Battle page URL like /:artistSlug/:songSlug/:hookSlug */
  battleUrl: string;
  songTitle: string;
  artistName: string;
  /** Which side the user voted for in HookReview */
  votedSide?: "a" | "b" | null;
}

function InlineBattleFeedInner({ battleUrl, songTitle, artistName, votedSide }: Props) {
  const [battleId, setBattleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activePlaying, setActivePlaying] = useState<"a" | "b" | null>(null);
  const [hooksReady, setHooksReady] = useState(false);

  // Parse slugs from URL and look up battle_id
  useEffect(() => {
    const segments = battleUrl.replace(/^\//, "").split("/").filter(Boolean);
    if (segments.length < 3) {
      setError(true);
      setLoading(false);
      return;
    }
    const [artistSlug, songSlug, hookSlug] = segments;

    supabase
      .from("shareable_hooks" as any)
      .select("battle_id")
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .eq("hook_slug", hookSlug)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data || !(data as any).battle_id) {
          setError(true);
          setLoading(false);
          return;
        }
        setBattleId((data as any).battle_id);
        setLoading(false);
      });
  }, [battleUrl]);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleTileTap = useCallback((side: "a" | "b") => {
    setActivePlaying(prev => prev === side ? null : side);
  }, []);

  // When a hook finishes, alternate to the other side; if both played, stop
  const playedRef = useRef<Set<"a" | "b">>(new Set());
  const handleHookEnd = useCallback((side: "a" | "b") => {
    playedRef.current.add(side);
    if (side === "a" && !playedRef.current.has("b")) {
      setActivePlaying("b");
    } else if (side === "b" && !playedRef.current.has("a")) {
      setActivePlaying("a");
    } else {
      // Both have played — stop
      setActivePlaying(null);
      playedRef.current.clear();
    }
  }, []);

  // Reset played tracker when user manually taps
  const handleTileTapWrapped = useCallback((side: "a" | "b") => {
    playedRef.current.clear();
    handleTileTap(side);
  }, [handleTileTap]);

  const handleHooksLoaded = useCallback((a: HookData, b: HookData | null) => {
    setHooksReady(true);
  }, []);

  // Mute everything when scrolled out of view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setActivePlaying(null);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const openFullPage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(battleUrl, "_blank");
  }, [battleUrl]);

  if (error) {
    return (
      <a
        href={battleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mx-3 my-2 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors p-4 text-center"
      >
        <p className="text-sm font-semibold">{songTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">Tap to watch hook battle →</p>
      </a>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden bg-black rounded-xl" style={{ minHeight: 300, height: 300 }}>
      {(loading || !battleId) ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center space-y-2">
            <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Loading battle…</p>
          </div>
        </div>
      ) : (
        <InlineBattle
          battleId={battleId}
          mode="judgment"
          activePlaying={activePlaying}
          votedSide={votedSide}
          onTileTap={handleTileTapWrapped}
          onHooksLoaded={handleHooksLoaded}
          onHookEnd={handleHookEnd}
        />
      )}

      {/* Title overlay top-left */}
      {hooksReady && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 z-10 pointer-events-none"
        >
          <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5">
            {songTitle}
          </span>
          <button
            onClick={openFullPage}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors pointer-events-auto"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Bottom controls — one mute button per side */}
      {hooksReady && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between p-2 z-30 pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActivePlaying(prev => prev === "a" ? null : "a");
            }}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors pointer-events-auto"
          >
            {activePlaying === "a" ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActivePlaying(prev => prev === "b" ? null : "b");
            }}
            className="p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors pointer-events-auto"
          >
            {activePlaying === "b" ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

export const InlineBattleFeed = memo(InlineBattleFeedInner);
