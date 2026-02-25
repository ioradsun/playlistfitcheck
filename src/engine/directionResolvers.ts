/**
 * directionResolvers.ts — Shared lookup tables and resolver utilities
 * for the new CinematicDirection schema.
 *
 * Replaces the monolithic normalizeCinematicDirection adapter with
 * focused, composable functions that consumers call directly.
 */

import type {
  CinematicDirection,
  CinematicSection,
  WordDirective,
  StoryboardEntry,
  TensionStage,
} from "@/types/CinematicDirection";

// ── Typography ──────────────────────────────────────────────

export interface ResolvedTypography {
  fontFamily: string;
  fontWeight: number;
  textTransform: string;
  letterSpacing: string;
  personality: string;
}

const TYPO_FAMILIES: Record<string, string> = {
  "bold-impact": "Oswald",
  "clean-modern": "Montserrat",
  "elegant-serif": "Playfair Display",
  "raw-condensed": "Barlow Condensed",
  "whisper-soft": "Nunito",
  "tech-mono": "JetBrains Mono",
  "display-heavy": "Bebas Neue",
  "editorial-light": "Cormorant Garamond",
};

const TYPO_WEIGHTS: Record<string, number> = {
  "bold-impact": 700,
  "clean-modern": 600,
  "elegant-serif": 500,
  "raw-condensed": 600,
  "whisper-soft": 400,
  "tech-mono": 500,
  "display-heavy": 400,
  "editorial-light": 400,
};

const TYPO_TRANSFORMS: Record<string, string> = {
  "bold-impact": "uppercase",
  "raw-condensed": "uppercase",
  "display-heavy": "uppercase",
};

const TYPO_PERSONALITY: Record<string, string> = {
  "bold-impact": "POWER",
  "clean-modern": "NEUTRAL",
  "elegant-serif": "SOULFUL",
  "raw-condensed": "RAW",
  "whisper-soft": "GENTLE",
  "tech-mono": "FUTURE",
  "display-heavy": "STATEMENT",
  "editorial-light": "POETIC",
};

export const TYPOGRAPHY_FONTS: Record<string, string> = {
  "bold-impact": '"Oswald", sans-serif',
  "clean-modern": '"Montserrat", sans-serif',
  "elegant-serif": '"Playfair Display", serif',
  "raw-condensed": '"Barlow Condensed", sans-serif',
  "whisper-soft": '"Nunito", sans-serif',
  "tech-mono": '"JetBrains Mono", monospace',
  "display-heavy": '"Bebas Neue", sans-serif',
  "editorial-light": '"Cormorant Garamond", serif',
};

export function resolveTypography(key: string | undefined): ResolvedTypography {
  const k = key ?? "clean-modern";
  return {
    fontFamily: TYPO_FAMILIES[k] ?? "Montserrat",
    fontWeight: TYPO_WEIGHTS[k] ?? 600,
    textTransform: TYPO_TRANSFORMS[k] ?? "none",
    letterSpacing: "0.02em",
    personality: TYPO_PERSONALITY[k] ?? "NEUTRAL",
  };
}

export function resolveTypographyFont(key: string | undefined): string {
  return TYPOGRAPHY_FONTS[key ?? "clean-modern"] ?? '"Montserrat", sans-serif';
}

// ── Motion / Physics ────────────────────────────────────────

export interface ResolvedPhysics {
  heat: number;
  beatResponse: string;
  weight: string;
  chaos: string;
}

const MOTION_HEAT: Record<string, number> = {
  weighted: 0.8, elastic: 0.6, fluid: 0.45, glitch: 0.7, drift: 0.2,
};
const MOTION_BEAT: Record<string, string> = {
  weighted: "slam", elastic: "pulse", fluid: "pulse", glitch: "snap", drift: "drift",
};
const MOTION_WEIGHT: Record<string, string> = {
  weighted: "heavy", elastic: "light", fluid: "normal", glitch: "normal", drift: "featherlight",
};
const MOTION_CHAOS: Record<string, string> = {
  weighted: "building", elastic: "building", fluid: "restrained", glitch: "chaotic", drift: "still",
};

export function resolveMotionPhysics(motion: string | undefined): ResolvedPhysics {
  const m = motion ?? "fluid";
  return {
    heat: MOTION_HEAT[m] ?? 0.5,
    beatResponse: MOTION_BEAT[m] ?? "pulse",
    weight: MOTION_WEIGHT[m] ?? "normal",
    chaos: MOTION_CHAOS[m] ?? "restrained",
  };
}

// ── Atmosphere ──────────────────────────────────────────────

const ATMOSPHERE_BG: Record<string, string> = {
  void: "void", cinematic: "cosmic", haze: "intimate", split: "urban",
  grain: "grunge", wash: "intimate", glass: "neon", clean: "cosmic",
};

export function resolveAtmosphereSystem(atmosphere: string | undefined): string {
  return ATMOSPHERE_BG[atmosphere ?? "cinematic"] ?? "cosmic";
}

// ── Sections ────────────────────────────────────────────────

/** Enrich sections with computed startRatio/endRatio */
export function enrichSections(sections: CinematicSection[] | undefined): CinematicSection[] {
  if (!sections || sections.length === 0) {
    return [
      { sectionIndex: 0, description: "Opening", startRatio: 0, endRatio: 0.33 },
      { sectionIndex: 1, description: "Middle", startRatio: 0.33, endRatio: 0.66 },
      { sectionIndex: 2, description: "Climax", startRatio: 0.66, endRatio: 1 },
    ];
  }
  const count = sections.length;
  return sections.map((s, i) => ({
    ...s,
    startRatio: s.startRatio ?? i / count,
    endRatio: s.endRatio ?? (i + 1) / count,
  }));
}

/** Find the active section for a given song progress [0-1] */
export function findSectionByProgress(
  sections: CinematicSection[] | undefined,
  progress: number,
): CinematicSection | null {
  const enriched = enrichSections(sections);
  return enriched.find(
    (s) => progress >= (s.startRatio ?? 0) && progress < (s.endRatio ?? 1),
  ) ?? enriched[enriched.length - 1] ?? null;
}

/** Find section index for a given progress */
export function findSectionIndexByProgress(
  sections: CinematicSection[] | undefined,
  progress: number,
): number {
  const enriched = enrichSections(sections);
  const idx = enriched.findIndex(
    (s) => progress >= (s.startRatio ?? 0) && progress < (s.endRatio ?? 1),
  );
  return idx >= 0 ? idx : Math.max(0, enriched.length - 1);
}

// ── RenderSection (for BackgroundDirector/LightingDirector compat) ──

export interface RenderSection {
  title: string;
  emotionalIntensity: number;
  dominantColor: string;
  lightBehavior: string;
  particleDirective: string;
  backgroundDirective: string;
  typographyShift: null;
}

/** Convert a CinematicSection + context into a RenderSection for the old-style renderers */
export function toRenderSection(
  section: CinematicSection | null,
  sectionIndex: number,
  totalSections: number,
  palette: string[],
  defaultAtmosphere: string = "cinematic",
): RenderSection {
  const intensity = totalSections > 1
    ? 0.4 + (sectionIndex / (totalSections - 1)) * 0.6
    : 0.5;
  const atmosphere = section?.atmosphere ?? defaultAtmosphere;
  return {
    title: section?.description?.slice(0, 60) ?? `Section ${sectionIndex}`,
    emotionalIntensity: intensity,
    dominantColor: palette[sectionIndex % palette.length] ?? "#111111",
    lightBehavior: atmosphere === "haze" ? "soft" : "cinematic",
    particleDirective: section?.texture ?? "dust",
    backgroundDirective: section?.description ?? "",
    typographyShift: null,
  };
}

/** Get a RenderSection for the current progress */
export function getRenderSectionForProgress(
  cd: CinematicDirection | null,
  progress: number,
  palette: string[],
): RenderSection {
  const sections = enrichSections(cd?.sections);
  const idx = findSectionIndexByProgress(sections, progress);
  return toRenderSection(
    sections[idx] ?? null,
    idx,
    sections.length,
    palette,
    cd?.atmosphere,
  );
}

// ── Word Directives ─────────────────────────────────────────

/** Build a fast lookup map from word directive array */
export function buildWordDirectiveMap(
  directives: WordDirective[] | undefined,
): Map<string, WordDirective> {
  const map = new Map<string, WordDirective>();
  if (!directives) return map;
  for (const wd of directives) {
    const key = (wd.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key) map.set(key, wd);
  }
  return map;
}

/** Find a word directive by word string */
export function findWordDirective(
  directives: WordDirective[] | undefined,
  word: string,
): WordDirective | null {
  if (!directives) return null;
  const key = word.toLowerCase().replace(/[^a-z]/g, "");
  return directives.find(
    (wd) => (wd.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === key,
  ) ?? null;
}

// ── Tension Curve ───────────────────────────────────────────

export function deriveTensionCurve(emotionalArc: string | undefined): TensionStage[] {
  const curves: Record<string, TensionStage[]> = {
    "slow-burn": [
      { stage: "Setup", startRatio: 0, endRatio: 0.3, motionIntensity: 0.3, particleDensity: 0.2, lightBrightness: 0.4, cameraMovement: "Drift", typographyAggression: 0.2 },
      { stage: "Build", startRatio: 0.3, endRatio: 0.6, motionIntensity: 0.5, particleDensity: 0.5, lightBrightness: 0.6, cameraMovement: "PushIn", typographyAggression: 0.5 },
      { stage: "Peak", startRatio: 0.6, endRatio: 0.85, motionIntensity: 0.9, particleDensity: 0.9, lightBrightness: 0.9, cameraMovement: "Shake", typographyAggression: 0.9 },
      { stage: "Release", startRatio: 0.85, endRatio: 1, motionIntensity: 0.4, particleDensity: 0.3, lightBrightness: 0.5, cameraMovement: "Drift", typographyAggression: 0.3 },
    ],
    surge: [
      { stage: "Setup", startRatio: 0, endRatio: 0.15, motionIntensity: 0.5, particleDensity: 0.4, lightBrightness: 0.5, cameraMovement: "PushIn", typographyAggression: 0.4 },
      { stage: "Build", startRatio: 0.15, endRatio: 0.45, motionIntensity: 0.7, particleDensity: 0.7, lightBrightness: 0.7, cameraMovement: "PushIn", typographyAggression: 0.7 },
      { stage: "Peak", startRatio: 0.45, endRatio: 0.75, motionIntensity: 1.0, particleDensity: 1.0, lightBrightness: 1.0, cameraMovement: "Shake", typographyAggression: 1.0 },
      { stage: "Release", startRatio: 0.75, endRatio: 1, motionIntensity: 0.5, particleDensity: 0.4, lightBrightness: 0.6, cameraMovement: "Drift", typographyAggression: 0.4 },
    ],
    collapse: [
      { stage: "Peak", startRatio: 0, endRatio: 0.3, motionIntensity: 0.9, particleDensity: 0.9, lightBrightness: 0.9, cameraMovement: "Shake", typographyAggression: 0.9 },
      { stage: "Build", startRatio: 0.3, endRatio: 0.6, motionIntensity: 0.6, particleDensity: 0.6, lightBrightness: 0.6, cameraMovement: "PushIn", typographyAggression: 0.5 },
      { stage: "Release", startRatio: 0.6, endRatio: 1, motionIntensity: 0.2, particleDensity: 0.2, lightBrightness: 0.3, cameraMovement: "Drift", typographyAggression: 0.2 },
    ],
    dawn: [
      { stage: "Setup", startRatio: 0, endRatio: 0.4, motionIntensity: 0.2, particleDensity: 0.2, lightBrightness: 0.3, cameraMovement: "Drift", typographyAggression: 0.2 },
      { stage: "Build", startRatio: 0.4, endRatio: 0.7, motionIntensity: 0.5, particleDensity: 0.5, lightBrightness: 0.6, cameraMovement: "Rise", typographyAggression: 0.5 },
      { stage: "Peak", startRatio: 0.7, endRatio: 1, motionIntensity: 0.8, particleDensity: 0.8, lightBrightness: 0.9, cameraMovement: "PushIn", typographyAggression: 0.8 },
    ],
    flatline: [
      { stage: "Setup", startRatio: 0, endRatio: 1, motionIntensity: 0.5, particleDensity: 0.4, lightBrightness: 0.5, cameraMovement: "Drift", typographyAggression: 0.4 },
    ],
    eruption: [
      { stage: "Setup", startRatio: 0, endRatio: 0.25, motionIntensity: 0.15, particleDensity: 0.15, lightBrightness: 0.3, cameraMovement: "Drift", typographyAggression: 0.15 },
      { stage: "Build", startRatio: 0.25, endRatio: 0.5, motionIntensity: 0.5, particleDensity: 0.5, lightBrightness: 0.5, cameraMovement: "PushIn", typographyAggression: 0.5 },
      { stage: "Peak", startRatio: 0.5, endRatio: 0.85, motionIntensity: 1.0, particleDensity: 1.0, lightBrightness: 1.0, cameraMovement: "Shake", typographyAggression: 1.0 },
      { stage: "Release", startRatio: 0.85, endRatio: 1, motionIntensity: 0.4, particleDensity: 0.3, lightBrightness: 0.5, cameraMovement: "Drift", typographyAggression: 0.3 },
    ],
  };
  return curves[emotionalArc ?? "slow-burn"] ?? curves["slow-burn"]!;
}

/** Get the current tension stage for a given progress */
export function getTensionStageForProgress(
  emotionalArc: string | undefined,
  progress: number,
): TensionStage | null {
  const curve = deriveTensionCurve(emotionalArc);
  return curve.find(
    (s) => progress >= s.startRatio && progress <= s.endRatio,
  ) ?? curve[0] ?? null;
}

// ── Climax ──────────────────────────────────────────────────

export function deriveClimaxRatio(emotionalArc: string | undefined): number {
  const arc = emotionalArc ?? "slow-burn";
  if (arc === "eruption") return 0.6;
  if (arc === "collapse") return 0.15;
  if (arc === "dawn") return 0.85;
  return 0.65;
}

// ── Palette ─────────────────────────────────────────────────

export const PALETTE_COLORS: Record<string, string[]> = {
  'cold-gold': ['#0A0A0F', '#C9A96E', '#F0ECE2', '#FFD700', '#5A4A30'],
  'warm-ember': ['#1A0A05', '#E8632B', '#FFF0E6', '#FF6B35', '#7D3A1A'],
  'ice-blue': ['#050A14', '#4FA4D4', '#E8F4F8', '#00BFFF', '#2A5570'],
  'midnight-rose': ['#0F0510', '#D4618C', '#F5E6EE', '#FF69B4', '#8A3358'],
  'neon-green': ['#050F05', '#39FF14', '#E6FFE6', '#00FF41', '#1A7A0A'],
  'storm-grey': ['#0E0E12', '#A0A4AC', '#E8E8EC', '#B8BCC4', '#5A5A66'],
  'blood-red': ['#120505', '#D43030', '#FFE6E6', '#FF3030', '#7A1A1A'],
  'lavender-dream': ['#0A0510', '#B088F9', '#F0E6FF', '#C49EFF', '#5A3A8A'],
  'earth-brown': ['#0F0A05', '#A0845C', '#F5EDE2', '#C4A878', '#6A5030'],
  'pure-white': ['#F8F8FA', '#3344AA', '#1A1A2E', '#4466FF', '#8888AA'],
  'soft-cream': ['#FFF8F0', '#8B6040', '#1A1008', '#C49A6C', '#6A4A30'],
  'sky-blue': ['#EEF5FF', '#2255AA', '#0A1A30', '#3B82F6', '#4A6A9A'],
  'sunset-pink': ['#FFF0F0', '#AA3366', '#1A0510', '#FF6B9D', '#883355'],
  'spring-green': ['#F0FFF0', '#228844', '#0A200F', '#34D058', '#3A7A4A'],
};

export function resolvePalette(
  paletteName: string | undefined,
  fallback: string[],
): string[] {
  if (paletteName && PALETTE_COLORS[paletteName]) {
    return PALETTE_COLORS[paletteName];
  }
  return fallback.length >= 3 ? fallback : ['#0A0A0F', '#FFD700', '#F0F0F0', '#FFD700', '#555555'];
}

// ── Background system mapping ───────────────────────────────

export function mapBackgroundSystem(desc: string): string {
  const d = (desc ?? '').toLowerCase();
  if (d.includes('fire') || d.includes('burn') || d.includes('flame') || d.includes('ember')) return 'fire';
  if (d.includes('ocean') || d.includes('water') || d.includes('wave') || d.includes('sea') || d.includes('underwater')) return 'ocean';
  if (d.includes('storm') || d.includes('lightning') || d.includes('thunder')) return 'storm';
  if (d.includes('aurora') || d.includes('northern') || d.includes('cosmic') || d.includes('galaxy') || d.includes('space') || d.includes('stars') || d.includes('nebula')) return 'aurora';
  if (d.includes('city') || d.includes('urban') || d.includes('neon') || d.includes('rain') || d.includes('street')) return 'urban';
  if (d.includes('intimate') || d.includes('candle') || d.includes('warm') || d.includes('cozy') || d.includes('soft')) return 'intimate';
  if (d.includes('void') || d.includes('dark') || d.includes('black') || d.includes('nothing') || d.includes('empty')) return 'void';
  return 'default';
}
