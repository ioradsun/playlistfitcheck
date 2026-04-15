/**
 * useLyricDancePlayer — canonical player lifecycle hook.
 *
 * Architecture: PERSIST-PLAYER (v3)
 *
 * The player instance survives eviction. Only canvas/audio pool slots
 * are acquired and released as the card scrolls in/out of the viewport.
 *
 * Three effects, strict separation:
 *   Effect 0 (unmount):    Destroys warm players. Empty deps. Runs ONCE on unmount.
 *   Effect 1 (COLD→WARM):  Creates player + init. Cleanup destroys PARTIAL players
 *                           (failed/in-progress init). Warm players are untouched.
 *   Effect 2 (WARM↔HOT):   Manages canvas/audio pool slots. Never creates/destroys player.
 *
 * Ownership invariants:
 *   - Player identity is tracked by playerDataIdRef. If data.id changes, the
 *     warm player is destroyed and a new one is created (not hot-patched).
 *   - A card is only HOT (playerReady=true) when it owns BOTH canvas AND audio slots.
 *     If audio reacquisition fails, the card stays WARM.
 *   - On audio release, p.audio is replaced with an inert element so no player
 *     method can accidentally operate on a released pool resource.
 *   - seekListenerRef is cleaned up in ALL release paths: eviction, context-loss, unmount.
 */

import { useEffect, useRef, useState } from "react";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withInitLimit, withPriorityInitLimit } from "@/engine/initQueue";
import { acquireCanvasSlot, releaseCanvasSlot } from "@/engine/canvasPool";
import { acquireAudio, evictLeastImportant, releaseAudio } from "@/lib/audioPool";

interface Options {
  bootMode?: "minimal" | "full";
  eagerUpgrade?: boolean;
  onReady?: (player: LyricDancePlayer) => void;
  preloadedImages?: HTMLImageElement[];
  usePool?: boolean;
  postId?: string;
  evicted?: boolean;
  priority?: boolean;
}

export interface UseLyricDancePlayerReturn {
  player: LyricDancePlayer | null;
  playerReady: boolean;
  data: LyricDanceData | null;
  setData: React.Dispatch<React.SetStateAction<LyricDanceData | null>>;
  playerRef: React.MutableRefObject<LyricDancePlayer | null>;
  lastFrameUrl: string | null;
}

// ── Shared slot release helper ──────────────────────────────────────────────
// Used by eviction (Effect 2), context-loss, and unmount (Effect 0).
// Single path prevents DOM/pool desync.
function releaseSlots(
  postId: string | undefined,
  slotRef: React.MutableRefObject<ReturnType<typeof acquireCanvasSlot> | null>,
  containerRef: React.RefObject<HTMLDivElement>,
  usePool: boolean,
) {
  if (slotRef.current && postId) {
    const bg = slotRef.current.bg;
    const text = slotRef.current.text;
    if (bg) bg.style.opacity = "0";
    const container = containerRef.current;
    if (container) {
      if (bg && container.contains(bg)) container.removeChild(bg);
      if (text && container.contains(text)) container.removeChild(text);
    }
    releaseCanvasSlot(postId);
    slotRef.current = null;
  }
  if (usePool && postId) releaseAudio(postId);
}

// ── Shared listener + audio detach helper ───────────────────────────────────
// Cleans hook-level seek listener, then calls the engine's own detachAudio()
// to remove engine-owned listeners (canplay handlers), then replaces p.audio
// with a fresh inert element so no stale method can touch a released pool resource.
function detachAudio(
  p: LyricDancePlayer | null,
  seekListenerRef: React.MutableRefObject<(() => void) | null>,
) {
  if (seekListenerRef.current && p) {
    p.audio?.removeEventListener("loadedmetadata", seekListenerRef.current);
    seekListenerRef.current = null;
  }
  if (p) {
    p.detachAudio(); // Engine cleans _pendingCanPlayHandler from the current element
    p.audio = new Audio();
  }
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
    priority = !evicted,
  } = options;

  const [data, setData] = useState<LyricDanceData | null>(initialData);
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);

  const playerRef = useRef<LyricDancePlayer | null>(null);
  const onReadyRef = useRef(onReady);
  const savedTimeRef = useRef<number>(0);
  const warmRef = useRef(false);
  const playerDataIdRef = useRef<string | null>(null);
  const slotRef = useRef<ReturnType<typeof acquireCanvasSlot> | null>(null);
  const seekListenerRef = useRef<(() => void) | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  onReadyRef.current = onReady;

  // ── Stable refs for values needed in unmount cleanup ────────────────────
  const postIdRef = useRef(postId);
  const usePoolRef = useRef(usePool);
  postIdRef.current = postId;
  usePoolRef.current = usePool;

  // ── Full teardown helper (used by identity change + unmount) ────────────
  function teardownPlayer() {
    detachAudio(playerRef.current, seekListenerRef);
    releaseSlots(postIdRef.current, slotRef, containerRef, usePoolRef.current);
    playerRef.current?.destroy();
    playerRef.current = null;
    warmRef.current = false;
    playerDataIdRef.current = null;
    setPlayer(null);
    setPlayerReady(false);
    setLastFrameUrl(null);
  }

  // ── Keep local data in sync + identity change detection ────────────────
  useEffect(() => {
    if (initialData) {
      const incomingId = (initialData as any)?.id ?? null;
      // Identity changed while warm — full teardown, not hot-patch
      if (warmRef.current && playerDataIdRef.current && playerDataIdRef.current !== incomingId) {
        teardownPlayer();
      }
      setData(initialData);
      return;
    }
    setData(null);
    if (playerRef.current) teardownPlayer();
  }, [initialData]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataReady = !!(data?.cinematic_direction);

  // ── Listen for freed pool slots ────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (!evicted && dataReady && (!warmRef.current || !slotRef.current)) {
        setRetryTick((t) => t + 1);
      }
    };
    window.addEventListener("crowdfit:pool-slot-freed", handler);
    return () => window.removeEventListener("crowdfit:pool-slot-freed", handler);
  }, [evicted, dataReady]);

  // ── Context lost — detach audio, use shared release path, retry ────────
  useEffect(() => {
    if (!postId) return;
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.postId !== postId) return;
      const p = playerRef.current;
      if (p) {
        savedTimeRef.current = p.audio?.currentTime ?? 0;
        p.pause();
      }
      // Snapshot synchronously before releasing
      const bg = slotRef.current?.bg;
      if (bg && bg.width > 0 && bg.height > 0) {
        try {
          const url = bg.toDataURL("image/jpeg", 0.65);
          setLastFrameUrl(url);
        } catch { /* tainted */ }
      }
      detachAudio(p, seekListenerRef);
      releaseSlots(postId, slotRef, containerRef, usePool);
      setPlayerReady(false);
      setRetryTick((t) => t + 1);
    };
    window.addEventListener("crowdfit:context-lost", handler);
    return () => window.removeEventListener("crowdfit:context-lost", handler);
  }, [postId, usePool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EFFECT 0: Unmount cleanup ─────────────────────────────────────────
  useEffect(() => {
    return () => { teardownPlayer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EFFECT 1: Player creation (COLD → WARM) ──────────────────────────
  useEffect(() => {
    if (warmRef.current || !dataReady || evicted) return;

    let slot: ReturnType<typeof acquireCanvasSlot> | null = null;
    let bgCanvas: HTMLCanvasElement | null = null;
    let textCanvas: HTMLCanvasElement | null = null;
    let pooledAudio: HTMLAudioElement | null = null;

    if (usePool && postId) {
      slot = acquireCanvasSlot(postId);
      if (!slot) return;
      bgCanvas = slot.bg;
      textCanvas = slot.text;
      slotRef.current = slot;
      if (containerRef.current) {
        if (!containerRef.current.contains(bgCanvas)) containerRef.current.appendChild(bgCanvas);
        if (!containerRef.current.contains(textCanvas)) containerRef.current.appendChild(textCanvas);
        bgCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
        bgCanvas.style.zIndex = "1";
        textCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
        textCanvas.style.zIndex = "2";
      }
    } else {
      bgCanvas = canvasRef.current;
      textCanvas = textCanvasRef.current;
    }

    if (!bgCanvas || !textCanvas || !containerRef.current) {
      if (slot && postId) { releaseCanvasSlot(postId); slotRef.current = null; }
      return;
    }

    if (usePool && postId && data?.audio_url) {
      pooledAudio = acquireAudio(postId, data.audio_url);
      if (!pooledAudio) {
        evictLeastImportant(postId);
        pooledAudio = acquireAudio(postId, data.audio_url);
      }
      if (!pooledAudio) {
        if (slot) { releaseCanvasSlot(postId); slotRef.current = null; }
        return;
      }
    }

    let destroyed = false;
    let ro: ResizeObserver | null = null;
    let localPlayer: LyricDancePlayer | null = null;

    const initFn = priority ? withPriorityInitLimit : withInitLimit;
    initFn(async () => {
      if (destroyed) return;
      const p = new LyricDancePlayer(data!, bgCanvas!, textCanvas!, containerRef.current as HTMLDivElement, {
        bootMode,
        preloadedImages,
        externalAudio: pooledAudio ?? undefined,
      });
      localPlayer = p;
      playerRef.current = p;
      (window as any).__ldp = p;

      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) p.resize(width, height);
      });
      ro.observe(containerRef.current!);

      const rect = containerRef.current!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) p.resize(rect.width, rect.height);

      await p.init();
      if (destroyed) return;

      if (bgCanvas) bgCanvas.style.opacity = "1";
      setLastFrameUrl(null);
      if (p.audio && p.audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        p.audio.preload = "metadata";
        p.audio.load();
      }
      if (eagerUpgrade && bootMode === "minimal") {
        p.scheduleFullModeUpgrade();
      }
      p.audio.muted = true;
      warmRef.current = true;
      playerDataIdRef.current = (data as any)?.id ?? null;
      setPlayer(p);
      setPlayerReady(true);
      onReadyRef.current?.(p);
    }).catch((err) => console.error("[useLyricDancePlayer] init failed:", err));

    return () => {
      destroyed = true;
      ro?.disconnect();
      // Only tear down PARTIAL init state. Warm player survives.
      if (warmRef.current) return;

      // Player was constructed but never reached warm (init in progress or failed).
      // Destroy the specific instance this effect created — not playerRef.current,
      // which could point to a different player under async churn.
      if (localPlayer) {
        localPlayer.destroy();
        if (playerRef.current === localPlayer) playerRef.current = null;
        localPlayer = null;
      }

      if (slot && postId) {
        if (bgCanvas) bgCanvas.style.opacity = "0";
        const container = containerRef.current;
        if (container) {
          if (container.contains(bgCanvas!)) container.removeChild(bgCanvas!);
          if (container.contains(textCanvas!)) container.removeChild(textCanvas!);
        }
        releaseCanvasSlot(postId);
      }
      if (usePool && postId) releaseAudio(postId);
      slotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, data?.id, usePool, postId, evicted, retryTick]);

  // ── EFFECT 2: Slot management (WARM ↔ HOT) ───────────────────────────
  useEffect(() => {
    if (!warmRef.current || !playerRef.current || !usePool || !postId) return;
    const p = playerRef.current;

    if (evicted) {
      // ── HOT → WARM ─────────────────────────────────────────────────
      savedTimeRef.current = p.audio?.currentTime ?? 0;
      p.pause();

      // Snapshot canvas synchronously before releasing.
      // toDataURL is sync — the URL is available in the same tick as releaseSlots,
      // so React never renders a frame without a poster. toBlob was async and caused
      // a 1-3 frame black flash between canvas removal and blob delivery.
      const bg = slotRef.current?.bg;
      if (bg && bg.width > 0 && bg.height > 0) {
        try {
          const url = bg.toDataURL("image/jpeg", 0.65);
          setLastFrameUrl(url);
        } catch { /* tainted canvas */ }
      }

      detachAudio(p, seekListenerRef);
      releaseSlots(postId, slotRef, containerRef, usePool);
      setPlayerReady(false);
      return;
    }

    // ── WARM → HOT ───────────────────────────────────────────────────
    if (slotRef.current) return; // Already HOT

    const slot = acquireCanvasSlot(postId);
    if (!slot) return; // Pool exhausted — retry via crowdfit:pool-slot-freed

    // Acquire audio BEFORE committing canvas — card is only HOT with both
    let pooledAudio: HTMLAudioElement | null = null;
    if (data?.audio_url) {
      pooledAudio = acquireAudio(postId, data.audio_url);
      if (!pooledAudio) {
        evictLeastImportant(postId);
        pooledAudio = acquireAudio(postId, data.audio_url);
      }
    }
    if (!pooledAudio && data?.audio_url) {
      // Audio required but unavailable — release canvas, stay WARM
      releaseCanvasSlot(postId);
      return;
    }

    slotRef.current = slot;
    const container = containerRef.current;
    if (container) {
      if (!container.contains(slot.bg)) container.appendChild(slot.bg);
      if (!container.contains(slot.text)) container.appendChild(slot.text);
      slot.bg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
      slot.bg.style.zIndex = "1";
      slot.text.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
      slot.text.style.zIndex = "2";
    }

    // Swap render target — preserves compiled scene
    p.setRenderTarget(slot.bg, slot.text, container ?? undefined);

    // Swap audio — detach engine listeners from old element, then attach new
    if (pooledAudio) {
      if (seekListenerRef.current) {
        p.audio?.removeEventListener("loadedmetadata", seekListenerRef.current);
        seekListenerRef.current = null;
      }
      p.detachAudio(); // Clean engine-owned listeners before swap
      p.audio = pooledAudio;
      p.audio.muted = true;
      p.audio.preload = "auto";
      p.audio.load();
      if (savedTimeRef.current > 0) {
        const savedTime = savedTimeRef.current;
        if (p.audio.readyState >= 1) {
          p.audio.currentTime = savedTime;
        } else {
          const onMeta = () => {
            pooledAudio!.removeEventListener("loadedmetadata", onMeta);
            if (seekListenerRef.current === onMeta) seekListenerRef.current = null;
            pooledAudio!.currentTime = savedTime;
          };
          seekListenerRef.current = onMeta;
          pooledAudio.addEventListener("loadedmetadata", onMeta);
        }
      }
    }

    // Show canvas, clear snapshot
    slot.bg.style.opacity = "1";
    setLastFrameUrl(null);

    if (!p.isFullModeEnabled) {
      p.scheduleFullModeUpgrade();
    }
    p.primeAudio();
    setPlayerReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evicted, usePool, postId, data?.audio_url, retryTick]);

  // ── Hot-patch player when data changes ────────────────────────────────
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (data?.section_images?.length) p.updateSectionImages(data.section_images);
    if (data?.scene_context) p.updateSceneContext(data.scene_context);
    if (data?.cinematic_direction) p.updateCinematicDirection(data.cinematic_direction as any);
  }, [data?.section_images, data?.scene_context, data?.cinematic_direction]);

  return { player, playerReady, data, setData, playerRef, lastFrameUrl };
}
