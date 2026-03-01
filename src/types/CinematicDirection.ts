/**
 * CinematicDirection — unified type supporting both:
 * - NEW format (sceneTone, sections, wordDirectives as array, storyboard)
 * - OLD format fields (kept as optional for backward compat during migration)
 *
 * New consumers should use directionResolvers.ts utilities.
 * Old fields will be removed once all consumers are migrated.
 */

// ── Primary new-schema fields ────────────────────────────────

export interface CinematicDirection {
  // New backend fields (v2 prompt)
  sceneTone?: string;
  atmosphere?: string;
  motion?: string;
  typography?: string;
  texture?: string;
  emotionalArc?: string;
  palette?: string;
  sections?: CinematicSection[];

  // WordDirectives: new format = array, old format = Record
  // Consumers should use directionResolvers.buildWordDirectiveMap() for lookup
  wordDirectives?: WordDirective[] | Record<string, WordDirective>;

  // Storyboard: new format = StoryboardEntry[], old = LineDirection[]
  storyboard?: StoryboardEntry[] | LineDirection[];

  // ── Legacy fields (deprecated — use resolvers instead) ─────
  /** @deprecated Use emotionalArc + resolvers */
  thesis?: string;
  /** @deprecated Use resolvers: resolveTypography(), resolveMotionPhysics() */
  visualWorld?: VisualWorld;
  /** @deprecated Use sections + enrichSections() */
  chapters?: Chapter[];
  /** @deprecated Use emotionalArc + deriveTensionCurve() */
  tensionCurve?: TensionStage[];
  /** @deprecated Use emotionalArc + deriveClimaxRatio() */
  climax?: ClimaxDirective;
  /** @deprecated */
  ending?: EndingDirective;
}

// ── New section type ─────────────────────────────────────────

export interface CinematicSection {
  sectionIndex: number;
  description: string;
  mood?: string;
  /** Visual mood keyword from fixed vocabulary — drives cinematic grading */
  visualMood?: string;
  motion?: string;
  texture?: string;
  typography?: string;
  atmosphere?: string;
  /** Time boundary in seconds (from audioSections) */
  startSec?: number;
  /** Time boundary in seconds (from audioSections) */
  endSec?: number;
  /** Computed by enrichSections() — ratio 0–1 */
  startRatio?: number;
  /** Computed by enrichSections() — ratio 0–1 */
  endRatio?: number;
}

export interface StoryboardEntry {
  lineIndex: number;
  text?: string;
  heroWord?: string;
  entryStyle?: string;
  exitStyle?: string;
  emotionalIntent?: string;
  visualTreatment?: string;
  particleBehavior?: string;
  beatAlignment?: string;
  transitionToNext?: string;
}

// ── Word directive (supports both v1 and v2 fields) ──────────

export interface WordDirective {
  word: string;
  emphasisLevel: number;
  // v2 fields
  entry?: string | null;
  behavior?: string | null;
  exit?: string | null;
  trail?: string | null;
  ghostTrail?: boolean;
  ghostDirection?: 'up' | 'down' | 'left' | 'right' | 'radial' | null;
  letterSequence?: boolean;
  visualMetaphor?: string | null;
  heroPresentation?: 'inline-scale' | 'delayed-reveal' | 'isolation' | 'vertical-lift' | 'vertical-drop' | 'tracking-expand' | 'dim-surroundings' | null;
  // v1 legacy fields
  kineticClass?:
    | 'RUNNING' | 'FALLING' | 'SPINNING' | 'FLOATING' | 'SHAKING' | 'RISING'
    | 'BREAKING' | 'HIDING' | 'NEGATION' | 'CRYING' | 'SCREAMING' | 'WHISPERING'
    | 'IMPACT' | 'TENDER' | 'STILL' | null;
  elementalClass?:
    | 'FIRE' | 'WATER' | 'FROST' | 'SMOKE' | 'ELECTRIC'
    | 'ICE' | 'RAIN' | 'NEON' | null; // ICE/RAIN/NEON kept for legacy compat
  colorOverride?: string | null;
  specialEffect?: string | null;
  evolutionRule?: string | null;
}

// ── Tension stage (used by deriveTensionCurve) ───────────────

export interface TensionStage {
  stage: 'Setup' | 'Build' | 'Peak' | 'Release';
  startRatio: number;
  endRatio: number;
  motionIntensity: number;
  particleDensity: number;
  lightBrightness: number;
  cameraMovement: string;
  typographyAggression: number;
}

// (SymbolSystem, CameraLanguage, ShotType, SilenceDirective removed — dead V2 fields)

export interface VisualWorld {
  palette: [string, string, string];
  backgroundSystem: string;
  lightSource: string;
  particleSystem: string;
  typographyProfile: {
    fontFamily: string;
    fontWeight: number;
    personality: string;
    letterSpacing: string;
    textTransform: string;
  };
  physicsProfile: {
    weight: 'featherlight' | 'light' | 'normal' | 'heavy' | 'crushing';
    chaos: 'still' | 'restrained' | 'building' | 'chaotic' | 'explosive';
    heat: number;
    beatResponse: 'breath' | 'pulse' | 'slam' | 'drift' | 'shatter';
  };
}

export interface Chapter {
  sectionIndices?: number[];
  startSec?: number;
  endSec?: number;
  startRatio?: number;
  endRatio?: number;
  title: string;
  emotionalArc: string;
  dominantColor: string;
  lightBehavior: string;
  particleDirective: string;
  backgroundDirective: string;
  emotionalIntensity: number;
  typographyShift: string | null;
  motion?: string;
  texture?: string;
  typography?: string;
  atmosphere?: string;
  overrides?: Record<string, string | undefined>;
  sectionIndex?: number;
  description?: string;
  mood?: string;
}

export interface LineDirection {
  lineIndex: number;
  text: string;
  emotionalIntent: string;
  heroWord: string;
  visualTreatment: string;
  entryStyle:
    | 'fades' | 'slams-in' | 'rises' | 'materializes' | 'fractures-in' | 'cuts'
    | string;
  exitStyle:
    | 'fades' | 'dissolves-upward' | 'shatters' | 'burns-out' | 'drops' | 'lingers'
    | string;
  particleBehavior: string;
  beatAlignment: string;
  transitionToNext: string;
}

// (SilenceDirective removed — dead V2 field)

export interface ClimaxDirective {
  timeRatio: number;
  triggerLine: string;
  maxParticleDensity: number;
  maxLightIntensity: number;
  typographyBehavior: string;
  worldTransformation: string;
}

export interface EndingDirective {
  style: 'linger' | 'fade' | 'snap' | 'dissolve';
  emotionalAftertaste: string;
  particleResolution: string;
  lightResolution: string;
}
