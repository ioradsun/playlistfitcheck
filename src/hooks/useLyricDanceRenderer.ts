import { useEffect, useRef, type RefObject } from "react";
import LyricDanceRendererWorker from "@/workers/lyricDanceRenderer.worker?worker";
import type { ScenePayload } from "@/lib/lyricSceneBaker";

type WorkerMessage =
  | { type: "BAKING"; progress: number };

export function useLyricDanceRenderer({
  canvasRef,
  payload,
  currentTime,
  isPlaying,
  onBakingProgress,
}: {
  canvasRef: RefObject<HTMLCanvasElement>;
  payload: ScenePayload | null;
  currentTime: number;
  isPlaying: boolean;
  onBakingProgress?: (progress: number) => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const initializedRef = useRef(false);
  const transferredRef = useRef(false);

  useEffect(() => {
    if (!payload || !canvasRef.current || workerRef.current) return;
    if (transferredRef.current) return;

    const canvas = canvasRef.current;
    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
      transferredRef.current = true;
    } catch {
      // Canvas was already transferred (e.g. strict mode double-fire)
      return;
    }

    const worker = new LyricDanceRendererWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data?.type === "BAKING") {
        onBakingProgress?.(event.data.progress);
      }
    };

    worker.postMessage(
      {
        type: "INIT",
        payload: {
          ...payload,
          width: canvas.clientWidth || 1920,
          height: canvas.clientHeight || 1080,
          canvas: offscreen,
        },
      },
      [offscreen],
    );

    initializedRef.current = true;

    return () => {
      worker.postMessage({ type: "DESTROY" });
      worker.terminate();
      workerRef.current = null;
      initializedRef.current = false;
    };
  }, [canvasRef, payload, onBakingProgress]);

  useEffect(() => {
    if (!initializedRef.current || !workerRef.current) return;
    workerRef.current.postMessage({ type: "SEEK", currentTime });
  }, [currentTime]);

  useEffect(() => {
    if (!initializedRef.current || !workerRef.current) return;
    workerRef.current.postMessage({ type: isPlaying ? "PLAY" : "PAUSE" });
  }, [isPlaying]);
}
