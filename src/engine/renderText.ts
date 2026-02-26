/**
 * renderText.ts — Text + word effects rendering extracted from ShareableLyricDance.
 *
 * Section 3 of the incremental render-loop migration.
 * Handles: word layout, kinetic/elemental/evolution effects, display modes,
 * shot-type overlays, hero word glow, motion trails, and word history tracking.
 */

import type { Chapter, CinematicDirection, TensionStage, WordDirective } from "@/types/CinematicDirection";
import type { FrameRenderState } from "@/engine/presetDerivation";
import type { DirectionInterpreter, WordHistory } from "@/engine/DirectionInterpreter";
import type { LineAnimation } from "@/engine/AnimationResolver";
import { animationResolver } from "@/engine/AnimationResolver";
import { resolveEffectKey, getEffect, type EffectState } from "@/engine/EffectRegistry";
import { cinematicFontSize, computeFitFontSize, computeStackedLayout, getCinematicLayout } from "@/engine/SystemStyles";
import { applyEntrance, applyExit, applyModEffect } from "@/engine/LyricAnimations";
import { applyKineticEffect } from "@/engine/KineticEffects";
import { drawElementalWord } from "@/engine/ElementalEffects";
import { getTextShadow } from "@/engine/LightingSystem";
import * as WordClassifier from "@/engine/WordClassifier";

// ─── Helpers ────────────────────────────────────────────────────────

function measureTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  fs: number,
  letterSpacingEm: number,
): number {
  if (!text) return 0;
  const spacingPx = letterSpacingEm * fs;
  const chars = Array.from(text);
  let total = 0;
  for (let i = 0; i < chars.length; i += 1) {
    total += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) total += spacingPx;
  }
  return total;
}

function drawTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fs: number,
  letterSpacingEm: number,
  align: CanvasTextAlign,
): void {
  if (letterSpacingEm === 0 || text.length <= 1) {
    ctx.fillText(text, x, y);
    return;
  }
  const spacingPx = letterSpacingEm * fs;
  const chars = Array.from(text);
  const totalWidth = measureTextWithSpacing(ctx, text, fs, letterSpacingEm);
  const startX = align === "center"
    ? x - totalWidth / 2
    : (align === "right" || align === "end")
      ? x - totalWidth
      : x;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cursorX = startX;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], cursorX, y);
    cursorX += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? spacingPx : 0);
  }
  ctx.textAlign = prevAlign;
}

function strokeTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fs: number,
  letterSpacingEm: number,
  align: CanvasTextAlign,
): void {
  if (letterSpacingEm === 0 || text.length <= 1) {
    ctx.strokeText(text, x, y);
    return;
  }
  const spacingPx = letterSpacingEm * fs;
  const chars = Array.from(text);
  const totalWidth = measureTextWithSpacing(ctx, text, fs, letterSpacingEm);
  const startX = align === "center"
    ? x - totalWidth / 2
    : (align === "right" || align === "end")
      ? x - totalWidth
      : x;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cursorX = startX;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.strokeText(chars[i], cursorX, y);
    cursorX += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? spacingPx : 0);
  }
  ctx.textAlign = prevAlign;
}

function drawBubbles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wordWidth: number,
  fontSize: number,
  bubbleCount: number,
  intensity: number,
  time: number,
): void {
  ctx.save();
  for (let i = 0; i < bubbleCount; i++) {
    const t = time * 0.5 + i * 1.3;
    const bx = x + (Math.sin(t * 0.7 + i) * wordWidth * 0.3);
    const by = y - fontSize * 0.3 - Math.abs(Math.sin(t * 0.4 + i * 0.5)) * fontSize * intensity;
    const radius = 2 + Math.sin(t + i) * 1.5;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,210,255,${0.15 + Math.sin(t) * 0.05})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();
}

function snapToNearestBeat(timestamp: number, beats: number[], tolerance: number = 0.1): number {
  if (beats.length === 0) return timestamp;
  const nearest = beats.reduce((prev, curr) => (
    Math.abs(curr - timestamp) < Math.abs(prev - timestamp) ? curr : prev
  ));
  return Math.abs(nearest - timestamp) <= tolerance ? nearest : timestamp;
}


function ellipsizeToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fs: number,
  letterSpacingEm: number,
): string {
  const ellipsis = '…';
  const measure = (value: string) => measureTextWithSpacing(ctx, value, fs, letterSpacingEm);
  if (measure(text) <= maxWidth) return text;

  const words = text.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(' ')}${ellipsis}`;
    if (measure(candidate) <= maxWidth) return candidate;
  }

  let out = words[0] ?? text;
  while (out.length > 1) {
    out = out.slice(0, -1);
    const candidate = `${out}${ellipsis}`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return ellipsis;
}

function getDirectiveEffectKey(directive: WordDirective | null): string | null {
  if (!directive) return null;
  if (directive.kineticClass === "NEGATION" || directive.kineticClass === "BREAKING") return "SHATTER_IN";
  if (directive.kineticClass === "RUNNING" || directive.kineticClass === "RISING") return "WAVE_SURGE";
  if (directive.kineticClass === "SHAKING" || directive.kineticClass === "SCREAMING") return "GLITCH_FLASH";
  if (directive.kineticClass === "WHISPERING" || directive.kineticClass === "TENDER") return "SOFT_BLOOM";
  if (directive.elementalClass === "FIRE") return "HEAT_WARP";
  if (directive.elementalClass === "RAIN") return "RAIN_VEIL";
  if (directive.elementalClass === "ELECTRIC" || directive.elementalClass === "NEON") return "GLITCH_FLASH";
  return null;
}

// ─── Interfaces ─────────────────────────────────────────────────────

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  tag?: "main" | "adlib";
}

export interface PrecomputedLineMetrics {
  words: string[];
  wordsUpper: string[];
  normalizedWords: string[];
  snappedWordStartTimes: number[];
  directives: (WordDirective | null)[];
  appearanceCounts: number[];
  hasImpactWord: boolean;
}

/** Mutable text-layer state — persisted across frames by the caller. */
export interface TextState {
  xOffset: number;
  yBase: number;
  beatScale: number;
  wordCounts: Map<string, number>;
  seenAppearances: Set<string>;
  wordHistory: Map<string, WordHistory>;
  directiveCache: Map<string, WordDirective | null>;
  evolutionCache: Map<string, { count: number; scale: number; glow: number; opacity: number; yOffset: number }>;
}

/** Per-frame input for renderText. */
export interface TextInput {
  lines: LyricLine[];
  activeLine: LyricLine | null;
  activeLineIndex: number;
  visibleLines: LyricLine[];
  currentTime: number;
  songProgress: number;
  beatIntensity: number;
  beatIndex: number;
  sortedBeats: number[];
  cw: number;
  ch: number;
  effectivePalette: string[];
  effectiveSystem: string;
  resolvedManifest: FrameRenderState;
  textPalette: string[];
  spec: any;
  state: {
    scale: number;
    shake: number;
    offsetX: number;
    offsetY: number;
    rotation: number;
    blur: number;
    glow: number;
    isFractured: boolean;
    position: number;
    velocity: number;
    heat: number;
    safeOffset: number;
    shatter: number;
    wordOffsets: { x: number; y: number; rotation: number }[];
  };
  interpreter: DirectionInterpreter | null;
  shot: { shotType?: string; description?: string } | null;
  tensionStage: TensionStage | null;
  chapterDirective: Chapter | null;
  cinematicDirection: CinematicDirection | null;
  isClimax: boolean;
  particleEngine: { setDensityMultiplier: (n: number) => void } | null;
  rng: () => number;
  getWordWidth: (word: string, fSize: number, fontFamily: string) => number;
  /** Is this a mobile viewport? */
  isMobile: boolean;
  fontSize?: number;
  letterSpacingOverride?: number;
  wrappedLines?: string[];
  aspectHint?: "9:16" | "1:1" | "16:9";
  hardwareConcurrency: number;
  devicePixelRatio: number;
  precomputedLine?: PrecomputedLineMetrics | null;
}

/** Result from renderText — values the caller reads back. */
export interface TextResult {
  drawCalls: number;
  activeWordPosition: { x: number; y: number };
  // Debug frame info
  effectKey: string;
  fontSize: number;
  activeMod: string | null;
  isHook: boolean;
  beatMult: number;
  entry: number;
  exit: number;
  fontScale: number;
  scale: number;
  lineColor: string;
  repIndex: number;
  repTotal: number;
  xNudge: number;
  sectionZone: string;
  wordsProcessed: number;
}

// ─── Main function ──────────────────────────────────────────────────

export function renderText(
  ctx: CanvasRenderingContext2D,
  input: TextInput,
  textState: TextState,
): TextResult {
  const {
    lines, activeLine, activeLineIndex, visibleLines,
    currentTime, songProgress, beatIntensity, beatIndex, sortedBeats,
    cw, ch, effectivePalette, effectiveSystem, resolvedManifest, textPalette, spec,
    state, interpreter, shot, tensionStage, chapterDirective, cinematicDirection,
    isClimax, particleEngine, rng, getWordWidth, isMobile, fontSize: providedFontSize, hardwareConcurrency, devicePixelRatio, precomputedLine,
  } = input;
  const baseTypoProfile = cinematicDirection?.visualWorld?.typographyProfile;
  const chapterTypoShift = chapterDirective?.typographyShift as { fontWeight?: number; letterSpacing?: string } | undefined;
  const cinematicFontFamily = baseTypoProfile?.fontFamily ?? "Montserrat";
  const cinematicFontWeight = chapterTypoShift?.fontWeight ?? baseTypoProfile?.fontWeight ?? 400;
  const cinematicLetterSpacing = chapterTypoShift?.letterSpacing ?? baseTypoProfile?.letterSpacing ?? "0";
  const cinematicTextTransform = baseTypoProfile?.textTransform as string | undefined;
  const resolvedWordFont = `"${cinematicFontFamily}", Inter, ui-sans-serif, system-ui`;
  const buildWordFont = (size: number) => `${cinematicFontWeight} ${size}px ${resolvedWordFont}`;

  let drawCalls = 0;
  let activeWordPosition = {
    x: cw / 2 + textState.xOffset + state.offsetX,
    y: textState.yBase === 0 ? ch * 0.5 : textState.yBase + state.offsetY,
  };

  // Decay beat scale
  textState.beatScale = Math.max(1, textState.beatScale * 0.9);

  // Default debug frame info
  let frameEffectKey = "—";
  let frameFontSize = 0;
  let frameActiveMod: string | null = null;
  let frameIsHook = false;
  let frameBeatMult = 1;
  let frameEntry = 0;
  let frameExit = 0;
  let frameFontScale = 1;
  let frameScale = 1;
  let frameLineColor = "#ffffff";
  let frameRepIndex = 0;
  let frameRepTotal = 0;
  let frameXNudge = 0;
  let frameSectionZone = "chorus";

  if (!activeLine) {
    return {
      drawCalls,
      activeWordPosition,
      effectKey: frameEffectKey,
      fontSize: frameFontSize,
      activeMod: frameActiveMod,
      isHook: frameIsHook,
      beatMult: frameBeatMult,
      entry: frameEntry,
      exit: frameExit,
      fontScale: frameFontScale,
      scale: frameScale,
      lineColor: frameLineColor,
      repIndex: frameRepIndex,
      repTotal: frameRepTotal,
      xNudge: frameXNudge,
      sectionZone: frameSectionZone,
      wordsProcessed: 0,
    };
  }

  // ── Resolve effect key ────────────────────────────────────────────
  let effectKey = "STATIC_RESOLVE";
  if (spec.effect_pool && spec.effect_pool.length > 0 && spec.logic_seed != null) {
    const poolIdx = (spec.logic_seed + activeLineIndex * 7) % spec.effect_pool.length;
    effectKey = resolveEffectKey(spec.effect_pool[poolIdx]);
  }

  const lineDirection = interpreter?.getLineDirection(activeLineIndex) ?? null;
  const lineHeroDirective = lineDirection?.heroWord
    ? interpreter?.getWordDirective(lineDirection.heroWord) ?? null
    : null;
  const directiveEffect = getDirectiveEffectKey(lineHeroDirective);
  if (directiveEffect) {
    effectKey = directiveEffect;
  }
  frameEffectKey = effectKey;
  const drawFn = getEffect(effectKey);

  // ── Resolve line animation ────────────────────────────────────────
  const activeLineAnim = animationResolver.resolveLine(
    activeLineIndex, activeLine.start, activeLine.end, currentTime, beatIntensity, effectivePalette,
  );
  frameActiveMod = activeLineAnim.activeMod;
  frameIsHook = activeLineAnim.isHookLine;
  frameBeatMult = activeLineAnim.beatMultiplier;
  frameEntry = activeLineAnim.entryProgress;
  frameExit = activeLineAnim.exitProgress;
  frameFontScale = activeLineAnim.fontScale;
  frameScale = activeLineAnim.scale;
  frameLineColor = activeLineAnim.lineColor;

  const age = (currentTime - activeLine.start) * 1000;
  const lineDur = activeLine.end - activeLine.start;
  const lineProgress = Math.min(1, (currentTime - activeLine.start) / lineDur);
  let lineOpacity = 1;
  let entryOverride: string | null = null;
  let exitOverride: string | null = null;
  let useLetterFragmentation = false;
  let drawSymbolOverText = false;

  // ── Shot type overlays ────────────────────────────────────────────
  switch (shot?.shotType) {
    case 'SubmergedInSymbol':
      ctx.fillStyle = 'rgba(100,150,220,0.08)';
      ctx.fillRect(0, 0, cw, ch);
      lineOpacity = 0.85;
      break;
    case 'EmergingFromSymbol':
      entryOverride = 'materializes';
      break;
    case 'ConsumedBySymbol':
      exitOverride = 'dissolves-upward';
      drawSymbolOverText = true;
      break;
    case 'FragmentedBySymbol':
      useLetterFragmentation = true;
      break;
    case 'AloneInVoid':
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, cw, ch);
      particleEngine?.setDensityMultiplier(0.05);
      break;
    case 'FloatingInWorld':
    case 'ReflectedInSymbol':
    default:
      break;
  }

  // ── Font sizing ───────────────────────────────────────────────────
  const cinematicSizingV2 = cinematicDirection != null;
  const cinematicLayout = getCinematicLayout(cw, ch);
  const shortSide = Math.min(cw, ch);
  const strokePaddingPx = shortSide * 0.015;
  const effectiveBoxW = cinematicLayout.textBoxW - strokePaddingPx;
  const stackedLayout = computeStackedLayout(ctx, activeLine.text, cw, ch, effectiveSystem, input.aspectHint);
  const legacySize = stackedLayout.isStacked
    ? { fs: stackedLayout.fs, effectiveLetterSpacing: stackedLayout.effectiveLetterSpacing }
    : computeFitFontSize(ctx, activeLine.text, cw, effectiveSystem);

  const inputFontSize = typeof providedFontSize === "number" ? providedFontSize : undefined;
  const hasProvidedSizing = inputFontSize != null
    && typeof input.letterSpacingOverride === "number"
    && Array.isArray(input.wrappedLines);

  let resolvedWrappedLines = input.wrappedLines;
  let resolvedLetterSpacingEm = input.letterSpacingOverride ?? 0;
  let fs = legacySize.fs;
  let effectiveLetterSpacing = legacySize.effectiveLetterSpacing;

  if (cinematicSizingV2) {
    const sizing = hasProvidedSizing
      ? { fs: inputFontSize as number, letterSpacingEm: input.letterSpacingOverride as number, lines: input.wrappedLines }
      : cinematicFontSize(ctx, activeLine.text, cw, ch, cinematicFontFamily, Number(cinematicFontWeight));
    fs = sizing.fs;
    resolvedLetterSpacingEm = sizing.letterSpacingEm;
    resolvedWrappedLines = sizing.lines;
    effectiveLetterSpacing = 0;
  }

  const typoAggression = tensionStage?.typographyAggression ?? 0.5;
  const baseWordScale = 0.9 + typoAggression * 0.4;
  const computedFontSize = fs * activeLineAnim.fontScale * baseWordScale;
  const fontSize = computedFontSize;
  frameFontSize = computedFontSize;

  // ── Position ──────────────────────────────────────────────────────
  const sectionProgress = songProgress;
  let sectionZone: "verse" | "chorus" | "bridge" | "hook" | "outro" = "chorus";
  if (sectionProgress < 0.33) sectionZone = "verse";
  else if (sectionProgress < 0.6) sectionZone = "chorus";
  else if (sectionProgress < 0.75) sectionZone = "bridge";
  else sectionZone = "outro";
  if (activeLineAnim.isHookLine) sectionZone = "hook";
  frameSectionZone = sectionZone;

  const strongMods = new Set(["PULSE_STRONG", "HEAT_SPIKE", "ERUPT", "FLAME_BURST", "EXPLODE"]);
  const softMods = new Set(["BLUR_OUT", "ECHO_FADE", "DISSOLVE", "FADE_OUT", "FADE_OUT_FAST"]);
  let targetYBase = cinematicLayout.baselineY;
  if (activeLineAnim.isHookLine) {
    targetYBase = ch * 0.44;
  } else if (activeLineAnim.activeMod && strongMods.has(activeLineAnim.activeMod)) {
    targetYBase = ch * 0.46;
  } else if (activeLineAnim.activeMod && softMods.has(activeLineAnim.activeMod)) {
    targetYBase = ch * 0.54;
  }

  const lineSpacing = visibleLines.length <= 1
    ? ch * 0.12
    : visibleLines.length <= 2
      ? ch * 0.09
      : ch * 0.07;

  const visibleIndex = Math.max(0, visibleLines.findIndex(l => l.start === activeLine.start && l.end === activeLine.end && l.text === activeLine.text));
  const yLineOffset = (visibleIndex - (visibleLines.length - 1) / 2) * lineSpacing;
  targetYBase += yLineOffset;
  if (activeLineAnim.isHookLine) {
    targetYBase -= ch * 0.03;
  }

  textState.xOffset += (0 - textState.xOffset) * 0.05;
  textState.yBase += (targetYBase - textState.yBase) * 0.05;

  const nudge = beatIntensity * 3;
  let xNudge = 0;
  let yNudge = 0;
  switch (resolvedManifest.lightSource) {
    case "flickering left":
    case "left":
      xNudge = -nudge;
      break;
    case "right":
    case "flickering right":
      xNudge = nudge;
      break;
    case "golden hour":
    case "warm overhead":
      yNudge = -nudge * 0.5;
      break;
    case "winter daylight":
    case "dead of night":
      yNudge = nudge * 0.3;
      break;
    default:
      xNudge = 0;
      yNudge = 0;
      break;
  }
  frameXNudge = xNudge;

  // Physics-driven shake
  const physShakeAngle = (beatIndex * 2.3 + currentTime * 7.1) % (Math.PI * 2);
  const physShakeX = Math.cos(physShakeAngle) * state.shake;
  const physShakeY = Math.sin(physShakeAngle) * state.shake;
  const lineX = cw / 2 + textState.xOffset + xNudge + state.offsetX + physShakeX;
  const lineY = textState.yBase + yNudge + state.offsetY + physShakeY;
  activeWordPosition = { x: lineX, y: lineY };

  const textShadow = getTextShadow(resolvedManifest, beatIntensity);

  ctx.save();

  // Entrance/exit
  const lyricEntrance = (entryOverride as any) ?? lineDirection?.entryStyle ?? resolvedManifest?.lyricEntrance ?? "fades";
  const lyricExit = (exitOverride as any) ?? lineDirection?.exitStyle ?? resolvedManifest?.lyricExit ?? "fades";
  const entryAlpha = applyEntrance(ctx, activeLineAnim.entryProgress, lyricEntrance, { spatialZone: sectionZone });
  // Tighten exit progression to reduce line linger overlap during transitions.
  const tightenedExitProgress = Math.min(1, activeLineAnim.exitProgress * 1.8);
  const exitAlpha = activeLineAnim.exitProgress > 0
    ? applyExit(ctx, tightenedExitProgress, lyricExit)
    : 1.0;
  const compositeAlpha = Math.min(entryAlpha, exitAlpha) * lineOpacity;

  ctx.translate(lineX, lineY);
  if (Math.abs(state.rotation) > 0.0001) {
    ctx.rotate(state.rotation);
  }
  ctx.scale(activeLineAnim.scale * state.scale * textState.beatScale, activeLineAnim.scale * state.scale * textState.beatScale);
  ctx.translate(-lineX, -lineY);

  if (activeLineAnim.activeMod) {
    applyModEffect(ctx, activeLineAnim.activeMod, currentTime, beatIntensity);
  }

  // ── Word splitting + display mode ─────────────────────────────────
  const words = precomputedLine?.words ?? activeLine.text.split(/\s+/).filter(Boolean);
  const wordsUpper = precomputedLine?.wordsUpper ?? words;
  const normalizedWords = precomputedLine?.normalizedWords ?? words.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, ""));
  const directives = precomputedLine?.directives;
  const precomputedAppearances = precomputedLine?.appearanceCounts;
  const snappedStarts = precomputedLine?.snappedWordStartTimes;
  let visibleWordCount = 0;
  if (snappedStarts && snappedStarts.length > 0) {
    while (visibleWordCount < snappedStarts.length && currentTime >= snappedStarts[visibleWordCount]) visibleWordCount += 1;
  } else {
    const lineDuration = Math.max(0.001, activeLine.end - activeLine.start);
    const wordsPerSecond = words.length > 0 ? words.length / lineDuration : 1;
    const wordDelay = wordsPerSecond > 0 ? 1 / wordsPerSecond : lineDuration;
    while (visibleWordCount < words.length && currentTime >= activeLine.start + visibleWordCount * wordDelay) visibleWordCount += 1;
  }

  const wordCount = words.length;
  const isShort = wordCount <= 3;
  const lineDuration = Math.max(0.001, activeLine.end - activeLine.start);
  const isFast = lineDuration < 1.5;
  const hasImpactWord = precomputedLine?.hasImpactWord ?? words.some(word => WordClassifier.classifyWord(word) === "IMPACT");
  type DisplayMode = "single_word" | "phrase_stack" | "two_line_stack";
  const displayMode: DisplayMode = (activeLineAnim.isHookLine || isShort || hasImpactWord)
    ? "single_word"
    : isFast
      ? "two_line_stack"
      : "phrase_stack";

  let resolvedDisplayMode = displayMode;
  if (cinematicSizingV2 && resolvedDisplayMode === "two_line_stack") {
    resolvedDisplayMode = "single_word";
  }

  // Previous line ghost for two_line_stack
  const previousLine = activeLineIndex > 0 ? lines[activeLineIndex - 1] : null;
  if (resolvedDisplayMode === "two_line_stack" && previousLine) {
    ctx.save();
    ctx.font = buildWordFont(Math.max(14, fontSize * 0.86));
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = activeLineAnim.lineColor;
    ctx.globalAlpha = 0.12 * compositeAlpha * Math.max(0.2, 1 - tightenedExitProgress);
    if (resolvedLetterSpacingEm !== 0) {
      drawTextWithSpacing(ctx, previousLine.text, lineX, lineY - Math.max(40, fontSize * 1.5), fontSize, resolvedLetterSpacingEm, "center");
    } else {
      ctx.fillText(previousLine.text, lineX, lineY - Math.max(40, fontSize * 1.5));
    }
    ctx.restore();
  }

  const getDisplayWord = (text: string) => (
    cinematicTextTransform === "uppercase" ? text.toUpperCase() : text
  );

  const drawLine = (text: string, y: number): void => {
    if (resolvedLetterSpacingEm === -0.05 && ch > cw) {
      const measured = measureTextWithSpacing(ctx, text, fontSize, resolvedLetterSpacingEm);
      if (measured > effectiveBoxW) {
        text = ellipsizeToWidth(ctx, text, effectiveBoxW, fontSize, resolvedLetterSpacingEm);
      }
    }

    if (resolvedLetterSpacingEm !== 0) drawTextWithSpacing(ctx, text, lineX, y, fontSize, resolvedLetterSpacingEm, "center");
    else ctx.fillText(text, lineX, y);
  };

  if (cinematicSizingV2 && resolvedWrappedLines && resolvedWrappedLines.length > 1) {
    const renderLines = resolvedWrappedLines.slice(0, 2);
    const yOffsets = renderLines.length === 2
      ? [-cinematicLayout.lineHeight * 0.55, cinematicLayout.lineHeight * 0.55]
      : [0];
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = buildWordFont(fontSize);
    ctx.fillStyle = activeLineAnim.lineColor;
    ctx.globalAlpha = compositeAlpha;

    renderLines.forEach((segment, idx) => {
      const y = cinematicLayout.baselineY + (yOffsets[idx] ?? 0);
      drawLine(getDisplayWord(segment), y);
      drawCalls += 1;
    });

    ctx.restore();
    return {
      drawCalls,
      activeWordPosition: { x: lineX, y: cinematicLayout.baselineY },
      effectKey: frameEffectKey,
      fontSize: frameFontSize,
      activeMod: frameActiveMod,
      isHook: frameIsHook,
      beatMult: frameBeatMult,
      entry: frameEntry,
      exit: frameExit,
      fontScale: frameFontScale,
      scale: frameScale,
      lineColor: frameLineColor,
      repIndex: frameRepIndex,
      repTotal: frameRepTotal,
      xNudge: frameXNudge,
      sectionZone: frameSectionZone,
      wordsProcessed: renderLines.length,
    };
  }

  const renderedWords = resolvedDisplayMode === "single_word"
    ? (visibleWordCount > 0 ? [displayMode === "single_word" ? words[Math.max(0, visibleWordCount - 1)] : ""] : [])
    : resolvedDisplayMode === "two_line_stack"
      ? words
      : words.slice(0, visibleWordCount);

  const measuredWordWidths = renderedWords.map((word) => getWordWidth(getDisplayWord(word), fontSize, resolvedWordFont));
  const baseSpaceWidth = getWordWidth(" ", fontSize, resolvedWordFont);
  const totalWidth = measuredWordWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, renderedWords.length - 1) * baseSpaceWidth;
  let cursorX = resolvedDisplayMode === "single_word" ? lineX : lineX - totalWidth / 2;

  if (renderedWords.length > 0) {
    const activeWordIdx = Math.max(0, renderedWords.length - 1);
    const priorWidth = measuredWordWidths
      .slice(0, activeWordIdx)
      .reduce((sum, width) => sum + width, 0) + activeWordIdx * baseSpaceWidth;
    const activeWidth = measuredWordWidths[activeWordIdx] ?? 0;
    activeWordPosition = {
      x: (resolvedDisplayMode === "single_word" ? lineX : lineX - totalWidth / 2) + priorWidth + activeWidth / 2,
      y: lineY,
    };
  }

  const getCachedDirective = (wordText: string, wordIndex: number): WordDirective | null => {
    if (directives && directives[wordIndex] !== undefined) return directives[wordIndex] ?? null;
    const key = wordText.toLowerCase();
    if (!textState.directiveCache.has(key)) {
      textState.directiveCache.set(key, interpreter?.getWordDirective(wordText) ?? null);
    }
    return textState.directiveCache.get(key) ?? null;
  };

  // ── Per-word rendering ────────────────────────────────────────────
  renderedWords.forEach((wordText, renderedIndex) => {
    const displayWord = getDisplayWord(wordText);
    const normalizedWord = normalizedWords[Math.max(0, resolvedDisplayMode === "single_word" ? visibleWordCount - 1 : renderedIndex)] ?? wordText.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
    const sourceWordIndex = resolvedDisplayMode === "single_word"
      ? Math.max(0, visibleWordCount - 1)
      : renderedIndex;
    const resolvedWordStartTime = snappedStarts?.[Math.max(0, sourceWordIndex)]
      ?? snapToNearestBeat(activeLine.start + (Math.max(0, sourceWordIndex) * Math.max(0.001, activeLine.end - activeLine.start)) / Math.max(1, words.length), sortedBeats);
    const appearanceKey = `${activeLine.start}:${Math.max(0, sourceWordIndex)}:${normalizedWord}`;

    if (!textState.seenAppearances.has(appearanceKey) && currentTime >= resolvedWordStartTime) {
      const nextCount = (textState.wordCounts.get(normalizedWord) ?? 0) + 1;
      textState.wordCounts.set(normalizedWord, nextCount);
      textState.seenAppearances.add(appearanceKey);
    }

    const props = WordClassifier.getWordVisualProps(
      wordText,
      Math.max(0, sourceWordIndex),
      Math.max(1, renderedWords.length),
      activeLineAnim,
      beatIntensity,
      textState.wordCounts.get(normalizedWord) ?? 0,
    );

    const directive = getCachedDirective(wordText, Math.max(0, sourceWordIndex));
    if (directive?.colorOverride) {
      props.color = directive.colorOverride;
    }
    if (typeof directive?.emphasisLevel === "number") {
      props.scale = props.scale * (1 + directive.emphasisLevel * 0.2);
      props.opacity = Math.max(props.opacity, 0.75 + directive.emphasisLevel * 0.2);
    }

    if (currentTime < resolvedWordStartTime) {
      return;
    }

    const wordWidth = getWordWidth(displayWord, fontSize, resolvedWordFont);
    const wordCenterX = resolvedDisplayMode === "single_word" ? lineX : cursorX + wordWidth / 2;
    const wordX = wordCenterX;
    let wordY = lineY;

    ctx.font = buildWordFont(fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const wordRenderWidth = getWordWidth(displayWord, fontSize, resolvedWordFont);
    const existingHistory = textState.wordHistory.get(normalizedWord);
    const appearance = existingHistory?.count ?? 0;
    const appearanceCount = appearance + 1;
    const historyForRule: WordHistory = {
      count: appearanceCount,
      firstSeen: existingHistory?.firstSeen ?? currentTime,
      lastSeen: currentTime,
      positions: [...(existingHistory?.positions ?? []), { x: wordX, y: wordY }],
    };

    if (directive?.evolutionRule && normalizedWord === "down") {
      const fallSpeed = 1 + appearanceCount * 0.3;
      wordY += Math.sin(currentTime * fallSpeed) * 3;
    }

    const isHeroWord = Boolean(lineDirection?.heroWord && wordText.toLowerCase().includes(lineDirection.heroWord.toLowerCase()));
    const modeOpacity = resolvedDisplayMode === "phrase_stack"
      ? (renderedIndex === renderedWords.length - 1 ? 1 : 0.4)
      : 1;

    const fragmentationX = useLetterFragmentation ? (rng() - 0.5) * 6 : 0;
    const fragmentationY = useLetterFragmentation ? (rng() - 0.5) * 4 : 0;
    const finalX = wordX + props.xOffset + fragmentationX;
    const finalY = wordY + props.yOffset + fragmentationY;

    // Cull offscreen words
    if (finalX < -wordRenderWidth || finalX > cw + wordRenderWidth || finalY < -fontSize || finalY > ch + fontSize) {
      return;
    }

    // Ghost trail for evolution words
    if (historyForRule.positions.length > 1 && directive?.evolutionRule) {
      const lastPos = historyForRule.positions[historyForRule.positions.length - 2];
      if (lastPos) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = directive.colorOverride ?? effectivePalette[2] ?? "#ffffff";
        if (resolvedLetterSpacingEm !== 0) {
          drawTextWithSpacing(ctx, displayWord, lastPos.x, lastPos.y, fontSize, resolvedLetterSpacingEm, "center");
        } else {
          ctx.fillText(displayWord, lastPos.x, lastPos.y);
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(finalX, finalY);
    ctx.scale(props.scale, props.scale);

    if (directive?.emphasisLevel) {
      const emphasisScale = 0.8 + directive.emphasisLevel * 0.5;
      ctx.scale(emphasisScale, emphasisScale);
    }

    if (isHeroWord) {
      // Hero words use accent color from palette
      props.color = effectivePalette[1] ?? props.color;
      const heroGlow = ctx.createRadialGradient(0, -fontSize * 0.35, 0, 0, -fontSize * 0.35, fontSize * 1.8);
      heroGlow.addColorStop(0, effectivePalette[1] ?? resolvedManifest.palette?.[2] ?? "#ec4899");
      heroGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha *= 0.14;
      ctx.fillStyle = heroGlow;
      ctx.fillRect(-wordRenderWidth * 0.35, -fontSize * 1.6, wordRenderWidth * 1.7, fontSize * 2.7);
      ctx.restore();
      ctx.scale(1.2, 1.2);
    }

    // ── Evolution ─────────────────────────────────────────────────
    let evolutionScale = 1;
    let evolutionGlow = 0;
    let evolutionOpacity = 1;
    let evolutionYOffset = 0;

    if (directive?.evolutionRule) {
      const evolutionKey = `${normalizedWord}:${directive.evolutionRule}`;
      const cachedEvolution = textState.evolutionCache.get(evolutionKey);
      if (cachedEvolution && cachedEvolution.count === appearanceCount) {
        evolutionScale = cachedEvolution.scale;
        evolutionGlow = cachedEvolution.glow;
        evolutionOpacity = cachedEvolution.opacity;
        evolutionYOffset = cachedEvolution.yOffset;
      } else {
        const evolution = interpreter?.applyEvolutionRule(
          ctx,
          directive.evolutionRule,
          historyForRule,
          0, 0,
          wordRenderWidth,
          fontSize,
          beatIntensity,
          resolvedManifest.palette,
        );
        evolutionScale = evolution?.scaleMultiplier ?? 1;
        evolutionGlow = evolution?.glowRadius ?? 0;
        evolutionOpacity = evolution?.opacityMultiplier ?? 1;
        evolutionYOffset = evolution?.yOffset ?? 0;
        textState.evolutionCache.set(evolutionKey, {
          count: appearanceCount,
          scale: evolutionScale,
          glow: evolutionGlow,
          opacity: evolutionOpacity,
          yOffset: evolutionYOffset,
        });
      }
    }

    if (normalizedWord === "love" && directive?.evolutionRule) {
      evolutionGlow = Math.max(evolutionGlow, Math.min(appearanceCount * 3, 15));
      evolutionScale = Math.max(evolutionScale, 1 + Math.min(appearanceCount * 0.03, 0.15));
      evolutionYOffset = Math.min(evolutionYOffset + Math.min(appearanceCount, 5), 10);
    }

    if (isClimax) {
      evolutionScale = Math.max(evolutionScale, 1.08);
      if (normalizedWord === "you") {
        evolutionScale = Math.max(evolutionScale, 1.5);
        evolutionGlow = Math.max(evolutionGlow, 30);
      }
    }

    const climaxTimeRatio = cinematicDirection?.climax?.timeRatio ?? 0.65;
    if (songProgress > climaxTimeRatio) {
      const postClimaxDecay = Math.max(0, 1 - (songProgress - climaxTimeRatio) * 3);
      evolutionScale = 1 + (evolutionScale - 1) * postClimaxDecay;
      evolutionGlow *= postClimaxDecay;
    }

    if (evolutionScale !== 1) {
      ctx.scale(evolutionScale, evolutionScale);
    }
    if (evolutionYOffset !== 0) {
      ctx.translate(0, evolutionYOffset);
    }

    ctx.fillStyle = directive?.colorOverride ?? props.color;
    ctx.globalAlpha = props.opacity * compositeAlpha * modeOpacity * evolutionOpacity;

    // Glow
    if (props.glowRadius > 0 || evolutionGlow > 0) {
      const glowRadius = Math.max(props.glowRadius, evolutionGlow, 1);
      const glowColor = directive?.colorOverride ?? props.color;
      const glow = ctx.createRadialGradient(0, -fontSize * 0.3, 0, 0, -fontSize * 0.3, glowRadius * 2.4);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha *= 0.16;
      ctx.fillStyle = glow;
      ctx.fillRect(-wordRenderWidth * 0.3, -fontSize - glowRadius, wordRenderWidth * 1.6, fontSize + glowRadius * 2);
      ctx.restore();
    }

    // Kinetic effect
    if (directive?.kineticClass) {
      applyKineticEffect(
        ctx,
        directive.kineticClass,
        displayWord,
        wordRenderWidth,
        fontSize,
        currentTime,
        beatIntensity,
        renderedIndex,
        appearanceCount,
        1 + appearanceCount * 0.3,
      );
    }

    // Drown bubbles
    if (directive?.evolutionRule && normalizedWord === "drown") {
      drawBubbles(ctx, 0, 0, wordRenderWidth, fontSize, Math.min(20, 3 + appearanceCount * 2), 1 + appearanceCount * 0.4, currentTime);
    }

    // Elemental effects
    if (directive?.elementalClass) {
      const effectQuality = isMobile ? "low" : "high";
      const maxBubbles = devicePixelRatio > 1 ? 8 : 4;
      const bubbleCount = Math.min(maxBubbles, Math.max(3, appearanceCount + 2));
      const bubbleXPositions = Array.from({ length: bubbleCount }, (_, i) => wordRenderWidth * (i / Math.max(1, bubbleCount)));
      drawElementalWord(
        ctx,
        displayWord,
        fontSize,
        wordRenderWidth,
        directive.elementalClass,
        currentTime,
        beatIntensity,
        appearanceCount,
        directive.colorOverride ?? null,
        {
          bubbleXPositions,
          useBlur: hardwareConcurrency > 4,
          isHeroWord,
          effectQuality,
          wordX: finalX,
          wordY: finalY,
          canvasWidth: cw,
          canvasHeight: ch,
        },
      );
    } else if (props.letterSpacing !== "0em" || cinematicLetterSpacing !== "0") {
      const ls = resolvedLetterSpacingEm !== 0
        ? resolvedLetterSpacingEm
        : (props.letterSpacing !== "0em" ? Number.parseFloat(props.letterSpacing) : Number.parseFloat(cinematicLetterSpacing));
      drawTextWithSpacing(ctx, displayWord, 0, 0, fontSize, Number.isFinite(ls) ? ls : 0, "center");
    } else {
      if (resolvedLetterSpacingEm !== 0) drawTextWithSpacing(ctx, displayWord, 0, 0, fontSize, resolvedLetterSpacingEm, "center");
      else ctx.fillText(displayWord, 0, 0);
    }

    ctx.restore();

    // Motion trail
    if (props.showTrail) {
      for (let t = 1; t <= props.trailCount; t += 1) {
        ctx.globalAlpha = (props.opacity * 0.3) / t;
        if (resolvedLetterSpacingEm !== 0) drawTextWithSpacing(ctx, displayWord, finalX - (t * 4), finalY, fontSize, resolvedLetterSpacingEm, "center");
        else ctx.fillText(displayWord, finalX - (t * 4), finalY);
        drawCalls += 1;
      }
    }

    // Track word history
    textState.wordHistory.set(normalizedWord, {
      count: appearanceCount,
      firstSeen: existingHistory?.firstSeen ?? currentTime,
      lastSeen: currentTime,
      positions: [
        ...(existingHistory?.positions ?? []).slice(-4),
        { x: wordX, y: wordY },
      ],
    });

    ctx.globalAlpha = 1;
    if (resolvedDisplayMode !== "single_word") {
      cursorX += wordWidth + baseSpaceWidth;
    }
  });

  // ── Fallback effect when no words visible ─────────────────────────
  if (visibleWordCount === 0) {
    if (textShadow.blur > 0) {
      const fallbackGlow = ctx.createRadialGradient(cw * 0.5, ch * 0.5, 0, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.4);
      fallbackGlow.addColorStop(0, textShadow.color);
      fallbackGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha *= 0.08;
      ctx.fillStyle = fallbackGlow;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    const effectState: EffectState = {
      text: activeLine.text,
      physState: state,
      w: cw,
      h: ch,
      fs: fontSize,
      age,
      progress: lineProgress,
      rng,
      palette: [activeLineAnim.lineColor, textPalette[1], textPalette[2]],
      system: effectiveSystem,
      effectiveLetterSpacing,
      stackedLayout: stackedLayout.isStacked ? stackedLayout : undefined,
      alphaMultiplier: compositeAlpha,
    };
    drawFn(ctx, effectState);
  }

  // (Symbol overlay removed — dead V2 feature)

  ctx.restore();

  return {
    drawCalls,
    activeWordPosition,
    effectKey: frameEffectKey,
    fontSize: frameFontSize,
    activeMod: frameActiveMod,
    isHook: frameIsHook,
    beatMult: frameBeatMult,
    entry: frameEntry,
    exit: frameExit,
    fontScale: frameFontScale,
    scale: frameScale,
    lineColor: frameLineColor,
    repIndex: frameRepIndex,
    repTotal: frameRepTotal,
    xNudge: frameXNudge,
    sectionZone: frameSectionZone,
    wordsProcessed: renderedWords.length,
  };
}
