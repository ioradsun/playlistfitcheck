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
  heroStyle: HeroStyle;
  accentDensity: AccentDensity;
  textTransform: 'none' | 'uppercase';
  letterSpacing: number;
  _meta: {
    source: 'plan' | 'plan-repaired' | 'fallback';
    primaryFont: string;
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

  return {
    system,
    fontFamily: primaryDef.cssFamily,
    fontWeight: baseWeight,
    heroWeight: heroW,
    heroStyle,
    accentDensity,
    textTransform: plan.case === 'uppercase' ? 'uppercase' : 'none',
    letterSpacing: tracking,
    _meta: {
      source: repaired ? 'plan-repaired' : 'plan',
      primaryFont: primaryDef.name,
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
    heroStyle: 'weight-shift',
    accentDensity: 'low',
    textTransform: 'none',
    letterSpacing: 0.2,
    _meta: { source: 'fallback', primaryFont: 'Montserrat', repaired: false },
  };
}

export function getFontNamesForPreload(resolved: ResolvedTypography): string[] {
  const names: string[] = [];
  const primary = resolved.fontFamily.replace(/"/g, '').split(',')[0].trim();
  names.push(primary);
  return names;
}

export const DEFAULT_SECTION_BEHAVIOR: SectionBehavior = {
  weight: 'bold', tracking: 'normal', transform: 'sentence', accentDensity: 'low', scale: 'normal',
};

export function deriveSectionTypography(
  _sectionRole: string | undefined,
  sectionEnergy: number,
): SectionBehavior {
  return {
    weight: sectionEnergy > 0.7 ? 'black' : sectionEnergy > 0.4 ? 'bold' : sectionEnergy > 0.2 ? 'regular' : 'light',
    tracking: sectionEnergy > 0.6 ? 'tight' : sectionEnergy < 0.25 ? 'wide' : 'normal',
    transform: sectionEnergy > 0.6 ? 'uppercase' : 'sentence',
    accentDensity: sectionEnergy > 0.6 ? 'high' : sectionEnergy > 0.3 ? 'medium' : 'low',
    scale: sectionEnergy > 0.7 ? 'large' : sectionEnergy < 0.25 ? 'small' : 'normal',
  };
}
