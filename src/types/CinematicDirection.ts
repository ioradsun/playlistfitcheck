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

  /** AI-grouped phrases: which words appear on screen together.
   *  Each phrase is one "reading beat" — a complete thought the viewer reads and absorbs. */
  phrases?: CinematicPhrase[];

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
  structuralLabel?: string;
  /** AI boundary suggestion — only present for low-confidence sections */
  suggestedStartSec?: number;
  /** AI boundary suggestion — only present for low-confidence sections */
  suggestedEndSec?: number;
  /** How particles behave in this section */
  atmosphereState?: 'still' | 'drifting' | 'falling' | 'swirling';
  /** Section's dominant color — drives palette */
  dominantColor?: string;
}

export interface CinematicPhrase {
  /** Inclusive range of GLOBAL word indices in the flat word array.
   *  [0, 3] means words 0, 1, 2, 3 from the full song's word timestamps.
   *  Phrases can span across Whisper line boundaries. */
  wordRange: [number, number];
  /** Most impactful word in this phrase — UPPERCASE. Optional. */
  heroWord?: string;
  /** @deprecated — use wordRange with global indices instead */
  lineIndex?: number;
  /** How words are arranged on screen */
  composition?: "stack" | "line" | "center_word";
  /** Where the arrangement sits on canvas */
  bias?: "left" | "center" | "right";
  /** What carries visual emphasis */
  heroType?: "word" | "phrase";
  /** How the phrase appears */
  revealStyle?: "instant" | "stagger_fast" | "stagger_slow";
  /** How long it holds emotionally — renderer maps to actual timing */
  holdClass?: "short_hit" | "medium_groove" | "long_emotional";
  /** Role in the song's momentum */
  energyTier?: "intimate" | "groove" | "lift" | "impact" | "surprise";
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
  elementalClass?:
    | 'FIRE' | 'WATER' | 'FROST' | 'SMOKE' | 'ELECTRIC'
    | 'ICE' | 'RAIN' | 'NEON' | null; // ICE/RAIN/NEON kept for legacy compat
  /** Word appears alone on screen — requires word duration ≥ 700ms */
  isolation?: boolean;
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
