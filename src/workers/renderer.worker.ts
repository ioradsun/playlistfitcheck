/**
 * renderer.worker.ts — OffscreenCanvas render worker.
 *
 * STATUS: SCAFFOLDING — Message protocol is defined but renderFrame
 * is currently a stub. Once renderFrame.ts is fully populated with
 * the extracted render loop, this worker will drive it.
 *
 * Protocol:
 *   Main → Worker:
 *     INIT   { canvas, width, height, cinematicDirection, lines, beatGrid, songDna, totalDuration }
 *     FRAME  { currentTime, beatIntensity }
 *     RESIZE { width, height }
 *
 *   Worker → Main:
 *     ERROR  { message }
 *     READY  {}
 */

/* eslint-disable no-restricted-globals */

import type { CinematicDirection } from "@/types/CinematicDirection";

interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag?: "main" | "adlib";
}

type InitMessage = {
  type: "INIT";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  cinematicDirection: CinematicDirection | null;
  lines: LyricLine[];
  beatGrid: any;
  songDna: any;
  totalDuration: number;
};

type FrameMessage = {
  type: "FRAME";
  currentTime: number;
  beatIntensity: number;
};

type ResizeMessage = {
  type: "RESIZE";
  width: number;
  height: number;
};

type Incoming = InitMessage | FrameMessage | ResizeMessage;

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;
let state: {
  width: number;
  height: number;
  currentTime: number;
  beatIntensity: number;
  cinematicDirection: CinematicDirection | null;
  lines: LyricLine[];
  beatGrid: any;
  songDna: any;
  totalDuration: number;
  precomputed: ReturnType<typeof precomputeAll>;
} | null = null;

const raf =
  (self as any).requestAnimationFrame?.bind(self) ??
  ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 1000 / 60) as unknown as number);

function startLoop() {
  const loop = () => {
    if (!ctx || !state || !canvas) return;

    // STUB: When renderFrame.ts is fully extracted, call it here:
    // renderFrame(ctx, ctx, ctx, fullState);

    // For now, just clear to show the worker is alive
    ctx.clearRect(0, 0, state.width, state.height);

    raf(loop);
  };
  raf(loop);
}

self.onmessage = (e: MessageEvent<Incoming>) => {
  const msg = e.data;

  if (msg.type === "INIT") {
    canvas = msg.canvas;
    ctx = msg.canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });

    if (!ctx) {
      (self as any).postMessage({
        type: "ERROR",
        message: "Failed to get 2D context from OffscreenCanvas",
      });
      return;
    }

    state = {
      width: msg.width,
      height: msg.height,
      currentTime: 0,
      beatIntensity: 0,
      cinematicDirection: msg.cinematicDirection,
      lines: msg.lines,
      beatGrid: msg.beatGrid,
      songDna: msg.songDna,
      totalDuration: msg.totalDuration,
      precomputed: precomputeAll({
        cinematicDirection: msg.cinematicDirection,
        lines: msg.lines,
        totalDuration: msg.totalDuration,
      }),
    };

    msg.canvas.width = msg.width;
    msg.canvas.height = msg.height;

    (self as any).postMessage({ type: "READY" });
    startLoop();
    return;
  }

  if (!state) return;

  if (msg.type === "FRAME") {
    state.currentTime = msg.currentTime;
    state.beatIntensity = msg.beatIntensity;
    return;
  }

  if (msg.type === "RESIZE") {
    state.width = msg.width;
    state.height = msg.height;
    if (canvas) {
      canvas.width = msg.width;
      canvas.height = msg.height;
    }
  }
};

function precomputeAll(input: {
  cinematicDirection: CinematicDirection | null;
  lines: LyricLine[];
  totalDuration: number;
}) {
  const { cinematicDirection, lines, totalDuration } = input;
  const chapters = cinematicDirection?.chapters ?? [];
  const tensionCurve = cinematicDirection?.tensionCurve ?? [];

  return {
    chapterBoundaries: chapters.map((c: any) => ({
      ...c,
      startMs: c.startRatio * totalDuration,
      endMs: c.endRatio * totalDuration,
    })),
    tensionBoundaries: tensionCurve.map((t: any) => ({
      ...t,
      startMs: t.startRatio * totalDuration,
      endMs: t.endRatio * totalDuration,
    })),
    wordDirectiveMap: Object.fromEntries(
      Object.entries(cinematicDirection?.wordDirectives ?? {}).map(([k, v]) => [
        k.toLowerCase().replace(/[^a-z]/g, ""),
        v,
      ]),
    ),
    lineChapterIndices: lines.map((line: any) => {
      const progress = line.start / totalDuration;
      return chapters.findIndex(
        (c: any) => progress >= c.startRatio && progress <= c.endRatio,
      );
    }),
  };
}

export function getCurrentChapter(
  boundaries: any[],
  currentTimeMs: number,
) {
  let lo = 0;
  let hi = boundaries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (currentTimeMs < boundaries[mid].startMs) hi = mid - 1;
    else if (currentTimeMs > boundaries[mid].endMs) lo = mid + 1;
    else return boundaries[mid];
  }
  return boundaries[Math.max(0, boundaries.length - 1)];
}
