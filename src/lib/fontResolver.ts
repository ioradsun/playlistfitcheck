/**
 * fontResolver — Three-layer typography system.
 *
 * Layer 1: AI emotional profile (force, intimacy, polish, theatricality, era)
 * Layer 2: Derive structural traits (family, width, weight, case, tracking)
 * Layer 3: Score individual fonts (one family for all words)
 *
 * All fonts are already loaded in index.html. No new fonts without updating index.html.
 */

// ═══ Layer 1: Emotional profile from AI ═══

export interface FontProfile {
  force: 'low' | 'medium' | 'high';
  intimacy: 'low' | 'medium' | 'high';
  polish: 'raw' | 'clean' | 'elegant';
  theatricality: 'low' | 'medium' | 'high';
  era: 'timeless' | 'modern' | 'futuristic';
}

// ═══ Layer 2: Derived structural traits ═══

interface StructuralTraits {
  family: 'serif' | 'sans' | 'mono' | 'display';
  width: 'condensed' | 'normal';
  weight: 'light' | 'regular' | 'bold' | 'black';
  displayCase: 'uppercase' | 'sentence';
  tracking: 'tight' | 'normal' | 'wide';
}

function deriveStructuralTraits(profile: FontProfile): StructuralTraits {
  const { force, intimacy, polish, theatricality, era } = profile;

  let family: StructuralTraits['family'] = 'sans';
  if (era === 'futuristic' || (polish === 'raw' && intimacy === 'low')) family = 'mono';
  else if (polish === 'elegant' && (era === 'timeless' || intimacy !== 'low')) family = 'serif';
  else if (theatricality === 'high' && force === 'high') family = 'display';

  let width: StructuralTraits['width'] = 'normal';
  if (force === 'high' && intimacy === 'low') width = 'condensed';
  if (theatricality === 'high' && force !== 'low') width = 'condensed';

  let weight: StructuralTraits['weight'] = 'regular';
  if (force === 'high' && theatricality === 'high') weight = 'black';
  else if (force === 'high') weight = 'bold';
  else if (force === 'low' && intimacy === 'high') weight = 'light';

  let displayCase: StructuralTraits['displayCase'] = 'sentence';
  if (force === 'high' || theatricality === 'high') displayCase = 'uppercase';
  if (family === 'mono') {
    displayCase = 'uppercase';
  }

  let tracking: StructuralTraits['tracking'] = 'normal';
  if (width === 'condensed') tracking = 'tight';
  if (intimacy === 'high' && force === 'low') tracking = 'wide';
  if (era === 'futuristic') tracking = 'wide';

  return { family, width, weight, displayCase, tracking };
}

// ═══ Layer 3: Font library + pair scoring ═══

export interface ResolvedTypography {
  fontFamily: string;
  fontWeight: number;
  heroWeight: number;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
}

interface FontEntry {
  name: string;
  cssFamily: string;
  family: 'serif' | 'sans' | 'mono' | 'display' | 'handwriting';
  width: 'condensed' | 'normal';
  weights: number[];
  force: 'low' | 'medium' | 'high';
  intimacy: 'low' | 'medium' | 'high';
  polish: 'raw' | 'clean' | 'elegant';
  usable: boolean;
}

const FONT_LIBRARY: FontEntry[] = [
  { name: 'Bebas Neue', cssFamily: '"Bebas Neue", sans-serif', family: 'display', width: 'condensed', weights: [400], force: 'high', intimacy: 'low', polish: 'raw', usable: true },
  { name: 'Oswald', cssFamily: '"Oswald", sans-serif', family: 'sans', width: 'condensed', weights: [400, 700], force: 'high', intimacy: 'low', polish: 'clean', usable: true },
  { name: 'Barlow Condensed', cssFamily: '"Barlow Condensed", sans-serif', family: 'sans', width: 'condensed', weights: [400, 600, 800], force: 'high', intimacy: 'low', polish: 'clean', usable: true },
  { name: 'Montserrat', cssFamily: '"Montserrat", sans-serif', family: 'sans', width: 'normal', weights: [400, 600, 700, 800], force: 'medium', intimacy: 'medium', polish: 'clean', usable: true },
  { name: 'Inter', cssFamily: '"Inter", sans-serif', family: 'sans', width: 'normal', weights: [300, 400, 700], force: 'medium', intimacy: 'medium', polish: 'clean', usable: true },
  { name: 'Nunito', cssFamily: '"Nunito", sans-serif', family: 'sans', width: 'normal', weights: [400, 600], force: 'low', intimacy: 'high', polish: 'clean', usable: true },
  { name: 'Playfair Display', cssFamily: '"Playfair Display", serif', family: 'serif', width: 'normal', weights: [400, 500, 700], force: 'medium', intimacy: 'medium', polish: 'elegant', usable: true },
  { name: 'EB Garamond', cssFamily: '"EB Garamond", serif', family: 'serif', width: 'normal', weights: [400, 600, 700], force: 'low', intimacy: 'high', polish: 'elegant', usable: true },
  { name: 'Cormorant Garamond', cssFamily: '"Cormorant Garamond", serif', family: 'serif', width: 'normal', weights: [400, 600], force: 'low', intimacy: 'high', polish: 'elegant', usable: true },
  { name: 'JetBrains Mono', cssFamily: '"JetBrains Mono", monospace', family: 'mono', width: 'normal', weights: [400, 500, 700], force: 'low', intimacy: 'low', polish: 'raw', usable: true },
  { name: 'Space Mono', cssFamily: '"Space Mono", monospace', family: 'mono', width: 'normal', weights: [400, 700], force: 'medium', intimacy: 'low', polish: 'raw', usable: true },
  { name: 'Caveat', cssFamily: '"Caveat", cursive', family: 'handwriting', width: 'normal', weights: [400, 700], force: 'low', intimacy: 'high', polish: 'raw', usable: true },
  // ── New: fills raw sans gaps ──
  { name: 'Archivo', cssFamily: '"Archivo", sans-serif', family: 'sans', width: 'normal', weights: [400, 600, 700, 800], force: 'high', intimacy: 'low', polish: 'raw', usable: true },
  { name: 'Rubik', cssFamily: '"Rubik", sans-serif', family: 'sans', width: 'normal', weights: [400, 500, 700], force: 'medium', intimacy: 'medium', polish: 'raw', usable: true },
  { name: 'Sora', cssFamily: '"Sora", sans-serif', family: 'sans', width: 'normal', weights: [400, 600, 700], force: 'medium', intimacy: 'low', polish: 'clean', usable: true },
  { name: 'Bitter', cssFamily: '"Bitter", serif', family: 'serif', width: 'normal', weights: [400, 700], force: 'medium', intimacy: 'medium', polish: 'raw', usable: true },
  { name: 'Permanent Marker', cssFamily: '"Permanent Marker", cursive', family: 'handwriting', width: 'normal', weights: [400], force: 'high', intimacy: 'medium', polish: 'raw', usable: true },
];

function emotionalScore(font: FontEntry, profile: FontProfile): number {
  let score = 0;
  if (font.force === profile.force) score += 20;
  else if (Math.abs(['low', 'medium', 'high'].indexOf(font.force) - ['low', 'medium', 'high'].indexOf(profile.force)) === 1) score += 8;

  if (font.intimacy === profile.intimacy) score += 20;
  else if (Math.abs(['low', 'medium', 'high'].indexOf(font.intimacy) - ['low', 'medium', 'high'].indexOf(profile.intimacy)) === 1) score += 8;

  if (font.polish === profile.polish) score += 15;
  else if ((font.polish === 'clean' && profile.polish !== 'elegant') || (font.polish === 'raw' && profile.polish !== 'elegant')) score += 5;
  return score;
}

function structuralScore(font: FontEntry, traits: StructuralTraits): number {
  let score = 0;
  if (font.family === traits.family) score += 25;
  else if (traits.family === 'display' && (font.family === 'sans' || font.family === 'handwriting')) score += 8;
  if (font.width === traits.width) score += 15;
  return score;
}

function pickWeight(font: FontEntry, target: StructuralTraits['weight']): number {
  const map: Record<string, number> = { light: 300, regular: 400, bold: 700, black: 800 };
  const t = map[target] ?? 600;
  return font.weights.reduce((best, w) => (Math.abs(w - t) < Math.abs(best - t) ? w : best), font.weights[0]);
}

function pickHeroWeight(font: FontEntry, baseWeight: number): number {
  const heavier = font.weights.filter(w => w > baseWeight).sort((a, b) => a - b);
  if (heavier.length > 0) return heavier[0];
  return font.weights.reduce((best, w) => (Math.abs(w - baseWeight) < Math.abs(best - baseWeight) ? w : best), font.weights[0]);
}

export function resolveTypography(profile: FontProfile): ResolvedTypography {
  const traits = deriveStructuralTraits(profile);

  // Score every font against the emotional profile + structural traits
  const scored = FONT_LIBRARY
    .map(font => ({ font, score: emotionalScore(font, profile) + structuralScore(font, traits) }))
    .filter(s => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.font ?? FONT_LIBRARY.find(f => f.name === 'Montserrat')!;

  const trackingMap: Record<string, number> = { tight: 0.35, normal: 0.2, wide: 0.4 };
  const baseWeight = pickWeight(best, traits.weight);
  const heroW = pickHeroWeight(best, baseWeight);

  return {
    fontFamily: best.cssFamily,
    fontWeight: baseWeight,
    heroWeight: heroW,
    textTransform: traits.displayCase === 'uppercase' ? 'uppercase' : 'none',
    letterSpacing: trackingMap[traits.tracking] ?? 0.2,
  };
}

const LEGACY_PROFILES: Record<string, FontProfile> = {
  'bold-impact': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'high', era: 'modern' },
  'clean-modern': { force: 'medium', intimacy: 'medium', polish: 'clean', theatricality: 'low', era: 'modern' },
  'elegant-serif': { force: 'medium', intimacy: 'medium', polish: 'elegant', theatricality: 'medium', era: 'timeless' },
  'raw-condensed': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'medium', era: 'modern' },
  'whisper-soft': { force: 'low', intimacy: 'high', polish: 'clean', theatricality: 'low', era: 'modern' },
  'tech-mono': { force: 'low', intimacy: 'low', polish: 'raw', theatricality: 'low', era: 'futuristic' },
  'display-heavy': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'high', era: 'modern' },
  'editorial-light': { force: 'low', intimacy: 'high', polish: 'elegant', theatricality: 'low', era: 'timeless' },
};

export function resolveTypographyFromDirection(cd: any): ResolvedTypography {
  if (cd?.fontProfile && typeof cd.fontProfile === 'object') {
    const fp = cd.fontProfile;
    const levels = ['low', 'medium', 'high'];
    const polishes = ['raw', 'clean', 'elegant'];
    const eras = ['timeless', 'modern', 'futuristic'];
    const profile: FontProfile = {
      force: levels.includes(fp.force) ? fp.force : 'medium',
      intimacy: levels.includes(fp.intimacy) ? fp.intimacy : 'medium',
      polish: polishes.includes(fp.polish) ? fp.polish : 'clean',
      theatricality: levels.includes(fp.theatricality) ? fp.theatricality : 'low',
      era: eras.includes(fp.era) ? fp.era : 'modern',
    };
    return resolveTypography(profile);
  }

  const typoKey = typeof cd?.typography === 'string' ? cd.typography : 'clean-modern';
  const profile = LEGACY_PROFILES[typoKey] ?? LEGACY_PROFILES['clean-modern'];
  return resolveTypography(profile);
}

export function getFontNamesForPreload(resolved: ResolvedTypography): string[] {
  const name = resolved.fontFamily.replace(/"/g, '').split(',')[0].trim();
  return [name];
}
