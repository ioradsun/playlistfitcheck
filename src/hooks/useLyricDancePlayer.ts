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
import { computeAutoPalettesFromUrls } from "@/lib/autoPalette";

interface Options {
  bootMode?: "minimal" | "full";
  onReady?: (player: LyricDancePlayer) => void;
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
  const { bootMode = "minimal", onReady } = options;

  const [data, setData] = useState<LyricDanceData | null>(initialData);
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<LyricDancePlayer | null>(null);
  const initRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Keep local data in sync when parent passes new initialData
  useEffect(() => {
    if (initialData) setData(initialData);
  }, [initialData]);

  // ── Init / destroy ────────────────────────────────────────────────────
  const dataReady = !!(data && data.words?.length && data.cinematic_direction);

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
        { bootMode },
      );
      playerRef.current = p;
      setPlayer(p);

      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) p.resize(width, height);
      });
      ro.observe(containerRef.current!);

      await p.init();
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

  // ── Auto-palette: compute from section images, write to DB ───────────
  useEffect(() => {
    if (!data?.id) return;

    // Skip if palettes already exist and are not stale
    if (Array.isArray(data.auto_palettes) && data.auto_palettes.length > 0) {
      const textColor = data.auto_palettes[0]?.[2] ?? "#ffffff";
      const isStale = /^#f[0-9a-f]{5}$/i.test(textColor) || textColor === "#ffffff";
      if (!isStale) return;
    }

    const urls = (data.section_images ?? []).filter((u): u is string => Boolean(u));
    if (urls.length === 0) return;

    let cancelled = false;
    computeAutoPalettesFromUrls(urls)
      .then((palettes) => {
        if (cancelled || palettes.length === 0) return;
        setData((prev) => (prev ? { ...prev, auto_palettes: palettes } : prev));
        playerRef.current?.updateAutoPalettes(palettes);
        supabase
          .from("shareable_lyric_dances" as any)
          .update({ auto_palettes: palettes, updated_at: new Date().toISOString() } as any)
          .eq("id", data.id)
          .then(({ error }) => {
            if (error) console.warn("[auto-palette] DB write failed:", error.message);
          });
      })
      .catch((err) => console.error("[auto-palette] failed:", err));

    return () => { cancelled = true; };
  }, [data?.id, data?.section_images, data?.auto_palettes]);

  // ── Scene context hot-patch ───────────────────────────────────────────
  useEffect(() => {
    if (!playerRef.current || !data?.scene_context) return;
    playerRef.current.updateSceneContext(data.scene_context);
  }, [data?.scene_context]);

  return { player, playerReady, data, setData };
}
