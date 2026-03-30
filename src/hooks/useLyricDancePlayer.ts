/**
 * useLyricDancePlayer — canonical player lifecycle hook.
 *
 * Owns: instantiation, init, destroy, ResizeObserver, section-image
 * hot-patch, auto-palette computation + DB write, scene-context hot-patch.
 *
 * Used by InlineLyricDance and ShareableLyricDance — neither instantiates
 * LyricDancePlayer directly anymore.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withInitLimit } from "@/engine/initQueue";
import { acquireCanvasSlot, releaseCanvasSlot } from "@/engine/canvasPool";

interface Options {
  bootMode?: "minimal" | "full";
  /** Start full-mode compilation immediately after minimal boot (shareable pages). */
  eagerUpgrade?: boolean;
  onReady?: (player: LyricDancePlayer) => void;
  preloadedImages?: HTMLImageElement[];
  /** If true, use the global canvas pool instead of the DOM canvases.
   *  The caller's canvasRef/textCanvasRef are ignored when pooled. */
  usePool?: boolean;
  /** The postId used to track pool slot ownership. */
  postId?: string;
  /** Whether the host card has been evicted from active feed windowing. */
  evicted?: boolean;
}

export interface UseLyricDancePlayerReturn {
  player: LyricDancePlayer | null;
  playerReady: boolean;
  /** Local copy of data — reflects hot-patched auto_palettes etc. */
  data: LyricDanceData | null;
  setData: React.Dispatch<React.SetStateAction<LyricDanceData | null>>;
  playerRef: React.MutableRefObject<LyricDancePlayer | null>;
}

export function useLyricDancePlayer(
  initialData: LyricDanceData | null,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  textCanvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  options: Options = {},
): UseLyricDancePlayerReturn {
  const {
    bootMode = "minimal",
    eagerUpgrade = false,
    onReady,
    preloadedImages,
    usePool = false,
    postId,
    evicted = false,
  } = options;

  const [data, setData] = useState<LyricDanceData | null>(initialData);
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<LyricDancePlayer | null>(null);
  const initRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const slotRef = useRef<ReturnType<typeof acquireCanvasSlot> | null>(null);
  // Bumped when a pool slot frees and this card hasn't inited yet — triggers init retry.
  const [retryTick, setRetryTick] = useState(0);
  onReadyRef.current = onReady;

  // Keep local data in sync when parent passes new initialData
  useEffect(() => {
    if (initialData) {
      setData(initialData);
      return;
    }

    setData(null);
    initRef.current = false;
  }, [initialData]);

  // ── Init / destroy ────────────────────────────────────────────────────
  // words are optional — player falls back to line-level timing if absent.
  // Only cinematic_direction is required (drives the entire visual system).
  const dataReady = !!(data?.cinematic_direction);

  useEffect(() => {
    const handler = () => {
      // Only wake this card if it's still waiting (not inited, not evicted, data ready)
      if (!initRef.current && !evicted && dataReady) {
        setRetryTick((t) => t + 1);
      }
    };
    window.addEventListener("crowdfit:pool-slot-freed", handler);
    return () => window.removeEventListener("crowdfit:pool-slot-freed", handler);
  }, [evicted, dataReady]);

  useEffect(() => {
    if (initRef.current || !dataReady) return;
    if (evicted) return;

    let slot: ReturnType<typeof acquireCanvasSlot> | null = null;
    let bgCanvas: HTMLCanvasElement | null = null;
    let textCanvas: HTMLCanvasElement | null = null;

    if (usePool && postId) {
      slot = acquireCanvasSlot(postId);
      if (!slot) {
        // Pool exhausted — defer init until a slot frees up
        // (this card stays in cold state)
        return;
      }
      bgCanvas = slot.bg;
      textCanvas = slot.text;
      slotRef.current = slot;
      if (containerRef.current) {
        if (!containerRef.current.contains(bgCanvas)) {
          containerRef.current.appendChild(bgCanvas);
        }
        if (!containerRef.current.contains(textCanvas)) {
          containerRef.current.appendChild(textCanvas);
        }
      }
    } else {
      bgCanvas = canvasRef.current;
      textCanvas = textCanvasRef.current;
    }

    if (!bgCanvas || !textCanvas || !containerRef.current) {
      if (slot && postId) {
        releaseCanvasSlot(postId);
        slotRef.current = null;
      }
      return;
    }

    initRef.current = true;
    let destroyed = false;
    let ro: ResizeObserver | null = null;

    withInitLimit(async () => {
      if (destroyed) return;
      const p = new LyricDancePlayer(data!, bgCanvas!, textCanvas!, containerRef.current as HTMLDivElement, {
        bootMode,
        preloadedImages,
      });
      playerRef.current = p;
      // DEBUG: expose player for console inspection
      (window as any).__ldp = p;
      setPlayer(p);

      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) p.resize(width, height);
      });
      ro.observe(containerRef.current!);

      // Force correct viewport dimensions before first frame render.
      // On mobile, canvas.offsetWidth may be 0 before CSS layout completes,
      // causing init() to fall back to 960×540 and produce tiny fonts.
      const rect = containerRef.current!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        p.resize(rect.width, rect.height);
      }

      await p.init();
      // Shareable pages: compile scene NOW while user reads the cover.
      // By the time they tap "Listen Now", the scene is fully baked.
      if (eagerUpgrade && bootMode === "minimal") {
        p.scheduleFullModeUpgrade();
      }
      if (!destroyed) {
        p.audio.muted = true;
        p.play();
        setPlayerReady(true);
        onReadyRef.current?.(p);
      }
    }).catch((err) => console.error("[useLyricDancePlayer] init failed:", err));

    return () => {
      destroyed = true;
      ro?.disconnect();
      if (slot && postId) {
        const container = containerRef.current;
        if (container) {
          if (container.contains(bgCanvas!)) container.removeChild(bgCanvas!);
          if (container.contains(textCanvas!)) container.removeChild(textCanvas!);
        }
        releaseCanvasSlot(postId);
      }
      slotRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
      initRef.current = false;
      setPlayer(null);
      setPlayerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, data?.id, usePool, postId, evicted, retryTick]);

  useEffect(() => {
    if (!evicted) return;
    const container = containerRef.current;
    const bgCanvas = slotRef.current?.bg ?? null;
    const textCanvas = slotRef.current?.text ?? null;
    if (container && bgCanvas && container.contains(bgCanvas)) {
      container.removeChild(bgCanvas);
    }
    if (container && textCanvas && container.contains(textCanvas)) {
      container.removeChild(textCanvas);
    }
    if (postId) {
      releaseCanvasSlot(postId);
    }
    slotRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    initRef.current = false;
    setPlayer(null);
    setPlayerReady(false);
  }, [evicted, postId, containerRef]);

  // ── Section images hot-patch ──────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current || !data?.section_images?.length) return;
    playerRef.current.updateSectionImages(data.section_images);
  }, [data?.section_images]);

  // ── Scene context hot-patch ───────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current || !data?.scene_context) return;
    playerRef.current.updateSceneContext(data.scene_context);
  }, [data?.scene_context]);

  // ── Cinematic direction hot-patch (phrases, sections, heroWords) ──────
  useEffect(() => {
    if (!playerRef.current || !data?.cinematic_direction) return;
    playerRef.current.updateCinematicDirection(data.cinematic_direction as any);
  }, [data?.cinematic_direction]);

  return { player, playerReady, data, setData, playerRef };
}
