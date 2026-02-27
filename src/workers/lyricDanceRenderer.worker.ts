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
let lyricObjectIds: string[] = [];
let isPlaying = false;
let songStartMs = 0;
let playheadMs = 0;
let rafHandle = 0;
let lastTick = 0;
let viewportWidth = 0;
let viewportHeight = 0;

const DEBUG_INTERPOLATION = false;
const ALPHA_CULL_EPSILON = 0.001;
const OFFSCREEN_MARGIN_PX = 128;

type TimelineFrame = BakedTimeline[number];

type FrameChannels = {
  present: Uint8Array;
  visible: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  alpha: Float32Array;
  scaleX: Float32Array;
  scaleY: Float32Array;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  timeMs: number;
};

type FramePair = {
  a: TimelineFrame;
  b: TimelineFrame;
  aChannels: FrameChannels;
  bChannels: FrameChannels;
  t: number;
  aIndex: number;
  bIndex: number;
};

let frameChannels: FrameChannels[] = [];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const pickDiscrete = <T>(a: T, b: T, t: number): T => (t < 0.5 ? a : b);

const isOffscreen = (x: number, y: number, cameraX: number, cameraY: number, cameraZoom: number): boolean => {
  if (viewportWidth <= 0 || viewportHeight <= 0) return false;

  const screenX = (x - cameraX) * cameraZoom + viewportWidth * 0.5;
  const screenY = (y - cameraY) * cameraZoom + viewportHeight * 0.5;

  return (
    screenX < -OFFSCREEN_MARGIN_PX ||
    screenX > viewportWidth + OFFSCREEN_MARGIN_PX ||
    screenY < -OFFSCREEN_MARGIN_PX ||
    screenY > viewportHeight + OFFSCREEN_MARGIN_PX
  );
};

const buildFrameChannels = () => {
  frameChannels = new Array(timeline.length);

  const displayIndexById = new Map<string, number>();
  for (let displayIndex = 0; displayIndex < lyricObjectIds.length; displayIndex += 1) {
    displayIndexById.set(lyricObjectIds[displayIndex], displayIndex);
  }

  for (let frameIndex = 0; frameIndex < timeline.length; frameIndex += 1) {
    const frame = timeline[frameIndex];
    const count = lyricObjectIds.length;
    const present = new Uint8Array(count);
    const visible = new Uint8Array(count);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const alpha = new Float32Array(count);
    const scaleX = new Float32Array(count);
    const scaleY = new Float32Array(count);

    scaleX.fill(1);
    scaleY.fill(1);

    for (let chunkIndex = 0; chunkIndex < frame.chunks.length; chunkIndex += 1) {
      const chunk = frame.chunks[chunkIndex];
      const displayIndex = displayIndexById.get(chunk.id);
      if (displayIndex == null) continue;

      present[displayIndex] = 1;
      visible[displayIndex] = chunk.visible ? 1 : 0;
      x[displayIndex] = chunk.x;
      y[displayIndex] = chunk.y;
      alpha[displayIndex] = chunk.alpha;
      scaleX[displayIndex] = chunk.scaleX ?? chunk.scale ?? 1;
      scaleY[displayIndex] = chunk.scaleY ?? chunk.scale ?? 1;
    }

    frameChannels[frameIndex] = {
      present,
      visible,
      x,
      y,
      alpha,
      scaleX,
      scaleY,
      cameraX: frame.cameraX,
      cameraY: frame.cameraY,
      cameraZoom: frame.cameraZoom,
      timeMs: frame.timeMs,
    };
  }
};

const findFramePair = (currentTimeMs: number, target: FramePair): boolean => {
  if (!timeline.length || !frameChannels.length) return false;

  if (timeline.length === 1) {
    const onlyFrame = timeline[0];
    const onlyChannels = frameChannels[0];
    if (!onlyChannels) return false;

    target.a = onlyFrame;
    target.b = onlyFrame;
    target.aChannels = onlyChannels;
    target.bChannels = onlyChannels;
    target.t = 0;
    target.aIndex = 0;
    target.bIndex = 0;
    return true;
  }

  let low = 0;
  let high = timeline.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timeline[mid].timeMs < currentTimeMs) low = mid + 1;
    else high = mid - 1;
  }

  const aIndex = Math.max(0, low - 1);
  const bIndex = Math.min(timeline.length - 1, low);
  const a = timeline[aIndex];
  const b = timeline[bIndex];
  const aChannels = frameChannels[aIndex];
  const bChannels = frameChannels[bIndex];
  if (!aChannels || !bChannels) return false;

  target.a = a;
  target.b = b;
  target.aChannels = aChannels;
  target.bChannels = bChannels;
  target.aIndex = aIndex;
  target.bIndex = bIndex;

  if (aIndex === bIndex || b.timeMs <= a.timeMs) {
    target.t = 0;
    return true;
  }

  const blend = (currentTimeMs - a.timeMs) / (b.timeMs - a.timeMs);
  target.t = Math.max(0, Math.min(1, blend));
  return true;
};

const applyInterpolatedFrame = (pair: FramePair) => {
  if (!app) return;

  const a = pair.aChannels;
  const b = pair.bChannels;
  const cameraX = lerp(a.cameraX, b.cameraX, pair.t);
  const cameraY = lerp(a.cameraY, b.cameraY, pair.t);
  const cameraZoom = lerp(a.cameraZoom, b.cameraZoom, pair.t);

  for (let i = 0; i < lyricObjectIds.length; i += 1) {
    const text = lyricObjects[lyricObjectIds[i]];
    if (!text) continue;

    const hasA = a.present[i] === 1;
    const hasB = b.present[i] === 1;

    if (!hasA && !hasB) {
      text.visible = false;
      text.alpha = 0;
      continue;
    }

    const localT = hasA && hasB ? pair.t : 0;
    const startIndex = hasA ? a : b;
    const endIndex = hasB ? b : a;

    const visible = pickDiscrete(startIndex.visible[i] === 1, endIndex.visible[i] === 1, localT);
    text.visible = visible;

    if (!visible) {
      text.alpha = 0;
      continue;
    }

    const alpha = localT === 0 ? startIndex.alpha[i] : lerp(startIndex.alpha[i], endIndex.alpha[i], localT);
    if (alpha < ALPHA_CULL_EPSILON) {
      text.visible = false;
      text.alpha = 0;
      continue;
    }

    const x = localT === 0 ? startIndex.x[i] : lerp(startIndex.x[i], endIndex.x[i], localT);
    const y = localT === 0 ? startIndex.y[i] : lerp(startIndex.y[i], endIndex.y[i], localT);
    if (isOffscreen(x, y, cameraX, cameraY, cameraZoom)) {
      text.visible = false;
      text.alpha = 0;
      continue;
    }

    text.alpha = alpha;
    text.position.set(x, y);
    text.scale.set(
      localT === 0 ? startIndex.scaleX[i] : lerp(startIndex.scaleX[i], endIndex.scaleX[i], localT),
      localT === 0 ? startIndex.scaleY[i] : lerp(startIndex.scaleY[i], endIndex.scaleY[i], localT),
    );
  }

  (app.stage as any).scale?.set?.(cameraZoom, cameraZoom) ?? ((app.stage as any).scaleX = cameraZoom, (app.stage as any).scaleY = cameraZoom);
  app.stage.pivot.set(cameraX, cameraY);

  if (DEBUG_INTERPOLATION) {
    // eslint-disable-next-line no-console
    console.debug("[lyricDanceRenderer] interp", {
      currentTimeMs: playheadMs,
      aIndex: pair.aIndex,
      bIndex: pair.bIndex,
      aTimeMs: pair.aChannels.timeMs,
      bTimeMs: pair.bChannels.timeMs,
      t: pair.t,
      active: pair.aIndex !== pair.bIndex,
    });
  }
};

const reusableFramePair: FramePair = {
  a: null as unknown as TimelineFrame,
  b: null as unknown as TimelineFrame,
  aChannels: null as unknown as FrameChannels,
  bChannels: null as unknown as FrameChannels,
  t: 0,
  aIndex: 0,
  bIndex: 0,
};

const tick = (timestamp: number) => {
  if (!app || !lyricContainer) return;

  if (isPlaying) {
    if (!lastTick) lastTick = timestamp;
    playheadMs += timestamp - lastTick;
  }
  lastTick = timestamp;

  if (findFramePair(playheadMs, reusableFramePair)) {
    applyInterpolatedFrame(reusableFramePair);
  }

  app.renderer.render(app.stage);
  rafHandle = workerScope.requestAnimationFrame(tick);
};

const initWorker = async (payload: InitMessage["payload"]) => {
  const { canvas, width, height, ...scenePayload } = payload;
  viewportWidth = width;
  viewportHeight = height;

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
  lyricObjectIds = [];
  frameChannels = [];
  const style = new PIXI.TextStyle({
    fontFamily: "Montserrat",
    fontSize: 44,
    fill: scenePayload.palette?.[2] ?? "#ffffff",
  });

  scenePayload.lines.forEach((line, index) => {
    const id = String(index);
    const text = new PIXI.Text(line.text, style);
    // Keep text content static per display object to avoid PIXI.Text texture/layout churn during RAF.
    text.visible = false;
    lyricObjects[id] = text;
    lyricObjectIds.push(id);
    lyricContainer?.addChild(text);
  });

  workerScope.postMessage({ type: "BAKING", progress: 0 });
  timeline = bakeScene(scenePayload, (progress) => {
    workerScope.postMessage({ type: "BAKING", progress });
  });
  buildFrameChannels();

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
    lyricObjectIds = [];
    timeline = [];
    frameChannels = [];
    viewportWidth = 0;
    viewportHeight = 0;
  }
};
