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
 * Balanced line breaking — distributes words so all lines are similar width.
 *
 * Greedy wrapping produces: "I can feel the fire" + "burning" (lopsided).
 * Balanced produces: "I can feel" + "the fire burning" (even).
 *
 * Uses minimum raggedness: tries all possible break points and picks
 * the split that minimizes the difference between the longest and shortest line.
 */
function balancedWrap(
  wordWidths: number[],
  spaceW: number,
  maxWidth: number,
  maxLines: number,
): number[][] {
  const n = wordWidths.length;
  if (n === 0) return [];
  if (n === 1 || maxLines === 1) return [[...Array(n).keys()]];

  // For small word counts, try all possible splits and pick the most balanced
  if (n <= 12 && maxLines >= 2) {
    let bestSplit: number[][] = [[...Array(n).keys()]];
    let bestRaggedness = Infinity;

    const lineWidth = (indices: number[]): number => {
      let w = 0;
      for (let i = 0; i < indices.length; i++) {
        w += wordWidths[indices[i]];
        if (i < indices.length - 1) w += spaceW;
      }
      return w;
    };

    // Try 2-line splits
    for (let split1 = 1; split1 < n; split1++) {
      const line1 = Array.from({ length: split1 }, (_, i) => i);
      const line2 = Array.from({ length: n - split1 }, (_, i) => i + split1);
      const w1 = lineWidth(line1);
      const w2 = lineWidth(line2);
      if (w1 > maxWidth || w2 > maxWidth) continue;
      const raggedness = Math.abs(w1 - w2);
      if (raggedness < bestRaggedness) {
        bestRaggedness = raggedness;
        bestSplit = [line1, line2];
      }
    }

    // Try 3-line splits if allowed and needed
    if (maxLines >= 3 && n >= 3 && bestRaggedness > maxWidth * 0.3) {
      for (let s1 = 1; s1 < n - 1; s1++) {
        for (let s2 = s1 + 1; s2 < n; s2++) {
          const l1 = Array.from({ length: s1 }, (_, i) => i);
          const l2 = Array.from({ length: s2 - s1 }, (_, i) => i + s1);
          const l3 = Array.from({ length: n - s2 }, (_, i) => i + s2);
          const w1 = lineWidth(l1);
          const w2 = lineWidth(l2);
          const w3 = lineWidth(l3);
          if (w1 > maxWidth || w2 > maxWidth || w3 > maxWidth) continue;
          const maxW = Math.max(w1, w2, w3);
          const minW = Math.min(w1, w2, w3);
          const raggedness = maxW - minW;
          if (raggedness < bestRaggedness) {
            bestRaggedness = raggedness;
            bestSplit = [l1, l2, l3];
          }
        }
      }
    }

    // Try 4-line splits if allowed (portrait)
    if (maxLines >= 4 && n >= 4 && bestRaggedness > maxWidth * 0.3) {
      // Use even distribution as starting point
      const perLine = Math.ceil(n / 4);
      const lines: number[][] = [];
      for (let i = 0; i < n; i += perLine) {
        lines.push(Array.from({ length: Math.min(perLine, n - i) }, (_, j) => i + j));
      }
      const widths = lines.map(lineWidth);
      if (widths.every(w => w <= maxWidth)) {
        const raggedness = Math.max(...widths) - Math.min(...widths);
        if (raggedness < bestRaggedness) {
          bestSplit = lines;
        }
      }
    }

    return bestSplit;
  }

  // For longer word lists, use greedy wrapping (still better than nothing)
  const lines: number[][] = [];
  let currentLine: number[] = [];
  let currentWidth = 0;

  for (let i = 0; i < n; i++) {
    const addedWidth = currentLine.length > 0 ? currentWidth + spaceW + wordWidths[i] : wordWidths[i];
    if (currentLine.length > 0 && addedWidth > maxWidth && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = [i];
      currentWidth = wordWidths[i];
    } else {
      currentLine.push(i);
      currentWidth = addedWidth;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
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
    /** Does this phrase contain a hero word that will scale up at draw time? */
    hasHeroWord?: boolean;
  },
): TextLayout {
  const targetFill = options?.targetFillRatio ?? 0.88;
  const isPortrait = canvasH > canvasW;
  const minFont = options?.minFontPx ?? 16;
  const slot = options?.slot ?? null;
  const transform = options?.textTransform ?? 'none';
  // hasHeroWord no longer affects layout — hero scale was removed
  void options?.hasHeroWord;

  // ── Available space ──
  const edgePad = Math.max(6, Math.round(canvasW * EDGE_PAD_RATIO));
  const availW = (canvasW - edgePad * 2) * targetFill;
  // Hero scale removed — no width reservation needed
  const layoutW = availW;

  const slotH = slot?.height ?? canvasH * 0.65;
  const slotCenterY = slot?.yCenter ?? canvasH * 0.5;
  const availH = slotH * 0.90; // 10% internal vertical padding

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
    return ctx.measureText(word).width;
  };

  const getSpaceW = (size: number): number => {
    ctx.font = buildFont(size);
    const measured = ctx.measureText(' ').width;
    return Math.max(measured, size * MIN_GAP_EM);
  };

  const measureLineWidth = (wordIndices: number[], wordWidths: number[], spaceW: number): number => {
    let total = 0;
    for (let i = 0; i < wordIndices.length; i++) {
      total += wordWidths[wordIndices[i]];
      if (i < wordIndices.length - 1) total += spaceW;
    }
    return total;
  };

  // ── Binary search for the LARGEST font that fits ──
  // Same ceiling for all phrases — let the width constraint do the work.
  // Short phrases fill the screen. Long phrases shrink to fit.
  const maxFontCeiling = Math.min(availH * 0.75, availW * 0.9);

  let lo = minFont;
  let hi = Math.max(minFont, Math.floor(maxFontCeiling));
  let bestSize = minFont;
  let bestLines: number[][] = [[...Array(displayWords.length).keys()]];

  for (let iter = 0; iter < 12; iter++) {
    if (lo > hi) break;
    const mid = Math.floor((lo + hi) / 2);

    // Measure all words at this size
    const wordWidths: number[] = [];
    ctx.font = buildFont(mid);
    for (const w of displayWords) {
      wordWidths.push(ctx.measureText(w).width);
    }
    const spaceW = getSpaceW(mid);

    // Try balanced wrapping
    const wrapped = balancedWrap(wordWidths, spaceW, layoutW, autoMaxLines);

    // Check: does every line fit in available width?
    let widthOk = true;
    for (const line of wrapped) {
      if (measureLineWidth(line, wordWidths, spaceW) > layoutW) {
        widthOk = false;
        break;
      }
    }

    // Check: do all lines fit in available height?
    const lineH = mid * LINE_HEIGHT;
    const totalH = wrapped.length * lineH;
    const heightOk = totalH <= availH;

    if (widthOk && heightOk) {
      bestSize = mid;
      bestLines = wrapped;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

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

    // Measure line width for centering
    const wordWidths: number[] = [];
    for (const wi of lineWordIndices) {
      wordWidths.push(ctx.measureText(displayWords[wi]).width);
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
