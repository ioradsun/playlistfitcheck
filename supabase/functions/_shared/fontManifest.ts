/**
 * fontManifest.ts — edge-side font selection logic.
 *
 * Font DATA lives in ./fontManifest.data.json — the single source of truth
 * shared with src/lib/typographyManifest.ts. This file only holds the
 * selection / scoring / repair logic the edge function needs.
 *
 * To add or retune a font: edit fontManifest.data.json (and index.html's
 * Google Fonts URL for the browser side).
 */

import rawManifest from "./fontManifest.data.json" with { type: "json" };

export type FontCategory =
  | "display" | "condensed" | "sans" | "serif" | "mono" | "handwriting";
export type Tri = "low" | "medium" | "high";
export type CaseChoice = "uppercase" | "sentence";

export interface EdgeFontDef {
  name: string;
  category: FontCategory;
  weights: number[];
  energy: Tri;
  elegance: Tri;
  warmth: Tri;
  width: "condensed" | "normal";
  casePreference: CaseChoice[];
  genreFit: string[];
  /** Short label used by the AI prompt. */
  vibe: string;
}

// Project the JSON into the edge shape (uses `promptVibe` as the compact vibe).
export const FONT_MANIFEST: EdgeFontDef[] = (rawManifest as Array<{
  name: string;
  category: FontCategory;
  weights: number[];
  energy: Tri;
  elegance: Tri;
  warmth: Tri;
  width: "condensed" | "normal";
  casePreference: CaseChoice[];
  genreFit: string[];
  vibe: string;
  promptVibe: string;
}>).map((f) => ({
  name: f.name,
  category: f.category,
  weights: f.weights,
  energy: f.energy,
  elegance: f.elegance,
  warmth: f.warmth,
  width: f.width,
  casePreference: f.casePreference,
  genreFit: f.genreFit,
  vibe: f.promptVibe || f.vibe,
}));

export const VALID_FONTS: string[] = FONT_MANIFEST.map((f) => f.name);

const TRI_NUM: Record<Tri, number> = { low: 0.2, medium: 0.5, high: 0.85 };

export function findFont(name: string): EdgeFontDef | undefined {
  const n = name.trim().toLowerCase();
  return FONT_MANIFEST.find((f) => f.name.toLowerCase() === n);
}

/** Song-level signal available BEFORE the AI call (mood is decided later). */
export interface SongFeatures {
  /** 0..1 aggregate loudness/drive across sections. */
  energy: number;
  /** Beats per minute, 0 if unknown. */
  bpm: number;
  /** Free-text genre hints (title/artist/direction words), lowercased. */
  genreHints: string[];
}

/**
 * Effective intensity 0..1 — energy nudged by tempo. Fast songs read as
 * higher-energy typographically even at modest measured loudness.
 */
function intensity(f: SongFeatures): number {
  let x = f.energy;
  if (f.bpm >= 140) x += 0.1;
  else if (f.bpm > 0 && f.bpm < 80) x -= 0.1;
  return Math.max(0, Math.min(1, x));
}

/**
 * Score a font 0..1 for a song. Energy fit dominates; genre overlap and a
 * small tempo-driven weight-range bonus refine it.
 */
export function scoreFont(font: EdgeFontDef, f: SongFeatures): number {
  const x = intensity(f);
  const energyFit = 1 - Math.abs(TRI_NUM[font.energy] - x);
  const genreFit = f.genreHints.some((h) =>
    font.genreFit.some((g) => g.includes(h) || h.includes(g)),
  ) ? 1 : 0;
  const rangeBonus = x > 0.6 && font.weights.length >= 3 ? 1 : 0;
  return 0.6 * energyFit + 0.3 * genreFit + 0.1 * rangeBonus;
}

/**
 * Build a shortlist for the AI: the best-fitting fonts, plus a couple of
 * cross-category "wildcards" so the model keeps tonal range instead of being
 * handed eight near-identical loud display faces.
 */
export function shortlistFonts(f: SongFeatures, size = 8): EdgeFontDef[] {
  const ranked = [...FONT_MANIFEST]
    .map((font) => ({ font, s: scoreFont(font, f) }))
    .sort((a, b) => b.s - a.s);

  const core = Math.max(3, size - 3);
  const picked: EdgeFontDef[] = ranked.slice(0, core).map((r) => r.font);
  const seenCats = new Set(picked.map((p) => p.category));

  for (const { font } of ranked) {
    if (picked.length >= size) break;
    if (picked.includes(font)) continue;
    if (seenCats.has(font.category)) continue;
    picked.push(font);
    seenCats.add(font.category);
  }
  for (const { font } of ranked) {
    if (picked.length >= size) break;
    if (!picked.includes(font)) picked.push(font);
  }
  return picked;
}

/** Render the shortlist as the FONT LIST block for the prompt. */
export function buildFontListPrompt(fonts: EdgeFontDef[]): string {
  return fonts.map((f) => `  ${f.name} — ${f.vibe}`).join("\n");
}

/**
 * Case for the base plan. High-energy songs lean uppercase when the font
 * allows it; otherwise honor the font's own first case preference.
 */
export function pickCase(font: EdgeFontDef, energy: number): CaseChoice {
  const prefersUpper = font.casePreference.includes("uppercase");
  const uppercaseOnly = font.casePreference.length === 1 && prefersUpper;
  if (uppercaseOnly) return "uppercase";
  if (energy > 0.65 && prefersUpper) return "uppercase";
  return font.casePreference[0] ?? "sentence";
}

/** Base weight target keyword from energy, clamped to what the font offers. */
export function pickBaseWeight(font: EdgeFontDef, energy: number): "light" | "regular" | "bold" | "black" {
  const target = energy > 0.7 ? "black" : energy > 0.4 ? "bold" : energy > 0.2 ? "regular" : "light";
  return target;
}

/**
 * Repair an invalid/hallucinated font name to the nearest real font by
 * category + width + energy, rather than collapsing to the boring default.
 */
export function nearestFont(name: string, f: SongFeatures): EdgeFontDef {
  const exact = findFont(name);
  if (exact) return exact;

  const lower = name.toLowerCase();
  const catHint: FontCategory | null =
    /serif|garamond|playfair/.test(lower) ? "serif" :
    /mono|code/.test(lower) ? "mono" :
    /condensed|narrow|compressed/.test(lower) ? "condensed" :
    /script|hand|marker|caveat/.test(lower) ? "handwriting" :
    /display|black|heavy|gothic/.test(lower) ? "display" : null;

  const ranked = [...FONT_MANIFEST]
    .map((font) => ({
      font,
      s: scoreFont(font, f) + (catHint && font.category === catHint ? 0.5 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  return ranked[0].font;
}
