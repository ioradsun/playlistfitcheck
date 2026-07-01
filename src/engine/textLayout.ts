/**
 * textLayout.ts — First-principles text layout for lyric dance.
 *
 * THE WORDS ARE THE VIDEO. They should fill the screen, not float in it.
 *
 * GUARANTEES:
 *   1. FILLS THE CANVAS — text uses maximum available space at every aspect ratio
 *   2. ALWAYS READABLE — fontSize ≥ minFontPx, edge padding prevents clipping
 *   3. NEVER OVERLAPS — slot system gives each phrase its own vertical region
 *   4. RESPONSIVE — portrait phones stack words vertically and use the height;
 *      landscape screens spread words wide. One algorithm, zero branches.
 *   5. BALANCED WRAPPING — lines are similar width, not greedy-packed
 *   6. HERO HEADROOM — layout reserves space for emphasis scale-up at draw time
 *
 * EXPORTS:
 *   fitTextToViewport() — sizes, wraps, and positions words in absolute canvas coords
 *   computeSlots()      — divides canvas into non-overlapping vertical bands
 *   assignGroupToSlot() — picks which slot a phrase occupies based on timing
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Measurement context — subset of CanvasRenderingContext2D we actually need */
export interface MeasureContext {
  font: string;
  measureText(text: string): { width: number };
}

/** Output of fitTextToViewport */
export interface TextLayout {
  /** Computed font size in pixels (canvas space) */
  fontSize: number;
  /** Word-wrapped lines (display text) */
  lines: string[];
  /** Flat list of every word with its absolute canvas position */
  wordPositions: WordPosition[];
  /** Total height of the text block including line spacing */
  totalHeight: number;
}

export interface WordPosition {
  /** Which wrapped line this word is on (0-based) */
  lineIndex: number;
  /** Index within the wrapped line (0-based) */
  wordIndexInLine: number;
  /** Index in the original input word array (0-based) */
  sourceIndex: number;
  /** Center-X of word in absolute canvas pixels */
  x: number;
  /** Baseline-Y of word in absolute canvas pixels */
  y: number;
  /** Measured width at computed fontSize */
  width: number;
  /** Display text (after transform) */
  text: string;
}

/** A vertical band — no text from other slots enters this region */
export interface Slot {
  /** 0 = exit (top), 1 = active (center), 2 = enter (bottom) */
  id: number;
  /** Top edge in canvas pixels */
  yTop: number;
  /** Bottom edge in canvas pixels */
  yBottom: number;
  /** Vertical center in canvas pixels */
  yCenter: number;
  /** Usable height for text layout */
  height: number;
}

/** Result of assigning a phrase to a slot */
export interface SlotAssignment {
  /** Which slot: 0=exit, 1=active, 2=enter */
  slotId: number;
  /** 0-1 opacity */
  alpha: number;
  /** Visual scale multiplier */
  scale: number;
  /** The slot geometry */
  slot: Slot;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Line height multiplier — space between wrapped lines */
const LINE_HEIGHT = 1.4;

/** Minimum word gap as fraction of fontSize — prevents words from touching */
const MIN_GAP_EM = 0.28;

/** Edge padding — fraction of canvas width. Text never touches the edge. */
const EDGE_PAD_RATIO = 0.05;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split words into EXACTLY `lineCount` contiguous lines, minimising the width
 * of the widest line. Contiguous (reading order preserved) + min-max width is a
 * clean balance objective: it never leaves one line far longer than the rest,
 * which is what lets the caller push the font size up without overflowing.
 *
 * Returns an array of `lineCount` index arrays. Uses DP; word counts per phrase
 * are small so this is cheap.
 */
function splitIntoLines(
  wordWidths: number[],
  spaceW: number,
  lineCount: number,
): number[][] {
  const n = wordWidths.length;
  const range = (a: number, b: number) =>
    Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
  if (lineCount <= 1 || n <= 1) return [range(0, n)];
  if (lineCount >= n) return range(0, n).map((i) => [i]);

  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + wordWidths[i]);
  // Width of words [i, j) on one line (j exclusive).
  const lineWidth = (i: number, j: number) => pre[j] - pre[i] + spaceW * (j - i - 1);

  const memo = new Map<string, { max: number; cut: number }>();
  const solve = (i: number, lines: number): { max: number; cut: number } => {
    if (lines === 1) return { max: lineWidth(i, n), cut: n };
    const key = i + "|" + lines;
    const cached = memo.get(key);
    if (cached) return cached;
    let best = { max: Infinity, cut: i + 1 };
    for (let j = i + 1; j <= n - (lines - 1); j++) {
      const mx = Math.max(lineWidth(i, j), solve(j, lines - 1).max);
      if (mx < best.max) best = { max: mx, cut: j };
    }
    memo.set(key, best);
    return best;
  };

  const result: number[][] = [];
  let i = 0;
  for (let l = lineCount; l >= 1; l--) {
    const cut = l === 1 ? n : solve(i, l).cut;
    result.push(range(i, cut));
    i = cut;
  }
  return result;
}

// ─── fitTextToViewport ──────────────────────────────────────────────────────

/**
 * Size, wrap, and position words to FILL the available space.
 *
 * All returned positions are ABSOLUTE canvas coordinates — ready to draw.
 * Text is centered horizontally. Vertically centered within the slot.
 *
 * THE WORDS ARE THE VIDEO. This function makes them as large as possible
 * while guaranteeing readability and preventing edge clipping.
 */
export function fitTextToViewport(
  ctx: MeasureContext,
  words: string[],
  canvasW: number,
  canvasH: number,
  fontFamily: string,
  fontWeight: number,
  options?: {
    /** Target width fill ratio (default 0.88) */
    targetFillRatio?: number;
    /** Max wrapped lines (default: auto from aspect ratio & word count) */
    maxLines?: number;
    /** Minimum font size in px (default 16) */
    minFontPx?: number;
    /** Slot to render within. If omitted, centers in full canvas. */
    slot?: Slot;
    /** Text transform (default 'none') */
    textTransform?: 'none' | 'uppercase';
    /**
     * Indices of words that will render at `heroScaleBoost` × base font size.
     * When provided, layout measures these words at their scaled width so lines
     * wrap correctly and line centering accounts for the scale bump.
     * Empty array or omitted = all words at base size.
     */
    heroWordIndices?: number[];
    /**
     * Scale multiplier applied to hero words at draw time.
     * Default 1.0 (no scaling). When a phrase has hero words, set this to
     * match the compiler's HERO_SCALE_BOOST (currently 1.15).
     */
    heroScaleBoost?: number;
    /**
     * @deprecated Use heroWordIndices + heroScaleBoost instead.
     * Kept for backwards compatibility — a boolean true is silently ignored
     * since it doesn't specify which word is the hero.
     */
    hasHeroWord?: boolean;
    /**
     * Per-phrase letter spacing (em) applied to every word at draw time.
     * Layout must reserve this width so letter-spaced words don't render wider
     * than their slots and collide with neighbors. Default 0.
     */
    letterSpacingEm?: number;
  },
): TextLayout {
  const targetFill = options?.targetFillRatio ?? 0.88;
  const isPortrait = canvasH > canvasW;
  const minFont = options?.minFontPx ?? 16;
  const slot = options?.slot ?? null;
  const transform = options?.textTransform ?? 'none';
  const letterSpacingEm = options?.letterSpacingEm ?? 0;
  // Keep deprecated option accepted for callsite compatibility.
  void options?.hasHeroWord;

  // Hero word handling. Words at `heroWordIndices` render at `heroScaleBoost × fontSize`
  // at draw time. For layout, we treat them as if they were wider at base size so
  // line wrap and centering produce correct positions when the scale bump is applied.
  const heroIndices = options?.heroWordIndices ?? [];
  const heroBoost = heroIndices.length > 0 ? (options?.heroScaleBoost ?? 1.0) : 1.0;
  const heroSet = heroIndices.length > 0 ? new Set(heroIndices) : null;

  // ── Available space ──
  const edgePad = Math.max(6, Math.round(canvasW * EDGE_PAD_RATIO));
  const availW = (canvasW - edgePad * 2) * targetFill;
  const layoutW = availW;

  const slotH = slot?.height ?? canvasH * 0.65;
  const slotCenterY = slot?.yCenter ?? canvasH * 0.5;
  const availH = slotH * 0.94; // small internal vertical padding

  // Apply text transform
  const displayWords = transform === 'uppercase'
    ? words.map(w => w.toUpperCase())
    : [...words];

  if (displayWords.length === 0) {
    return { fontSize: minFont, lines: [], wordPositions: [], totalHeight: 0 };
  }

  const buildFont = (size: number) => `${fontWeight} ${size}px "${fontFamily}", sans-serif`;

  // ── Max lines: more lines on portrait (use the height), fewer on landscape ──
  const autoMaxLines = options?.maxLines ?? (
    isPortrait
      ? Math.min(5, Math.max(2, displayWords.length))
      : Math.min(3, Math.max(1, displayWords.length))
  );

  // ── Measurement helpers ──
  const measureWord = (word: string, size: number): number => {
    ctx.font = buildFont(size);
    // Reserve letter-spacing width so slots match what the renderer draws.
    // Canvas adds letterSpacing after each glyph; word.length is a safe
    // (slightly over-reserving) approximation that prevents collisions.
    const lsExtra = letterSpacingEm !== 0 ? letterSpacingEm * size * word.length : 0;
    return ctx.measureText(word).width + lsExtra;
  };
  const measureWordByIndex = (wordIndex: number, word: string, size: number): number => {
    const w = measureWord(word, size);
    if (heroSet && heroSet.has(wordIndex)) return w * heroBoost;
    return w;
  };

  const getSpaceW = (size: number): number => {
    ctx.font = buildFont(size);
    const measured = ctx.measureText(' ').width;
    return Math.max(measured, size * MIN_GAP_EM);
  };

  // ── Choose the line count + font size that MAXIMISE size (fill the stage) ──
  // For a scalable font, word and line widths scale linearly with font size, so
  // we measure each word once at a reference size and, for every allowed line
  // count L, compute the largest font that fits both width and height:
  //   fontW = availW / (widest line at 1px)   fontH = availH / (L · lineHeight)
  //   font(L) = min(fontW, fontH, ceiling)
  // The L with the biggest font wins. This is what keeps a long word or a
  // multi-word phrase from shrinking more than necessary: it adds a line
  // (using the vertical space) instead of forcing a tiny width-bound font.
  const REF = 100;
  const unitW: number[] = [];
  for (let i = 0; i < displayWords.length; i++) {
    unitW.push(measureWordByIndex(i, displayWords[i], REF) / REF);
  }
  const spaceUnit = getSpaceW(REF) / REF;

  const maxFontCeiling = Math.min(availH * 0.85, availW * 0.9);

  const lineMaxUnit = (lines: number[][]): number => {
    let maxUnit = 0;
    for (const ln of lines) {
      let u = 0;
      for (let k = 0; k < ln.length; k++) {
        u += unitW[ln[k]];
        if (k < ln.length - 1) u += spaceUnit;
      }
      if (u > maxUnit) maxUnit = u;
    }
    return maxUnit;
  };

  let bestSize = minFont;
  let bestLines: number[][] = [[...Array(displayWords.length).keys()]];
  for (let L = 1; L <= autoMaxLines && L <= displayWords.length; L++) {
    const lines = splitIntoLines(unitW, spaceUnit, L);
    if (lines.length !== L) continue; // couldn't form exactly L lines
    const maxUnit = lineMaxUnit(lines);
    const fontW = maxUnit > 0 ? layoutW / maxUnit : maxFontCeiling;
    const fontH = availH / (L * LINE_HEIGHT);
    const font = Math.floor(Math.min(fontW, fontH, maxFontCeiling));
    // Strict '>' means ties keep the FEWER-line option (larger per-line text).
    if (font > bestSize) {
      bestSize = font;
      bestLines = lines;
    }
  }
  bestSize = Math.max(minFont, bestSize);

  const fontSize = bestSize;

  // ── Compute absolute positions ──
  ctx.font = buildFont(fontSize);
  const spaceW = getSpaceW(fontSize);
  const lineH = fontSize * LINE_HEIGHT;
  const totalHeight = bestLines.length * lineH;

  // Vertical: center the text block within the slot
  const blockTopY = slotCenterY - totalHeight / 2;

  const wordPositions: WordPosition[] = [];
  const lineStrings: string[] = [];
  let sourceIndex = 0;

  for (let li = 0; li < bestLines.length; li++) {
    const lineWordIndices = bestLines[li];
    const baselineY = blockTopY + (li + 0.7) * lineH; // 0.7 for baseline offset

    // Measure line width for centering.
    // Hero words are measured at scaled width so line wrap and centering
    // account for their render-time scale bump.
    const wordWidths: number[] = [];
    for (const wi of lineWordIndices) {
      wordWidths.push(measureWordByIndex(wi, displayWords[wi], fontSize));
    }
    let lineW = 0;
    for (let i = 0; i < wordWidths.length; i++) {
      lineW += wordWidths[i];
      if (i < wordWidths.length - 1) lineW += spaceW;
    }

    // Center horizontally in canvas
    let cursor = canvasW / 2 - lineW / 2;

    const lineWordTexts: string[] = [];
    for (let i = 0; i < lineWordIndices.length; i++) {
      const wi = lineWordIndices[i];
      const ww = wordWidths[i];
      const wordCenterX = cursor + ww / 2;

      wordPositions.push({
        lineIndex: li,
        wordIndexInLine: i,
        sourceIndex: wi,
        x: wordCenterX,
        y: baselineY,
        width: ww,
        text: displayWords[wi],
      });

      lineWordTexts.push(displayWords[wi]);
      cursor += ww + (i < lineWordIndices.length - 1 ? spaceW : 0);
    }

    lineStrings.push(lineWordTexts.join(' '));
  }

  return {
    fontSize,
    lines: lineStrings,
    wordPositions,
    totalHeight,
  };
}

// ─── computeSlots ───────────────────────────────────────────────────────────

/**
 * Divide the canvas into 3 non-overlapping vertical bands.
 *
 * The ACTIVE slot dominates — this is where the current phrase lives.
 * Exit and enter slots are smaller — departing/arriving phrases scale down
 * naturally because their slot is shorter (fitTextToViewport sizes to slot).
 *
 * THE WORDS ARE THE VIDEO — active slot is generous, not timid.
 *
 * Layout:
 *
 *   16:9 (landscape):                    9:16 (portrait):
 *
 *   ┌─────────────────────┐              ┌──────────────┐
 *   │ gap (4%)            │              │ gap (3%)     │
 *   ├─────────────────────┤              ├──────────────┤
 *   │ exit (11%)          │              │ exit (14%)   │
 *   ├─────────────────────┤              ├──────────────┤
 *   │                     │              │              │
 *   │ ACTIVE (65%)        │              │ ACTIVE (58%) │
 *   │ the main event      │              │ stacked text │
 *   │                     │              │ fills this   │
 *   ├─────────────────────┤              │              │
 *   │ enter (11%)         │              ├──────────────┤
 *   ├─────────────────────┤              │ enter (14%)  │
 *   │ gap (9%)            │              ├──────────────┤
 *   └─────────────────────┘              │ gap (11%)    │
 *                                        └──────────────┘
 *
 *   Bottom gap is larger — leaves room for UI overlays (progress bar, controls).
 */
export function computeSlots(canvasW: number, canvasH: number): [Slot, Slot, Slot] {
  const isPortrait = canvasH > canvasW;

  // Proportions — active slot gets the lion's share
  const topGap = canvasH * (isPortrait ? 0.03 : 0.04);
  const exitH = canvasH * (isPortrait ? 0.14 : 0.11);
  const activeH = canvasH * (isPortrait ? 0.58 : 0.65);
  const enterH = canvasH * (isPortrait ? 0.14 : 0.11);
  // Bottom gap = remainder (portrait: 11%, landscape: 9%)

  const exitTop = topGap;
  const exitBottom = exitTop + exitH;
  const activeTop = exitBottom;
  const activeBottom = activeTop + activeH;
  const enterTop = activeBottom;
  const enterBottom = enterTop + enterH;

  return [
    {
      id: 0,
      yTop: exitTop,
      yBottom: exitBottom,
      yCenter: (exitTop + exitBottom) / 2,
      height: exitH,
    },
    {
      id: 1,
      yTop: activeTop,
      yBottom: activeBottom,
      yCenter: (activeTop + activeBottom) / 2,
      height: activeH,
    },
    {
      id: 2,
      yTop: enterTop,
      yBottom: enterBottom,
      yCenter: (enterTop + enterBottom) / 2,
      height: enterH,
    },
  ];
}

// ─── assignGroupToSlot ──────────────────────────────────────────────────────

/**
 * Determine which slot a phrase occupies and its visual properties.
 *
 * Lifecycle:
 *   before entryStart           → not visible (null)
 *   entryStart → groupStart     → ENTER slot, alpha fades in
 *   groupStart → groupEnd       → ACTIVE slot, full alpha
 *   groupEnd → exitEnd          → EXIT slot, alpha fades out
 *   after exitEnd               → not visible (null)
 *
 * Phrases in different slots CANNOT overlap vertically — guaranteed by computeSlots.
 */
export function assignGroupToSlot(
  groupStart: number,
  groupEnd: number,
  entryDuration: number,
  exitDuration: number,
  currentTime: number,
  slots: [Slot, Slot, Slot],
): SlotAssignment | null {
  const entryStart = groupStart - entryDuration;
  const exitEnd = groupEnd + exitDuration;

  // Not visible
  if (currentTime < entryStart || currentTime > exitEnd) return null;

  // Entering — bottom slot, fading in
  if (currentTime < groupStart) {
    const progress = (currentTime - entryStart) / Math.max(0.001, entryDuration);
    const t = Math.max(0, Math.min(1, progress));
    // Ease-out cubic for smooth entry
    const eased = 1 - Math.pow(1 - t, 3);
    return {
      slotId: 2,
      alpha: eased,
      scale: 0.88 + 0.12 * eased,
      slot: slots[2],
    };
  }

  // Active — center slot, full presence
  if (currentTime <= groupEnd) {
    return {
      slotId: 1,
      alpha: 1.0,
      scale: 1.0,
      slot: slots[1],
    };
  }

  // Exiting — top slot, fading out
  const progress = (currentTime - groupEnd) / Math.max(0.001, exitDuration);
  const t = Math.max(0, Math.min(1, progress));
  // Ease-in cubic for clean exit
  const eased = 1 - Math.pow(t, 3);
  return {
    slotId: 0,
    alpha: eased,
    scale: 0.88 + 0.12 * eased,
    slot: slots[0],
  };
}
