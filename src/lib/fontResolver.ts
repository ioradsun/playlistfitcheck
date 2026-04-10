/**
 * fontResolver.ts — 4-layer typography resolver.
 *
 * Layer 1: Use AI's typographyPlan directly if valid
 * Layer 2: Repair invalid choices (unknown fonts, weak pairs, bad combos)
 * Layer 3: Derive concrete rendering tokens
 * Layer 4: Fallback to safe defaults
 */

import {
  findFont,
  type FontDef,
} from './typographyManifest';

export type HeroStyle = 'weight-shift' | 'scale-only' | 'none';
export type AccentDensity = 'low' | 'medium' | 'high';
export type TypographySystem = 'single';

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
    source: 'plan' | 'plan-repaired' | 'fallback';
    primaryFont: string;
    accentFont: string | null;
    repaired: boolean;
  };
}

export const WEIGHT_MAP: Record<string, number> = { light: 300, regular: 400, bold: 700, black: 800 };
export const TRACKING_MAP: Record<string, number> = { tight: 0.35, normal: 0.2, wide: 0.5 };

function pickWeight(font: FontDef, target: string): number {
  const t = WEIGHT_MAP[target] ?? 700;
  return font.weights.reduce((best, w) => (Math.abs(w - t) < Math.abs(best - t) ? w : best), font.weights[0]);
}

function pickHeroWeight(font: FontDef, baseWeight: number): number {
  const heavier = font.weights.filter(w => w > baseWeight).sort((a, b) => a - b);
  return heavier[0] ?? font.weights[font.weights.length - 1];
}

function resolveFromPlan(cd: any): ResolvedTypography | null {
  const plan = cd?.typographyPlan;
  if (!plan || typeof plan !== 'object') return null;

  const system: TypographySystem = 'single';

  let primaryDef = typeof plan.primary === 'string' ? findFont(plan.primary) : undefined;
  let repaired = false;
  if (!primaryDef) {
    primaryDef = findFont('Montserrat')!;
    repaired = true;
  }

  const heroStyle: HeroStyle = ['weight-shift', 'scale-only', 'none'].includes(plan.heroStyle)
    ? plan.heroStyle
    : 'weight-shift';

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
    accentFontFamily: null,
    accentFontWeight: null,
    heroStyle,
    accentDensity,
    textTransform: plan.case === 'uppercase' ? 'uppercase' : 'none',
    letterSpacing: tracking,
    sectionStrategies,
    _meta: {
      source: repaired ? 'plan-repaired' : 'plan',
      primaryFont: primaryDef.name,
      accentFont: null,
      repaired,
    },
  };
}

export function resolveTypographyFromDirection(cd: any): ResolvedTypography {
  const fromPlan = resolveFromPlan(cd);
  if (fromPlan) return fromPlan;

  // No typographyPlan — return safe defaults
  const fallback = findFont('Montserrat')!;
  return {
    system: 'single',
    fontFamily: fallback.cssFamily,
    fontWeight: 700,
    heroWeight: 800,
    accentFontFamily: null,
    accentFontWeight: null,
    heroStyle: 'weight-shift',
    accentDensity: 'low',
    textTransform: 'none',
    letterSpacing: 0.2,
    sectionStrategies: {},
    _meta: { source: 'fallback', primaryFont: 'Montserrat', accentFont: null, repaired: false },
  };
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
