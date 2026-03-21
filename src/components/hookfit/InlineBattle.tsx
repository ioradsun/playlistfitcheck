/**
 * InlineBattle — Single-engine battle renderer.
 * ONE LyricDancePlayer, two canvas pairs, snapshot-based side switching.
 *
 * Architecture: 3 effects total.
 *   1. Fetch: loads hooks + dance data from Supabase
 *   2. Init: creates the engine once when data + canvas are ready
 *   3. Control: ONE unified effect that reacts to activePlaying, cardState, forceMuted
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LyricDancePlayer,
  type LyricDanceData,
} from "@/engine/LyricDancePlayer";
import { preloadImage } from "@/lib/imagePreloadCache";
import { withInitLimit } from "@/engine/initQueue";

export type BattleMode =
  | "dark"
  | "listen-a"
  | "listen-b"
  | "judgment"
  | "scorecard"
  | "results";

export interface HookInfo {
  id: string;
  user_id?: string;
  hook_start: number;
  hook_end: number;
  hook_label: string | null;
  hook_phrase: string | null;
  hook_slug: string;
  battle_position: number;
  artist_slug: string;
  song_slug: string;
  vote_count: number;
  palette?: string[];
}

export interface InlineBattleHandle {
  getPlayer: () => LyricDancePlayer | null;
}

interface Props {
  battleId: string;
  mode: BattleMode;
  votedSide?: "a" | "b" | null;
  voteCount?: number;
  votePct?: number;
  onHookEnd?: (side: "a" | "b") => void;
  onTileTap?: (side: "a" | "b") => void;
  activePlaying: "a" | "b" | null;
  forceMuted?: boolean;
  onEngineReady?: () => void;
  cardState?: "active" | "warm" | "cold";
  /** Pre-fetched data from BattleEmbed — eliminates per-card fetch waterfall */
  prefetchedHookA?: HookInfo | null;
  prefetchedHookB?: HookInfo | null;
  prefetchedDanceData?: LyricDanceData | null;
}

export const HOOK_SELECT =
  "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_position,artist_slug,song_slug,vote_count,palette";

export const InlineBattle = forwardRef<InlineBattleHandle, Props>(
  function InlineBattle(
    {
      mode,
      votedSide,
      voteCount,
      votePct,
      onHookEnd,
      onTileTap,
      activePlaying,
      forceMuted,
      onEngineReady,
      cardState,
      prefetchedHookA,
      prefetchedHookB,
      prefetchedDanceData,
    },
    ref,
  ) {
    // ── Data state ──────────────────────────────────────────────
    const [hookA, setHookA] = useState<HookInfo | null>(null);
    const [hookB, setHookB] = useState<HookInfo | null>(null);
    const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [ready, setReady] = useState(false);
    const hookEndFiredA = useRef(false);
    const hookEndFiredB = useRef(false);

    // ── Canvas refs ─────────────────────────────────────────────
    const canvasARef = useRef<HTMLCanvasElement>(null);
    const textCanvasARef = useRef<HTMLCanvasElement>(null);
    const containerARef = useRef<HTMLDivElement>(null);
    const canvasBRef = useRef<HTMLCanvasElement>(null);
    const textCanvasBRef = useRef<HTMLCanvasElement>(null);
    const containerBRef = useRef<HTMLDivElement>(null);

    // ── Engine state ────────────────────────────────────────────
    const playerRef = useRef<LyricDancePlayer | null>(null);
    const snapshotRef = useRef<HTMLCanvasElement | null>(null);
    const activeSideRef = useRef<"a" | "b">("a");
    const destroyedRef = useRef(false);
    const roRef = useRef<ResizeObserver | null>(null);

    // ── Stable callback refs (never trigger re-fetches) ─────────
    const onEngineReadyRef = useRef(onEngineReady);
    onEngineReadyRef.current = onEngineReady;
    const onHookEndRef = useRef(onHookEnd);
    onHookEndRef.current = onHookEnd;

    useImperativeHandle(
      ref,
      () => ({
        getPlayer: () => playerRef.current,
      }),
      [],
    );

    // ═══════════════════════════════════════════════════════════
    // EFFECT 1: Accept prefetched data from BattleEmbed
    // No per-card Supabase queries — BattleEmbed handles all fetching.
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
      setHookA(prefetchedHookA ?? null);
      setHookB(prefetchedHookB ?? null);
      setDanceData(prefetchedDanceData ?? null);
      setLoading(!prefetchedHookA || !prefetchedDanceData);
      setReady(false);
      hookEndFiredA.current = false;
      hookEndFiredB.current = false;
      if (prefetchedDanceData) {
        const urls =
          (prefetchedDanceData.section_images as string[] | undefined)?.filter(
            Boolean,
          ) ?? [];
        urls.forEach((u) => preloadImage(u));
      }
    }, [prefetchedHookA?.id, prefetchedHookB?.id, prefetchedDanceData?.id]);

    // ═══════════════════════════════════════════════════════════
    // EFFECT 2: Init engine once (when data + canvas are ready)
    // ═══════════════════════════════════════════════════════════
    const dataReady = !!(
      danceData &&
      danceData.cinematic_direction &&
      !Array.isArray(danceData.cinematic_direction)
    );

    useEffect(() => {
      if (!dataReady || !hookA) return;
      if (playerRef.current) return;
      destroyedRef.current = false;

      const bgCanvas = canvasARef.current;
      const textCanvas = textCanvasARef.current;
      const container = containerARef.current;
      if (!bgCanvas || !textCanvas || !container) return;

      let cancelled = false;

      withInitLimit(async () => {
        if (cancelled || destroyedRef.current) return;

        const dataWithRegion: LyricDanceData = {
          ...danceData!,
          region_start: hookA.hook_start,
          region_end: hookA.hook_end,
        };

        const p = new LyricDancePlayer(
          dataWithRegion,
          bgCanvas,
          textCanvas,
          container,
          { bootMode: "minimal" },
        );

        if (cancelled || destroyedRef.current) {
          p.destroy();
          return;
        }

        playerRef.current = p;
        activeSideRef.current = "a";

        // ResizeObserver — same pattern as useLyricDancePlayer
        roRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) p.resize(width, height);
        });
        roRef.current.observe(container);

        // Force correct viewport dimensions before init
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
          p.resize(rect.width, rect.height);

        await p.init();
        if (cancelled || destroyedRef.current) {
          p.destroy();
          playerRef.current = null;
          roRef.current?.disconnect();
          return;
        }

        // Start muted — Effect 3 will decide what to do next
        p.audio.muted = true;
        p.play();
        p.scheduleFullModeUpgrade();
        setReady(true);
        onEngineReadyRef.current?.();
      }).catch((err) => console.error("[InlineBattle] init failed:", err));

      return () => {
        cancelled = true;
      };
    }, [dataReady, danceData?.id, hookA?.id]);

    // ═══════════════════════════════════════════════════════════
    // EFFECT 3: Unified player control
    // ONE effect, reads ALL inputs, makes ONE decision.
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
      const player = playerRef.current;
      if (!player || !ready || !hookA) return;

      // ── Rule 1: Cold (out of render window) → stop rendering ──
      if (cardState === "cold") {
        player.stopRendering?.();
        player.setMuted(true);
        return;
      }

      // ── Rule 2: Warm (in viewport, not active) → render muted behind cover ──
      if (cardState === "warm") {
        player.play();
        player.setMuted(true);
        return;
      }

      // ── Rule 3: No active side (cover, vote, results unfocused) → render muted ──
      if (!activePlaying) {
        player.play();
        player.setMuted(true);
        return;
      }

      // ── Rule 4: Active side matches current canvas → just play ──
      const targetSide = activePlaying;
      const currentSide = activeSideRef.current;
      const hook = targetSide === "a" ? hookA : hookB;
      if (!hook) return;

      if (targetSide === currentSide) {
        player.play();
        player.setMuted(!!forceMuted);
        player.scheduleFullModeUpgrade();
        return;
      }

      // ── Rule 5: Switching sides → snapshot + swap canvas + recompile ──
      snapshotRef.current = player.captureSnapshot();

      const bgCanvas =
        targetSide === "a" ? canvasARef.current : canvasBRef.current;
      const textCanvas =
        targetSide === "a" ? textCanvasARef.current : textCanvasBRef.current;
      const container =
        targetSide === "a" ? containerARef.current : containerBRef.current;
      if (!bgCanvas || !textCanvas || !container) return;

      // Draw snapshot onto old side's canvas (freeze it)
      const oldCanvas =
        currentSide === "a" ? canvasARef.current : canvasBRef.current;
      if (oldCanvas && snapshotRef.current) {
        const ctx = oldCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, oldCanvas.width, oldCanvas.height);
          ctx.drawImage(snapshotRef.current, 0, 0);
        }
      }

      player.setRenderTarget(bgCanvas, textCanvas, container);
      player.setRegion(hook.hook_start, hook.hook_end);
      activeSideRef.current = targetSide;

      player.play();
      player.setMuted(!!forceMuted);
      player.scheduleFullModeUpgrade();
    }, [activePlaying, forceMuted, ready, hookA, hookB, cardState]);

    // ═══════════════════════════════════════════════════════════
    // EFFECT 4: Hook-end timers (simple, independent)
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
      if (!hookA || activePlaying !== "a" || hookEndFiredA.current) return;
      const duration = (hookA.hook_end - hookA.hook_start) * 1000 + 500;
      const timer = setTimeout(() => {
        hookEndFiredA.current = true;
        onHookEndRef.current?.("a");
      }, duration);
      return () => clearTimeout(timer);
    }, [activePlaying, hookA]);

    useEffect(() => {
      if (!hookB || activePlaying !== "b" || hookEndFiredB.current) return;
      const duration = (hookB.hook_end - hookB.hook_start) * 1000 + 500;
      const timer = setTimeout(() => {
        hookEndFiredB.current = true;
        onHookEndRef.current?.("b");
      }, duration);
      return () => clearTimeout(timer);
    }, [activePlaying, hookB]);

    // ═══════════════════════════════════════════════════════════
    // Cleanup: destroy engine on unmount
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
      return () => {
        destroyedRef.current = true;
        roRef.current?.disconnect();
        playerRef.current?.destroy();
        playerRef.current = null;
        snapshotRef.current = null;
      };
    }, []);

    // ── Opacity ─────────────────────────────────────────────────
    const getOpacity = useCallback(
      (side: "a" | "b") => {
        switch (mode) {
          case "dark":
            return 0.2;
          case "listen-a":
            return side === "a" ? 1 : 0.25;
          case "listen-b":
            return side === "b" ? 1 : 0.25;
          case "judgment":
            return 0.2;
          case "scorecard":
          case "results":
            if (!activePlaying) return 1;
            // Non-playing side stays clearly visible — dimmed, not dead.
            // 0.55 keeps the background art visible while the playing side is prominent.
            return side === activePlaying ? 1 : 0.55;
          default:
            return 1;
        }
      },
      [mode, activePlaying],
    );

    // ── Loading states ──────────────────────────────────────────
    if (loading || !hookA || !danceData) {
      if (!loading && hookA && !danceData) {
        return (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs font-mono">
            No lyric dance found
          </div>
        );
      }
      return <div className="w-full h-full" style={{ background: "#0a0a0a" }} />;
    }

    const isResultsMode = mode === "scorecard" || mode === "results";

    return (
      <div className="w-full h-full">
        <div className="relative flex flex-row h-full">
          {/* Hook A */}
          <motion.div
            className="relative flex-1 overflow-hidden cursor-pointer"
            animate={{ opacity: getOpacity("a") }}
            transition={{ duration: 0.4 }}
            onClick={() => onTileTap?.("a")}
          >
            <AnimatePresence>
              {isResultsMode && votedSide === "a" ? (
                <motion.div
                  key="voted-a-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-2 left-2 z-20 pointer-events-none"
                >
                  <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-green-400/70 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6.5L4.5 9L10 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Your Pick
                  </span>
                </motion.div>
              ) : activePlaying === "a" && !isResultsMode ? (
                <motion.div
                  key="round-a-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-2 left-2 z-20 pointer-events-none"
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                    Round 1
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div ref={containerARef} className="absolute inset-0">
              <canvas
                ref={canvasARef}
                className="absolute inset-0 w-full h-full"
              />
              <canvas
                ref={textCanvasARef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </div>
          </motion.div>

          {/* Hook B */}
          {hookB ? (
            <motion.div
              className="relative flex-1 overflow-hidden cursor-pointer"
              animate={{ opacity: getOpacity("b") }}
              transition={{ duration: 0.4 }}
              onClick={() => onTileTap?.("b")}
            >
              <AnimatePresence>
                {isResultsMode && votedSide === "b" ? (
                  <motion.div
                    key="voted-b-label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-2 left-2 z-20 pointer-events-none"
                  >
                    <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-green-400/70 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6.5L4.5 9L10 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Your Pick
                    </span>
                  </motion.div>
                ) : activePlaying === "b" && !isResultsMode ? (
                  <motion.div
                    key="round-b-label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-2 left-2 z-20 pointer-events-none"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                      Round 2
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div ref={containerBRef} className="absolute inset-0">
                <canvas
                  ref={canvasBRef}
                  className="absolute inset-0 w-full h-full"
                />
                <canvas
                  ref={textCanvasBRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>
            </motion.div>
          ) : (
            <div className="relative flex-1 overflow-hidden bg-black/50" />
          )}
        </div>
      </div>
    );
  },
);
