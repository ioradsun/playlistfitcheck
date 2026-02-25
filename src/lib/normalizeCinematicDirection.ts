/**
 * normalizeCinematicDirection — adapter that converts the NEW backend output
 * (sceneTone, sections, wordDirectives-as-array, storyboard) into the
 * internal format the engine still expects (chapters, wordDirectives-as-Record,
 * tensionCurve, visualWorld, cameraLanguage, etc.).
 *
 * This allows us to keep the rendering engine untouched while the backend
 * has been restructured.
 *
 * If the input already has `chapters` (old format), it is returned as-is.
 */

import type { CinematicDirection, Chapter, TensionStage, WordDirective } from "@/types/CinematicDirection";

// ── New backend types ────────────────────────────────────────
interface NewSection {
  sectionIndex: number;
  description: string;
  mood?: string;
  motion?: string;
  texture?: string;
  typography?: string;
  atmosphere?: string;
}

interface NewStoryboardEntry {
  lineIndex: number;
  heroWord: string;
  entryStyle: string;
  exitStyle: string;
}

interface NewWordDirective {
  word: string;
  emphasisLevel: number;
  entry?: string;
  behavior?: string;
  exit?: string;
  trail?: string;
  ghostTrail?: boolean;
  ghostDirection?: string;
  letterSequence?: boolean;
  visualMetaphor?: string;
}

// ── Motion → physics mapping ─────────────────────────────────
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

// ── Atmosphere → background system ───────────────────────────
const ATMOSPHERE_BG: Record<string, string> = {
  void: "void", cinematic: "cosmic", haze: "intimate", split: "urban",
  grain: "grunge", wash: "intimate", glass: "neon", clean: "cosmic",
};

// ── Typography name → profile ────────────────────────────────
const TYPO_FAMILIES: Record<string, string> = {
  "bold-impact": "Oswald", "clean-modern": "Montserrat",
  "elegant-serif": "Playfair Display", "raw-condensed": "Barlow Condensed",
  "whisper-soft": "Nunito", "tech-mono": "JetBrains Mono",
  "display-heavy": "Bebas Neue", "editorial-light": "Cormorant Garamond",
};
const TYPO_WEIGHTS: Record<string, number> = {
  "bold-impact": 700, "clean-modern": 600, "elegant-serif": 500,
  "raw-condensed": 600, "whisper-soft": 400, "tech-mono": 500,
  "display-heavy": 400, "editorial-light": 400,
};
const TYPO_TRANSFORMS: Record<string, string> = {
  "bold-impact": "uppercase", "raw-condensed": "uppercase",
  "display-heavy": "uppercase",
};
const TYPO_PERSONALITY: Record<string, string> = {
  "bold-impact": "POWER", "clean-modern": "NEUTRAL",
  "elegant-serif": "SOULFUL", "raw-condensed": "RAW",
  "whisper-soft": "GENTLE", "tech-mono": "FUTURE",
  "display-heavy": "STATEMENT", "editorial-light": "POETIC",
};

// ── emotionalArc → tensionCurve ──────────────────────────────
function synthesizeTensionCurve(arc: string): TensionStage[] {
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
  return curves[arc] ?? curves["slow-burn"]!;
}

// ── Entry point ──────────────────────────────────────────────

export function normalizeCinematicDirection(raw: unknown): CinematicDirection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const d = raw as Record<string, unknown>;

  // Already old format? Return as-is.
  if (d.chapters && Array.isArray(d.chapters) && (d.chapters as any[])[0]?.startRatio !== undefined) {
    return raw as CinematicDirection;
  }

  // ── New format detected — synthesize old fields ────────────
  const motion = (d.motion as string) ?? "fluid";
  const typography = (d.typography as string) ?? "clean-modern";
  const atmosphere = (d.atmosphere as string) ?? "cinematic";
  const texture = (d.texture as string) ?? "dust";
  const emotionalArc = (d.emotionalArc as string) ?? "slow-burn";
  const sceneTone = (d.sceneTone as string) ?? "dark";
  const sections = (d.sections as NewSection[]) ?? [];
  const newStoryboard = (d.storyboard as NewStoryboardEntry[]) ?? [];
  const newWordDirectives = (d.wordDirectives as NewWordDirective[]) ?? [];

  // Synthesize chapters from sections
  const sectionCount = Math.max(1, sections.length);
  const chapters: Chapter[] = sections.map((s, i) => ({
    startRatio: i / sectionCount,
    endRatio: (i + 1) / sectionCount,
    title: s.description?.slice(0, 60) ?? `Section ${i}`,
    emotionalArc: s.mood ?? emotionalArc,
    dominantColor: "",
    lightBehavior: atmosphere === "haze" ? "soft" : "cinematic",
    particleDirective: s.texture ?? texture,
    backgroundDirective: s.description ?? "",
    emotionalIntensity: 0.5 + (i / sectionCount) * 0.5,
    typographyShift: null,
    // Preserve new section fields as overrides
    motion: s.motion,
    texture: s.texture,
    typography: s.typography,
    atmosphere: s.atmosphere,
    overrides: {
      motion: s.motion,
      texture: s.texture,
      typography: s.typography,
      atmosphere: s.atmosphere,
    },
    sectionIndex: s.sectionIndex,
    description: s.description,
    mood: s.mood,
  }));

  // If no sections, create 3 default chapters
  if (chapters.length === 0) {
    chapters.push(
      { startRatio: 0, endRatio: 0.33, title: "Opening", emotionalArc, dominantColor: "", lightBehavior: "cinematic", particleDirective: texture, backgroundDirective: "", emotionalIntensity: 0.4, typographyShift: null },
      { startRatio: 0.33, endRatio: 0.66, title: "Middle", emotionalArc, dominantColor: "", lightBehavior: "cinematic", particleDirective: texture, backgroundDirective: "", emotionalIntensity: 0.7, typographyShift: null },
      { startRatio: 0.66, endRatio: 1, title: "Climax", emotionalArc, dominantColor: "", lightBehavior: "cinematic", particleDirective: texture, backgroundDirective: "", emotionalIntensity: 1.0, typographyShift: null },
    );
  }

  // Convert wordDirectives array → Record
  const wordDirectivesRecord: Record<string, WordDirective> = {};
  for (const wd of newWordDirectives) {
    const key = (wd.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) continue;
    wordDirectivesRecord[key] = {
      word: wd.word,
      kineticClass: null,
      elementalClass: null,
      emphasisLevel: wd.emphasisLevel ?? 3,
      colorOverride: null,
      specialEffect: null,
      evolutionRule: null,
      entry: wd.entry ?? null,
      behavior: wd.behavior ?? null,
      exit: wd.exit ?? null,
      trail: wd.trail ?? null,
      ghostTrail: wd.ghostTrail ?? false,
      ghostDirection: (wd.ghostDirection as any) ?? null,
      letterSequence: wd.letterSequence ?? false,
      visualMetaphor: wd.visualMetaphor ?? null,
    };
  }

  // Synthesize storyboard (map new format to old)
  const storyboard = newStoryboard.map((s) => ({
    lineIndex: s.lineIndex,
    text: "",
    emotionalIntent: "",
    heroWord: s.heroWord ?? "",
    visualTreatment: "",
    entryStyle: s.entryStyle ?? "materializes",
    exitStyle: s.exitStyle ?? "dissolves",
    particleBehavior: "",
    beatAlignment: "",
    transitionToNext: "",
  }));

  // Synthesize visualWorld
  const fontFamily = TYPO_FAMILIES[typography] ?? "Montserrat";
  const fontWeight = TYPO_WEIGHTS[typography] ?? 600;
  const heat = MOTION_HEAT[motion] ?? 0.5;

  const visualWorld = {
    palette: ["#0a0a0f", "#a855f7", "#ffffff"] as [string, string, string],
    backgroundSystem: ATMOSPHERE_BG[atmosphere] ?? "cosmic",
    lightSource: "top-diffuse",
    particleSystem: texture,
    typographyProfile: {
      fontFamily,
      fontWeight,
      personality: TYPO_PERSONALITY[typography] ?? "NEUTRAL",
      letterSpacing: "0.02em",
      textTransform: TYPO_TRANSFORMS[typography] ?? "none",
    },
    physicsProfile: {
      weight: (MOTION_WEIGHT[motion] ?? "normal") as any,
      chaos: (MOTION_CHAOS[motion] ?? "restrained") as any,
      heat,
      beatResponse: (MOTION_BEAT[motion] ?? "pulse") as any,
    },
  };

  // Synthesize tensionCurve
  const tensionCurve = synthesizeTensionCurve(emotionalArc);

  // Synthesize camera language
  const cameraLanguage = {
    openingDistance: "Wide" as const,
    closingDistance: "Medium" as const,
    movementType: (motion === "drift" ? "Drift" : motion === "weighted" ? "PushIn" : "Drift") as any,
    climaxBehavior: "shake-zoom",
    distanceByChapter: chapters.map((_, i) => ({
      chapterIndex: i,
      distance: i === 0 ? "Wide" : i >= chapters.length - 1 ? "Close" : "Medium",
      movement: motion === "drift" ? "Drift" : "PushIn",
    })),
  };

  // Build the synthesized climax
  const climaxRatio = emotionalArc === "eruption" ? 0.6 : emotionalArc === "collapse" ? 0.15 : 0.65;
  const climax = {
    timeRatio: climaxRatio,
    triggerLine: "",
    maxParticleDensity: 1.0,
    maxLightIntensity: 1.0,
    typographyBehavior: "expand",
    worldTransformation: "intensify",
  };

  return {
    // Old fields (synthesized for engine compat)
    thesis: "",
    visualWorld,
    chapters,
    wordDirectives: wordDirectivesRecord,
    storyboard,
    silenceDirective: { cameraMovement: "Drift", particleShift: "fade", lightShift: "dim", tensionDirection: "holding" as const },
    climax,
    ending: { style: "fade" as const, emotionalAftertaste: "", particleResolution: "dissolve", lightResolution: "fade" },
    symbolSystem: { primary: "", secondary: "", beginningState: "", middleMutation: "", climaxOverwhelm: "", endingDecay: "", interactionRules: [] },
    cameraLanguage,
    tensionCurve,
    shotProgression: [],

    // New fields (preserved for new consumers like FitTab)
    sceneTone,
    atmosphere,
    motion,
    typography,
    texture,
    emotionalArc,
    sections,
  } as CinematicDirection & Record<string, unknown>;
}
