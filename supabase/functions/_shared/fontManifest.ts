/**
 * fontManifest.ts — edge-side font database + selection logic.
 *
 * Canonical data for font SELECTION (not just validation). Mirrors the
 * attribute set of src/lib/typographyManifest.ts.
 *
 * SYNC REQUIREMENT: the font names + core attributes here must match
 * src/lib/typographyManifest.ts. Kept as a separate copy because this file
 * runs in Deno (edge) and that one runs in Vite (browser); a single import
 * across that boundary isn't clean. When you add/remove/retune a font, edit
 * BOTH files.
 *
 * Everything the edge function needs is DERIVED from FONT_MANIFEST below:
 *   - VALID_FONTS (validation list)
 *   - the FONT LIST prompt text (buildFontListPrompt)
 *   - the per-song shortlist (scoreFonts)
 *   - case + base weight (pickCase / pickBaseWeight)
 *   - fallback repair (nearestFont)
 */

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
  vibe: string;
}

export const FONT_MANIFEST: EdgeFontDef[] = [
  { name: "Bebas Neue", category: "display", weights: [400], energy: "high", elegance: "low", warmth: "low", width: "condensed", casePreference: ["uppercase"], genreFit: ["hip-hop", "rock", "trap", "anthem", "trailer"], vibe: "bold movie poster" },
  { name: "Permanent Marker", category: "handwriting", weights: [400], energy: "high", elegance: "low", warmth: "medium", width: "normal", casePreference: ["sentence", "uppercase"], genreFit: ["punk", "rock", "indie", "spoken-word"], vibe: "raw sharpie" },
  { name: "Unbounded", category: "display", weights: [400, 700, 900], energy: "high", elegance: "medium", warmth: "low", width: "normal", casePreference: ["uppercase", "sentence"], genreFit: ["electronic", "hyperpop", "futuristic", "experimental"], vibe: "album cover display" },
  { name: "Dela Gothic One", category: "display", weights: [400], energy: "high", elegance: "low", warmth: "low", width: "normal", casePreference: ["uppercase"], genreFit: ["metal", "dark-trap", "gothic", "industrial"], vibe: "dark gothic weight" },
  { name: "Oswald", category: "condensed", weights: [400, 700], energy: "high", elegance: "low", warmth: "low", width: "condensed", casePreference: ["uppercase"], genreFit: ["hip-hop", "news", "editorial", "sport"], vibe: "tall authority" },
  { name: "Barlow Condensed", category: "condensed", weights: [400, 600, 800], energy: "high", elegance: "low", warmth: "low", width: "condensed", casePreference: ["uppercase"], genreFit: ["industrial", "electronic", "techno"], vibe: "industrial precision" },
  { name: "Archivo", category: "condensed", weights: [400, 600, 700, 800], energy: "high", elegance: "low", warmth: "low", width: "normal", casePreference: ["uppercase", "sentence"], genreFit: ["rap", "grime", "drill", "tech"], vibe: "tech muscle" },
  { name: "Montserrat", category: "sans", weights: [400, 600, 700, 800], energy: "medium", elegance: "medium", warmth: "medium", width: "normal", casePreference: ["sentence", "uppercase"], genreFit: ["pop", "general"], vibe: "clean default" },
  { name: "Inter", category: "sans", weights: [300, 400, 700], energy: "medium", elegance: "medium", warmth: "low", width: "normal", casePreference: ["sentence"], genreFit: ["indie", "ambient", "minimal"], vibe: "invisible, words only" },
  { name: "Sora", category: "sans", weights: [400, 600, 700], energy: "medium", elegance: "medium", warmth: "low", width: "normal", casePreference: ["sentence", "uppercase"], genreFit: ["k-pop", "j-pop", "synth-pop", "new-gen"], vibe: "soft modern" },
  { name: "Rubik", category: "sans", weights: [400, 500, 700], energy: "medium", elegance: "low", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["pop", "funk", "afrobeat"], vibe: "rounded friendly" },
  { name: "Nunito", category: "sans", weights: [400, 600], energy: "low", elegance: "low", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["lullaby", "children", "gentle", "acoustic"], vibe: "pillowy soft" },
  { name: "Plus Jakarta Sans", category: "sans", weights: [400, 600, 800], energy: "medium", elegance: "medium", warmth: "medium", width: "normal", casePreference: ["sentence"], genreFit: ["r-and-b", "neo-soul", "contemporary"], vibe: "warm contemporary" },
  { name: "Bricolage Grotesque", category: "sans", weights: [400, 700, 800], energy: "medium", elegance: "low", warmth: "medium", width: "normal", casePreference: ["sentence"], genreFit: ["indie", "alternative", "art-pop"], vibe: "indie quirky" },
  { name: "Playfair Display", category: "serif", weights: [400, 500, 700], energy: "medium", elegance: "high", warmth: "medium", width: "normal", casePreference: ["sentence"], genreFit: ["r-and-b", "soul", "jazz", "cinematic"], vibe: "editorial drama" },
  { name: "EB Garamond", category: "serif", weights: [400, 600, 700], energy: "low", elegance: "high", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["folk", "classical", "singer-songwriter", "poetry"], vibe: "literary warmth" },
  { name: "Cormorant Garamond", category: "serif", weights: [400, 600], energy: "low", elegance: "high", warmth: "medium", width: "normal", casePreference: ["sentence"], genreFit: ["orchestral", "ambient", "art-song", "film-score"], vibe: "whispered elegance" },
  { name: "DM Serif Display", category: "serif", weights: [400], energy: "medium", elegance: "high", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["soul", "gospel", "r-and-b", "blues"], vibe: "editorial confidence" },
  { name: "Instrument Serif", category: "serif", weights: [400], energy: "low", elegance: "high", warmth: "medium", width: "normal", casePreference: ["sentence"], genreFit: ["classical", "chamber", "art-song", "poetry"], vibe: "poetry elegance" },
  { name: "Bitter", category: "serif", weights: [400, 700], energy: "medium", elegance: "medium", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["country", "americana", "folk-rock"], vibe: "slab storytelling" },
  { name: "JetBrains Mono", category: "mono", weights: [400, 500, 700], energy: "low", elegance: "low", warmth: "low", width: "normal", casePreference: ["uppercase", "sentence"], genreFit: ["electronic", "glitch", "techno", "cyberpunk"], vibe: "hacker voice" },
  { name: "Space Mono", category: "mono", weights: [400, 700], energy: "medium", elegance: "low", warmth: "low", width: "normal", casePreference: ["uppercase"], genreFit: ["retro-wave", "synthwave", "sci-fi", "analog"], vibe: "retro-futuristic" },
  { name: "Caveat", category: "handwriting", weights: [400, 700], energy: "low", elegance: "low", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["singer-songwriter", "diary", "confessional", "indie-folk"], vibe: "handwritten diary" },
  { name: "Lexend", category: "sans", weights: [300, 400, 700], energy: "low", elegance: "medium", warmth: "high", width: "normal", casePreference: ["sentence"], genreFit: ["lo-fi", "chill", "ambient", "meditation"], vibe: "calm clarity" },
];

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
  // Energy alignment: 1 when the font's energy sits on the song's intensity.
  const energyFit = 1 - Math.abs(TRI_NUM[font.energy] - x);

  // Genre overlap: any hint that matches a genreFit tag.
  const genreFit = f.genreHints.some((h) =>
    font.genreFit.some((g) => g.includes(h) || h.includes(g)),
  ) ? 1 : 0;

  // Reward fonts with weight range for expressive (high-energy) songs.
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

  // Fill remaining slots with the best font from categories not yet present.
  for (const { font } of ranked) {
    if (picked.length >= size) break;
    if (picked.includes(font)) continue;
    if (seenCats.has(font.category)) continue;
    picked.push(font);
    seenCats.add(font.category);
  }
  // Top up with next-best if categories ran out.
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
  // If the font is single-weight, the keyword is cosmetic; resolver clamps anyway.
  return target;
}

/**
 * Repair an invalid/hallucinated font name to the nearest real font by
 * category + width + energy, rather than collapsing to the boring default.
 */
export function nearestFont(name: string, f: SongFeatures): EdgeFontDef {
  const exact = findFont(name);
  if (exact) return exact;

  // Guess the intended category from the raw string, then score by fit.
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
