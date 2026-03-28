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

interface Options {
  bootMode?: "minimal" | "full";
  /** Start full-mode compilation immediately after minimal boot (shareable pages). */
  eagerUpgrade?: boolean;
  onReady?: (player: LyricDancePlayer) => void;
  preloadedImages?: HTMLImageElement[];
}

export interface UseLyricDancePlayerReturn {
  player: LyricDancePlayer | null;
  playerReady: boolean;
  /** Local copy of data — reflects hot-patched auto_palettes etc. */
  data: LyricDanceData | null;
  setData: React.Dispatch<React.SetStateAction<LyricDanceData | null>>;
}

export function useLyricDancePlayer(
  initialData: LyricDanceData | null,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  textCanvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  options: Options = {},
): UseLyricDancePlayerReturn {
  const { bootMode = "minimal", eagerUpgrade = false, onReady, preloadedImages } = options;

  const [data, setData] = useState<LyricDanceData | null>(initialData);
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<LyricDancePlayer | null>(null);
  const initRef = useRef(false);
  const onReadyRef = useRef(onReady);
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
    if (initRef.current || !dataReady) return;
    if (!canvasRef.current || !textCanvasRef.current || !containerRef.current) return;

    initRef.current = true;
    let destroyed = false;
    let ro: ResizeObserver | null = null;

    withInitLimit(async () => {
      if (destroyed) return;
      const p = new LyricDancePlayer(
        data!,
        canvasRef.current!,
        textCanvasRef.current!,
        containerRef.current as HTMLDivElement,
        { bootMode, preloadedImages },
      );
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
      playerRef.current?.destroy();
      playerRef.current = null;
      initRef.current = false;
      setPlayer(null);
      setPlayerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, data?.id]);

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

  return { player, playerReady, data, setData };
}
