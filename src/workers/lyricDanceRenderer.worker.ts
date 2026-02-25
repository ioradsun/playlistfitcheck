/// <reference lib="webworker" />

import * as PIXI from "./pixiLite";
import { bakeScene, type BakedTimeline, type ScenePayload } from "@/lib/lyricSceneBaker";

type InitMessage = {
  type: "INIT";
  payload: ScenePayload & { canvas: OffscreenCanvas; width: number; height: number };
};

type SeekMessage = { type: "SEEK"; currentTime: number };
type PlaybackMessage = { type: "PLAY" } | { type: "PAUSE" } | { type: "DESTROY" };
type WorkerInboundMessage = InitMessage | SeekMessage | PlaybackMessage;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let app: PIXI.Application | null = null;
let timeline: BakedTimeline = [];
let lyricContainer: PIXI.Container | null = null;
let particleContainer: PIXI.ParticleContainer | null = null;
let lyricObjects: Record<string, PIXI.Text> = {};
let isPlaying = false;
let songStartMs = 0;
let playheadMs = 0;
let rafHandle = 0;
let lastTick = 0;

const findFrame = (currentTimeMs: number): BakedTimeline[number] | null => {
  if (!timeline.length) return null;
  let low = 0;
  let high = timeline.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timeline[mid].timeMs < currentTimeMs) low = mid + 1;
    else high = mid - 1;
  }
  return timeline[Math.max(0, low - 1)] ?? timeline[0];
};

const tick = (timestamp: number) => {
  if (!app || !lyricContainer) return;

  if (isPlaying) {
    if (!lastTick) lastTick = timestamp;
    playheadMs += timestamp - lastTick;
  }
  lastTick = timestamp;

  const frame = findFrame(playheadMs);
  if (frame) {
    for (const chunk of frame.chunks) {
      const text = lyricObjects[chunk.id];
      if (!text) continue;
      text.position.set(chunk.x, chunk.y);
      text.alpha = chunk.alpha;
      text.scale.set(1, 1);
      text.visible = chunk.visible;
    }

    app.stage.pivot.set(frame.cameraX, frame.cameraY);
  }

  app.renderer.render(app.stage);
  rafHandle = workerScope.requestAnimationFrame(tick);
};

const initWorker = async (payload: InitMessage["payload"]) => {
  const { canvas, width, height, ...scenePayload } = payload;

  app?.destroy();
  app = new PIXI.Application();
  await app.init({ canvas, width, height, backgroundAlpha: 1 });

  const bgCanvas = new OffscreenCanvas(width, height);
  const bgCtx = bgCanvas.getContext("2d");
  if (bgCtx) {
    bgCtx.fillStyle = scenePayload.palette?.[0] ?? "#0a0a0a";
    bgCtx.fillRect(0, 0, width, height);
  }

  const bgTexture = PIXI.Texture.from(bgCanvas);
  const bgSprite = new PIXI.Sprite(bgTexture);
  bgSprite.width = width;
  bgSprite.height = height;
  app.stage.addChild(bgSprite);

  lyricContainer = new PIXI.Container();
  app.stage.addChild(lyricContainer);

  particleContainer = new PIXI.ParticleContainer();
  app.stage.addChild(particleContainer);

  lyricObjects = {};
  const style = new PIXI.TextStyle({
    fontFamily: "Montserrat",
    fontSize: 44,
    fill: scenePayload.palette?.[2] ?? "#ffffff",
  });

  scenePayload.lines.forEach((line, index) => {
    const text = new PIXI.Text(line.text, style);
    text.visible = false;
    lyricObjects[String(index)] = text;
    lyricContainer?.addChild(text);
  });

  workerScope.postMessage({ type: "BAKING", progress: 0 });
  timeline = bakeScene(scenePayload, (progress) => {
    workerScope.postMessage({ type: "BAKING", progress });
  });

  playheadMs = 0;
  songStartMs = scenePayload.songStart * 1000;
  lastTick = 0;
  workerScope.cancelAnimationFrame(rafHandle);
  rafHandle = workerScope.requestAnimationFrame(tick);
};

workerScope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const data = event.data;

  if (data.type === "INIT") {
    void initWorker(data.payload);
    return;
  }

  if (data.type === "SEEK") {
    playheadMs = Math.max(0, data.currentTime * 1000 - songStartMs);
    return;
  }

  if (data.type === "PLAY") {
    isPlaying = true;
    return;
  }

  if (data.type === "PAUSE") {
    isPlaying = false;
    return;
  }

  if (data.type === "DESTROY") {
    isPlaying = false;
    workerScope.cancelAnimationFrame(rafHandle);
    app?.destroy();
    app = null;
    lyricContainer = null;
    particleContainer = null;
    lyricObjects = {};
    timeline = [];
  }
};
