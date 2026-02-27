// ─── Helpers ─────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}


// ─── Typography ──────────────────────────────────────────────────

export interface TypographyConfig {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase" | "none";
  lineHeight: number;
}

const TYPOGRAPHY: Record<string, TypographyConfig> = {
  "bold-impact": { fontFamily: "Oswald", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1.2 },
  "clean-modern": { fontFamily: "Montserrat", fontWeight: 500, letterSpacing: "0.02em", textTransform: "none", lineHeight: 1.4 },
  "elegant-serif": { fontFamily: "Playfair Display", fontWeight: 400, letterSpacing: "0.08em", textTransform: "none", lineHeight: 1.6 },
  "raw-condensed": { fontFamily: "Barlow Condensed", fontWeight: 600, letterSpacing: "0.01em", textTransform: "uppercase", lineHeight: 1.2 },
  "whisper-soft": { fontFamily: "Nunito", fontWeight: 300, letterSpacing: "0.10em", textTransform: "none", lineHeight: 1.8 },
  "tech-mono": { fontFamily: "JetBrains Mono", fontWeight: 400, letterSpacing: "0.00em", textTransform: "none", lineHeight: 1.4 },
  "display-heavy": { fontFamily: "Bebas Neue", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.1 },
  "editorial-light": { fontFamily: "Cormorant Garamond", fontWeight: 300, letterSpacing: "0.12em", textTransform: "none", lineHeight: 1.7 },
};

export function getTypography(preset: string): TypographyConfig {
  return TYPOGRAPHY[preset] ?? TYPOGRAPHY["clean-modern"];
}


// ─── Motion → Physics ────────────────────────────────────────────

export interface PhysicsConfig {
  gravity: "slow-float" | "normal" | "slammed" | "inverted";
  tension: number;
  damping: number;
  beatResponse: "breath" | "pulse" | "bounce" | "slam" | "seismic";
  entryVelocity: number;
  exitVelocity: number;
}

const PHYSICS: Record<string, PhysicsConfig> = {
  weighted: { gravity: "slammed", tension: 0.7, damping: 0.4, beatResponse: "slam", entryVelocity: 0.9, exitVelocity: 0.7 },
  fluid: { gravity: "normal", tension: 0.4, damping: 0.7, beatResponse: "pulse", entryVelocity: 0.5, exitVelocity: 0.4 },
  elastic: { gravity: "normal", tension: 0.6, damping: 0.3, beatResponse: "bounce", entryVelocity: 0.7, exitVelocity: 0.6 },
  drift: { gravity: "slow-float", tension: 0.2, damping: 0.8, beatResponse: "breath", entryVelocity: 0.3, exitVelocity: 0.2 },
  glitch: { gravity: "normal", tension: 0.8, damping: 0.2, beatResponse: "seismic", entryVelocity: 1.0, exitVelocity: 0.9 },
};

export function getPhysics(preset: string): PhysicsConfig {
  return PHYSICS[preset] ?? PHYSICS.fluid;
}


// ─── Texture → Particles ─────────────────────────────────────────

export interface ParticleConfig {
  system: string;
  density: number;
  speed: number;
  opacity: number;
  beatReactive: boolean;
  direction: "up" | "down" | "radial" | "drift" | "swirl";
}

const PARTICLES: Record<string, ParticleConfig> = {
  fire: { system: "fire", density: 0.6, speed: 0.7, opacity: 0.5, beatReactive: true, direction: "up" },
  rain: { system: "rain", density: 0.7, speed: 0.8, opacity: 0.35, beatReactive: false, direction: "down" },
  snow: { system: "snow", density: 0.4, speed: 0.2, opacity: 0.4, beatReactive: false, direction: "down" },
  aurora: { system: "aurora", density: 0.3, speed: 0.15, opacity: 0.3, beatReactive: false, direction: "swirl" },
  smoke: { system: "smoke", density: 0.5, speed: 0.3, opacity: 0.25, beatReactive: false, direction: "up" },
  storm: { system: "storm", density: 0.8, speed: 0.9, opacity: 0.45, beatReactive: true, direction: "radial" },
  dust: { system: "dust", density: 0.3, speed: 0.15, opacity: 0.2, beatReactive: false, direction: "drift" },
  void: { system: "void", density: 0.0, speed: 0.0, opacity: 0.0, beatReactive: false, direction: "drift" },
  stars: { system: "stars", density: 0.4, speed: 0.05, opacity: 0.5, beatReactive: false, direction: "drift" },
  petals: { system: "petals", density: 0.35, speed: 0.25, opacity: 0.4, beatReactive: false, direction: "down" },
};

export function getParticles(preset: string): ParticleConfig {
  return PARTICLES[preset] ?? PARTICLES.dust;
}


// ─── Atmosphere → Overlay ────────────────────────────────────────

export interface OverlayConfig {
  imageOpacity: number;
  vignetteStrength: number;
  blurRadius: number;
  grainOpacity: number;
  tintStrength: number;
}

const OVERLAY: Record<string, OverlayConfig> = {
  void: { imageOpacity: 0.08, vignetteStrength: 0.0, blurRadius: 0, grainOpacity: 0.0, tintStrength: 0.0 },
  cinematic: { imageOpacity: 0.22, vignetteStrength: 0.6, blurRadius: 0, grainOpacity: 0.02, tintStrength: 0.1 },
  haze: { imageOpacity: 0.18, vignetteStrength: 0.3, blurRadius: 8, grainOpacity: 0.0, tintStrength: 0.15 },
  split: { imageOpacity: 0.3, vignetteStrength: 0.0, blurRadius: 0, grainOpacity: 0.0, tintStrength: 0.0 },
  grain: { imageOpacity: 0.2, vignetteStrength: 0.4, blurRadius: 0, grainOpacity: 0.12, tintStrength: 0.05 },
  wash: { imageOpacity: 0.15, vignetteStrength: 0.2, blurRadius: 4, grainOpacity: 0.0, tintStrength: 0.4 },
  glass: { imageOpacity: 0.25, vignetteStrength: 0.1, blurRadius: 12, grainOpacity: 0.0, tintStrength: 0.1 },
  clean: { imageOpacity: 0.35, vignetteStrength: 0.1, blurRadius: 0, grainOpacity: 0.0, tintStrength: 0.0 },
};

export function getOverlay(preset: string): OverlayConfig {
  return OVERLAY[preset] ?? OVERLAY.cinematic;
}


// ─── Emphasis → Font Scale ───────────────────────────────────────

const EMPHASIS_SCALE: Record<number, number> = {
  1: 0.7,
  2: 0.9,
  3: 1.2,
  4: 1.6,
  5: 2.2,
};

export function getFontScale(emphasisLevel: number): number {
  return EMPHASIS_SCALE[clamp(Math.round(emphasisLevel), 1, 5)] ?? 1.0;
}

const FILLER_WORDS = new Set([
  "the", "a", "an", "is", "am", "are", "was", "were", "be", "been",
  "in", "on", "at", "to", "for", "of", "with", "by", "it", "its",
  "and", "or", "but", "so", "if", "as", "do", "did", "has", "had",
  "not", "no", "my", "your", "his", "her", "we", "they", "them",
  "this", "that", "just", "like", "up", "out", "all", "got", "i'm",
  "i", "me",
]);

export function getDefaultEmphasis(word: string): number {
  return FILLER_WORDS.has(word.toLowerCase()) ? 1 : 2;
}


// ─── Scene Tone → Per-Section Tone ───────────────────────────────

export type ToneValue = "dark" | "light";

export function getSectionTones(sceneTone: string, count: number): ToneValue[] {
  switch (sceneTone) {
    case "light":
      return Array(count).fill("light");
    case "mixed-dawn": {
      const t: ToneValue[] = Array(count).fill("dark");
      const lightStart = Math.floor(count * 0.66);
      for (let i = lightStart; i < count; i += 1) t[i] = "light";
      return t;
    }
    case "mixed-dusk": {
      const t: ToneValue[] = Array(count).fill("light");
      const darkStart = Math.floor(count * 0.66);
      for (let i = darkStart; i < count; i += 1) t[i] = "dark";
      return t;
    }
    case "mixed-pulse": {
      const t: ToneValue[] = Array(count).fill("dark");
      const lightStart = Math.floor(count * 0.33);
      const lightEnd = Math.floor(count * 0.66);
      for (let i = lightStart; i < lightEnd; i += 1) t[i] = "light";
      return t;
    }
    default:
      return Array(count).fill("dark");
  }
}


// ─── Emotional Arc → Intensity Curve ─────────────────────────────

export function getIntensityCurve(arc: string): (progress: number) => number {
  switch (arc) {
    case "slow-burn":
      return (p) => 0.2 + p * 0.8;
    case "surge":
      return (p) => 0.5 + p * 0.5;
    case "collapse":
      return (p) => 1.0 - p * 0.7;
    case "dawn":
      return (p) => 0.1 + p * 0.9;
    case "flatline":
      return () => 0.5;
    case "eruption":
      return (p) => (p < 0.3 ? 0.2 + p * 1.5 : p < 0.7 ? 0.65 + (p - 0.3) * 0.875 : 1.0);
    default:
      return (p) => 0.3 + p * 0.7;
  }
}


// ─── Section Audio → Dynamic Modifiers ───────────────────────────

export interface SectionModifiers {
  particleDensityScale: number;
  beatResponseScale: number;
  textScale: number;
  transitionType: "hard-cut" | "cross-dissolve" | "flash-cut";
}

export function getSectionModifiers(
  section: { avgEnergy: number; energyDelta: number; role: string },
): SectionModifiers {
  const e = clamp01(section.avgEnergy);
  const delta = Math.abs(section.energyDelta);

  let transitionType: SectionModifiers["transitionType"];
  if (delta > 0.6) transitionType = "flash-cut";
  else if (delta > 0.35) transitionType = "hard-cut";
  else transitionType = "cross-dissolve";

  const isChorus = section.role === "chorus" || section.role === "drop";

  return {
    particleDensityScale: clamp01(isChorus ? Math.max(0.7, 0.3 + e * 0.7) : 0.3 + e * 0.7),
    beatResponseScale: clamp01(isChorus ? Math.max(0.7, 0.2 + e * 0.8) : 0.2 + e * 0.8),
    textScale: clamp(isChorus ? Math.max(1.05, 0.9 + e * 0.2) : 0.9 + e * 0.2, 0.8, 1.3),
    transitionType,
  };
}


// ─── Word Directive Lookup ───────────────────────────────────────

export type WordDirectiveMap = Map<string, {
  emphasisLevel: number;
  entry: string;
  behavior: string;
  exit: string;
  trail?: string;
  ghostTrail?: boolean;
  ghostDirection?: string;
  letterSequence?: boolean;
  visualMetaphor?: string;
}>;

export function buildWordDirectiveMap(directives: any[]): WordDirectiveMap {
  const map: WordDirectiveMap = new Map();
  for (const d of directives) {
    const key = String(d.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key) map.set(key, d);
  }
  return map;
}

export function lookupWord(map: WordDirectiveMap, word: string) {
  const key = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  return map.get(key) ?? null;
}


// ─── Per-Frame State ─────────────────────────────────────────────

export interface FrameRenderState {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "uppercase" | "none";
  lineHeight: number;

  gravity: string;
  tension: number;
  damping: number;
  beatResponse: string;
  beatResponseScale: number;

  particleSystem: string;
  particleDensity: number;
  particleSpeed: number;
  particleOpacity: number;
  particleBeatReactive: boolean;
  particleDirection: string;

  imageOpacity: number;
  vignetteStrength: number;
  blurRadius: number;
  grainOpacity: number;
  tintStrength: number;
  tone: ToneValue;

  intensity: number;

  transitionType: "hard-cut" | "cross-dissolve" | "flash-cut";

  // ── Legacy manifest fields (used by LyricDisplay, LightingSystem, renderText, etc.) ──
  world?: string;
  coreEmotion?: string;
  backgroundSystem?: string;
  lightSource?: string;
  palette?: string[];
  contrastMode?: string;
  backgroundIntensity?: number;
  letterPersonality?: string;
  decay?: number;
  stackBehavior?: string;
  lyricEntrance?: string;
  lyricExit?: string;
  typographyProfile?: {
    fontFamily?: string;
    fontWeight?: number;
    personality?: string;
    letterSpacing?: string;
    textTransform?: string;
  };
  particleConfig?: {
    system?: string;
    density?: number;
    speed?: number;
    opacity?: number;
    beatReactive?: boolean;
    direction?: string;
  };

  // Cinematic karaoke debug/dev flags
  debugHud?: boolean;
  enableEchoLine?: boolean;
  wordFeatherMs?: number;
}

export function deriveFrameState(
  direction: any,
  sectionIndex: number,
  songProgress: number,
  audioSection?: { avgEnergy: number; energyDelta: number; role: string },
): FrameRenderState {
  const sections = direction.sections ?? [];
  const section = sections[sectionIndex] ?? {};

  const motionPreset = section.motion ?? direction.motion ?? "fluid";
  const typographyPreset = section.typography ?? direction.typography ?? "clean-modern";
  const texturePreset = section.texture ?? direction.texture ?? "dust";
  const atmospherePreset = section.atmosphere ?? direction.atmosphere ?? "cinematic";

  const typo = getTypography(typographyPreset);
  const physics = getPhysics(motionPreset);
  const particles = getParticles(texturePreset);
  const overlay = getOverlay(atmospherePreset);
  const intensity = getIntensityCurve(direction.emotionalArc ?? "slow-burn")(songProgress);
  const tones = getSectionTones(direction.sceneTone ?? "dark", sections.length);

  const mods = audioSection
    ? getSectionModifiers(audioSection)
    : {
      particleDensityScale: 1,
      beatResponseScale: 1,
      textScale: 1,
      transitionType: "cross-dissolve" as const,
    };

  return {
    fontFamily: typo.fontFamily,
    fontWeight: typo.fontWeight,
    letterSpacing: typo.letterSpacing,
    textTransform: typo.textTransform,
    lineHeight: typo.lineHeight,

    gravity: physics.gravity,
    tension: clamp01(physics.tension * intensity),
    damping: physics.damping,
    beatResponse: physics.beatResponse,
    beatResponseScale: clamp01(mods.beatResponseScale * intensity),

    particleSystem: particles.system,
    particleDensity: clamp01(particles.density * mods.particleDensityScale * intensity),
    particleSpeed: clamp01(particles.speed * intensity),
    particleOpacity: particles.opacity,
    particleBeatReactive: particles.beatReactive,
    particleDirection: particles.direction,

    imageOpacity: overlay.imageOpacity,
    vignetteStrength: overlay.vignetteStrength,
    blurRadius: overlay.blurRadius,
    grainOpacity: overlay.grainOpacity,
    tintStrength: overlay.tintStrength,
    tone: tones[sectionIndex] ?? "dark",

    intensity,
    transitionType: mods.transitionType,
  };
}
