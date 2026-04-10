/**
 * fontResolver.ts — 4-layer typography resolver.
 *
 * Layer 1: Use AI's typographyPlan directly if valid
 * Layer 2: Repair invalid choices (unknown fonts, weak pairs, bad combos)
 * Layer 3: Derive concrete rendering tokens
 * Layer 4: Fallback to legacy profile-based scoring
 */

import {
  FONT_MANIFEST,
  findFont,
  isValidPair,
  findBestAccent,
  pairingContrastScore,
  type FontDef,
} from './typographyManifest';

export type HeroStyle = 'accent-font' | 'weight-shift' | 'scale-only' | 'none';
export type AccentDensity = 'low' | 'medium' | 'high';
export type TypographySystem = 'paired' | 'single' | 'minimal';

export interface SectionBehavior {
  weight: 'light' | 'regular' | 'bold' | 'black';
  tracking: 'tight' | 'normal' | 'wide';
  transform: 'uppercase' | 'sentence';
  accentDensity: AccentDensity;
  scale: 'small' | 'normal' | 'large';
}

export interface ResolvedTypography {
  system: TypographySystem;
  fontFamily: string;
  fontWeight: number;
  heroWeight: number;
  accentFontFamily: string | null;
  accentFontWeight: number | null;
  heroStyle: HeroStyle;
  accentDensity: AccentDensity;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
  sectionStrategies: Record<string, string>;
  _meta: {
    source: 'character' | 'plan' | 'plan-repaired' | 'profile' | 'legacy' | 'fallback';
    primaryFont: string;
    accentFont: string | null;
    repaired: boolean;
  };
}

export const WEIGHT_MAP: Record<string, number> = { light: 300, regular: 400, bold: 700, black: 800 };
export const TRACKING_MAP: Record<string, number> = { tight: 0.35, normal: 0.2, wide: 0.5 };

// ── Character-based font selection (v2) ──────────────────────
// Maps song character tags from cinematic direction v2 to genreFit search terms.
// The AI classifies the song personality; code picks the font.
const CHARACTER_TO_GENRES: Record<string, string[]> = {
  'hard-rap': ['hip-hop', 'trap', 'drill', 'grime'],
  'hype-anthem': ['anthem', 'sport', 'hip-hop'],
  'punk-energy': ['punk', 'rock', 'indie'],
  'electronic-drive': ['electronic', 'techno', 'hyperpop'],
  'melodic-rap': ['hip-hop', 'r-and-b', 'pop'],
  'pop-hook': ['pop', 'general', 'k-pop'],
  'indie-float': ['indie', 'ambient', 'minimal'],
  'afro-groove': ['afrobeat', 'funk', 'pop'],
  'slow-romantic-rnb': ['r-and-b', 'neo-soul', 'contemporary'],
  'acoustic-bare': ['acoustic', 'gentle', 'folk'],
  'dark-mood': ['dark-trap', 'gothic', 'industrial'],
  'ambient-drift': ['ambient', 'minimal', 'experimental'],
  'spoken-word': ['spoken-word', 'editorial'],
  'gospel-soul': ['gospel', 'soul', 'anthem'],
  'lo-fi-chill': ['lo-fi', 'indie', 'ambient'],
};

// Typography energy defaults per character
const CHARACTER_DEFAULTS: Record<string, {
  system: TypographySystem;
  weight: string;
  textCase: 'uppercase' | 'none';
  accentDensity: AccentDensity;
}> = {
  'hard-rap': { system: 'single', weight: 'black', textCase: 'uppercase', accentDensity: 'low' },
  'hype-anthem': { system: 'paired', weight: 'bold', textCase: 'uppercase', accentDensity: 'high' },
  'punk-energy': { system: 'single', weight: 'bold', textCase: 'uppercase', accentDensity: 'low' },
  'electronic-drive': { system: 'single', weight: 'bold', textCase: 'uppercase', accentDensity: 'low' },
  'melodic-rap': { system: 'paired', weight: 'bold', textCase: 'none', accentDensity: 'medium' },
  'pop-hook': { system: 'paired', weight: 'bold', textCase: 'none', accentDensity: 'medium' },
  'indie-float': { system: 'single', weight: 'regular', textCase: 'none', accentDensity: 'low' },
  'afro-groove': { system: 'paired', weight: 'bold', textCase: 'none', accentDensity: 'medium' },
  'slow-romantic-rnb': { system: 'paired', weight: 'regular', textCase: 'none', accentDensity: 'medium' },
  'acoustic-bare': { system: 'single', weight: 'regular', textCase: 'none', accentDensity: 'low' },
  'dark-mood': { system: 'single', weight: 'bold', textCase: 'none', accentDensity: 'low' },
  'ambient-drift': { system: 'minimal', weight: 'light', textCase: 'none', accentDensity: 'low' },
  'spoken-word': { system: 'single', weight: 'regular', textCase: 'none', accentDensity: 'low' },
  'gospel-soul': { system: 'paired', weight: 'bold', textCase: 'none', accentDensity: 'high' },
  'lo-fi-chill': { system: 'minimal', weight: 'regular', textCase: 'none', accentDensity: 'low' },
};

function pickWeight(font: FontDef, target: string): number {
  const t = WEIGHT_MAP[target] ?? 700;
  return font.weights.reduce((best, w) => (Math.abs(w - t) < Math.abs(best - t) ? w : best), font.weights[0]);
}

function pickHeroWeight(font: FontDef, baseWeight: number): number {
  const heavier = font.weights.filter(w => w > baseWeight).sort((a, b) => a - b);
  return heavier[0] ?? font.weights[font.weights.length - 1];
}

function resolveFromCharacter(cd: any): ResolvedTypography | null {
  const character = typeof cd?.character === 'string' ? cd.character.toLowerCase().trim() : '';
  const targetGenres = CHARACTER_TO_GENRES[character];
  if (!targetGenres) return null;

  const defaults = CHARACTER_DEFAULTS[character] ?? {
    system: 'paired',
    weight: 'bold',
    textCase: 'none',
    accentDensity: 'medium',
  };

  const scored = FONT_MANIFEST
    .filter(f => f.roles.includes('primary'))
    .map(f => ({
      font: f,
      score: f.genreFit.filter(g => targetGenres.includes(g)).length,
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const pool = scored.slice(0, Math.min(3, scored.length));
  const worldStr = typeof cd?.world === 'string' ? cd.world : '';
  let hash = 0;
  for (let i = 0; i < worldStr.length; i++) {
    hash = ((hash << 5) - hash + worldStr.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < character.length; i++) {
    hash = ((hash << 5) - hash + character.charCodeAt(i)) | 0;
  }
  const pickIndex = Math.abs(hash) % pool.length;
  const primary = pool[pickIndex].font;

  const system = defaults.system;
  const accent = system === 'paired' ? findBestAccent(primary) : null;
  const baseWeight = pickWeight(primary, defaults.weight);
  const heroW = pickHeroWeight(primary, baseWeight);
  const heroStyle: HeroStyle = system === 'paired' && accent ? 'accent-font' : 'weight-shift';

  return {
    system,
    fontFamily: primary.cssFamily,
    fontWeight: baseWeight,
    heroWeight: heroW,
    accentFontFamily: accent?.cssFamily ?? null,
    accentFontWeight: accent ? pickWeight(accent, 'bold') : null,
    heroStyle,
    accentDensity: defaults.accentDensity,
    textTransform: defaults.textCase,
    letterSpacing: primary.width === 'condensed' ? 0.35 : 0.2,
    sectionStrategies: {},
    _meta: {
      source: 'character',
      primaryFont: primary.name,
      accentFont: accent?.name ?? null,
      repaired: false,
    },
  };
}

function resolveFromPlan(cd: any): ResolvedTypography | null {
  const plan = cd?.typographyPlan;
  if (!plan || typeof plan !== 'object') return null;

  const system: TypographySystem = ['paired', 'single', 'minimal'].includes(plan.system) ? plan.system : 'paired';

  let primaryDef = typeof plan.primary === 'string' ? findFont(plan.primary) : undefined;
  let repaired = false;
  if (!primaryDef) {
    primaryDef = findFont('Montserrat')!;
    repaired = true;
  }

  let accentDef: FontDef | null = null;
  if (system === 'paired') {
    if (typeof plan.accent === 'string' && plan.accent.trim()) {
      accentDef = findFont(plan.accent) ?? null;
    }
    if (accentDef && !isValidPair(primaryDef, accentDef)) {
      accentDef = findBestAccent(primaryDef);
      repaired = true;
    }
    if (!accentDef) {
      accentDef = findBestAccent(primaryDef);
      repaired = true;
    }
    if (accentDef && pairingContrastScore(primaryDef, accentDef) < 2) {
      accentDef = findBestAccent(primaryDef);
      repaired = true;
    }
  }

  const heroStyle: HeroStyle = ['accent-font', 'weight-shift', 'scale-only', 'none'].includes(plan.heroStyle)
    ? plan.heroStyle
    : (system === 'paired' && accentDef ? 'accent-font' : 'weight-shift');

  const effectiveHeroStyle: HeroStyle = heroStyle === 'accent-font' && !accentDef ? 'weight-shift' : heroStyle;

  const accentDensity: AccentDensity = ['low', 'medium', 'high'].includes(plan.accentDensity) ? plan.accentDensity : 'low';

  const baseWeight = pickWeight(primaryDef, plan.baseWeight ?? 'bold');
  const heroW = pickHeroWeight(primaryDef, baseWeight);

  const tracking = primaryDef.width === 'condensed' ? 0.35
    : primaryDef.category === 'mono' ? 0.4
    : 0.2;

  const sectionStrategies: Record<string, string> = {};
  if (plan.sectionBehavior && typeof plan.sectionBehavior === 'object') {
    for (const [role, behavior] of Object.entries(plan.sectionBehavior)) {
      if (typeof behavior === 'string') sectionStrategies[role] = behavior;
    }
  }

  return {
    system,
    fontFamily: primaryDef.cssFamily,
    fontWeight: baseWeight,
    heroWeight: heroW,
    accentFontFamily: accentDef?.cssFamily ?? null,
    accentFontWeight: accentDef ? pickWeight(accentDef, plan.baseWeight ?? 'bold') : null,
    heroStyle: effectiveHeroStyle,
    accentDensity,
    textTransform: plan.case === 'uppercase' ? 'uppercase' : 'none',
    letterSpacing: tracking,
    sectionStrategies,
    _meta: {
      source: repaired ? 'plan-repaired' : 'plan',
      primaryFont: primaryDef.name,
      accentFont: accentDef?.name ?? null,
      repaired,
    },
  };
}

const LEGACY_PROFILES: Record<string, any> = {
  'bold-impact': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'high', era: 'modern' },
  'clean-modern': { force: 'medium', intimacy: 'medium', polish: 'clean', theatricality: 'low', era: 'modern' },
  'elegant-serif': { force: 'medium', intimacy: 'medium', polish: 'elegant', theatricality: 'medium', era: 'timeless' },
  'raw-condensed': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'medium', era: 'modern' },
  'whisper-soft': { force: 'low', intimacy: 'high', polish: 'clean', theatricality: 'low', era: 'modern' },
  'tech-mono': { force: 'low', intimacy: 'low', polish: 'raw', theatricality: 'low', era: 'futuristic' },
  'display-heavy': { force: 'high', intimacy: 'low', polish: 'raw', theatricality: 'high', era: 'modern' },
  'editorial-light': { force: 'low', intimacy: 'high', polish: 'elegant', theatricality: 'low', era: 'timeless' },
};

function resolveFromLegacy(cd: any): ResolvedTypography {
  const typoKey = typeof cd?.typography === 'string' ? cd.typography : 'clean-modern';
  const profile = cd?.fontProfile ?? LEGACY_PROFILES[typoKey] ?? LEGACY_PROFILES['clean-modern'];

  const scored = FONT_MANIFEST
    .filter(f => f.roles.includes('primary'))
    .map(f => {
      let score = 0;
      if (f.energy === profile.force) score += 20;
      const polishMap: Record<string, string> = { raw: 'low', clean: 'medium', elegant: 'high' };
      if (f.elegance === (polishMap[profile.polish] ?? 'medium')) score += 15;
      if (f.warmth === profile.intimacy) score += 15;
      if (profile.theatricality === 'high' && f.category === 'display') score += 10;
      if (profile.era === 'futuristic' && f.category === 'mono') score += 10;
      if (profile.polish === 'elegant' && f.category === 'serif') score += 10;
      return { font: f, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.font ?? findFont('Montserrat')!;
  const baseWeight = pickWeight(best, profile.force === 'high' ? 'bold' : 'regular');
  const heroW = pickHeroWeight(best, baseWeight);

  return {
    system: 'single',
    fontFamily: best.cssFamily,
    fontWeight: baseWeight,
    heroWeight: heroW,
    accentFontFamily: null,
    accentFontWeight: null,
    heroStyle: 'weight-shift',
    accentDensity: 'low',
    textTransform: (profile.force === 'high' || profile.theatricality === 'high') ? 'uppercase' : 'none',
    letterSpacing: best.width === 'condensed' ? 0.35 : 0.2,
    sectionStrategies: {},
    _meta: {
      source: cd?.fontProfile ? 'profile' : 'legacy',
      primaryFont: best.name,
      accentFont: null,
      repaired: false,
    },
  };
}

export function resolveTypographyFromDirection(cd: any): ResolvedTypography {
  const fromCharacter = resolveFromCharacter(cd);
  if (fromCharacter) {
    console.info('[typography] resolved from character:', fromCharacter._meta);
    return fromCharacter;
  }

  const fromPlan = resolveFromPlan(cd);
  if (fromPlan) {
    console.info('[typography] resolved from plan:', fromPlan._meta);
    return fromPlan;
  }

  const fromLegacy = resolveFromLegacy(cd);
  console.info('[typography] resolved from legacy:', fromLegacy._meta);
  return fromLegacy;
}

export function getFontNamesForPreload(resolved: ResolvedTypography): string[] {
  const names: string[] = [];
  const primary = resolved.fontFamily.replace(/"/g, '').split(',')[0].trim();
  names.push(primary);
  if (resolved.accentFontFamily) {
    const accent = resolved.accentFontFamily.replace(/"/g, '').split(',')[0].trim();
    if (accent !== primary) names.push(accent);
  }
  return names;
}

const SECTION_BEHAVIOR_MAP: Record<string, Partial<SectionBehavior>> = {
  restrained: { weight: 'regular', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal' },
  narrative: { weight: 'regular', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal' },
  raw: { weight: 'bold', tracking: 'tight', transform: 'sentence', accentDensity: 'medium', scale: 'normal' },
  lift: { weight: 'bold', tracking: 'normal', transform: 'sentence', accentDensity: 'medium', scale: 'normal' },
  tighten: { weight: 'bold', tracking: 'tight', transform: 'sentence', accentDensity: 'medium', scale: 'normal' },
  hold: { weight: 'regular', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal' },
  explode: { weight: 'black', tracking: 'tight', transform: 'uppercase', accentDensity: 'high', scale: 'large' },
  anthem: { weight: 'black', tracking: 'normal', transform: 'uppercase', accentDensity: 'high', scale: 'large' },
  contrast: { weight: 'bold', tracking: 'wide', transform: 'sentence', accentDensity: 'high', scale: 'large' },
  strip: { weight: 'light', tracking: 'wide', transform: 'sentence', accentDensity: 'low', scale: 'small' },
  pivot: { weight: 'regular', tracking: 'normal', transform: 'sentence', accentDensity: 'medium', scale: 'normal' },
  float: { weight: 'light', tracking: 'wide', transform: 'sentence', accentDensity: 'low', scale: 'small' },
  decay: { weight: 'light', tracking: 'wide', transform: 'sentence', accentDensity: 'low', scale: 'small' },
  resolve: { weight: 'regular', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal' },
  linger: { weight: 'light', tracking: 'wide', transform: 'sentence', accentDensity: 'low', scale: 'small' },
};

export const DEFAULT_SECTION_BEHAVIOR: SectionBehavior = {
  weight: 'bold', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal',
};

export function deriveSectionTypography(
  sectionRole: string | undefined,
  sectionEnergy: number,
  resolved: ResolvedTypography,
): SectionBehavior {
  const role = (sectionRole ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const strategy = resolved.sectionStrategies[role] ?? resolved.sectionStrategies[sectionRole ?? ''] ?? null;

  if (strategy && SECTION_BEHAVIOR_MAP[strategy]) {
    return { ...DEFAULT_SECTION_BEHAVIOR, ...SECTION_BEHAVIOR_MAP[strategy] };
  }

  return {
    weight: sectionEnergy > 0.7 ? 'black' : sectionEnergy > 0.4 ? 'bold' : sectionEnergy > 0.2 ? 'regular' : 'light',
    tracking: sectionEnergy > 0.6 ? 'tight' : sectionEnergy < 0.25 ? 'wide' : 'normal',
    transform: sectionEnergy > 0.6 ? 'uppercase' : 'sentence',
    accentDensity: sectionEnergy > 0.6 ? 'high' : sectionEnergy > 0.3 ? 'medium' : 'low',
    scale: sectionEnergy > 0.7 ? 'large' : sectionEnergy < 0.25 ? 'small' : 'normal',
  };
}

export interface DensityBudget {
  maxAccentWordsPerPhrase: number;
  maxAccentedPhraseRatio: number;
}

export function getDensityBudget(density: AccentDensity): DensityBudget {
  switch (density) {
    case 'low': return { maxAccentWordsPerPhrase: 1, maxAccentedPhraseRatio: 0.20 };
    case 'medium': return { maxAccentWordsPerPhrase: 1, maxAccentedPhraseRatio: 0.40 };
    case 'high': return { maxAccentWordsPerPhrase: 2, maxAccentedPhraseRatio: 0.60 };
  }
}
