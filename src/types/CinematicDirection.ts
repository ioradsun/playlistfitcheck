/**
 * CinematicDirection — unified type supporting both:
 * - NEW format (character/world/particle + sections/phrases)
 * - OLD format fields (kept as optional for backward compat during migration)
 *
 * Contains active and legacy fields for DB compatibility.
 */

// ── Primary new-schema fields ────────────────────────────────

export interface FontProfile {
  force: 'low' | 'medium' | 'high';
  intimacy: 'low' | 'medium' | 'high';
  polish: 'raw' | 'clean' | 'elegant';
  theatricality: 'low' | 'medium' | 'high';
  era: 'timeless' | 'modern' | 'futuristic';
}

export interface CinematicDirection {
  // ── v2 fields (current) ──
  /** Song personality classification — maps to font genreFit */
  character?: string;
  /** Visual universe — one sentence, shared across all sections */
  world?: string;
  /** Ambient particle type for the entire song */
  particle?: string;

  sections?: CinematicSection[];

  /** AI-grouped phrases: which words appear on screen together */
  phrases?: CinematicPhrase[];
  hookPhrase?: string;

  // ── Legacy fields (kept for cached DB data only) ──
  /** @deprecated v1 — use character + fontResolver */
  typography?: string;
  /** @deprecated v1 — use character + fontResolver */
  fontProfile?: FontProfile;
  /** @deprecated v1 — particle is now song-level */
  texture?: string;
  /** @deprecated v1 */
  atmosphere?: string;
  /** @deprecated v1 */
  motion?: string;
  /** @deprecated v1 */
  palette?: string;
  /** @deprecated v1 */
  storyboard?: Record<string, any>[];
  /** @deprecated v1 */
  chorusText?: string;
  /** @deprecated v0 */
  thesis?: string;
  /** @deprecated v0 */
  visualWorld?: Record<string, any>;
  /** @deprecated v0 — use sections + enrichSections() */
  chapters?: Chapter[];
  /** @deprecated v0 */
  tensionCurve?: any[];
  /** @deprecated v0 */
  climax?: Record<string, any>;
  /** @deprecated v0 */
  ending?: Record<string, any>;
}

// ── New section type ─────────────────────────────────────────

export interface CinematicSection {
  sectionIndex: number;
  description: string;
  /** Visual mood — energy-derived in v2 */
  visualMood?: string;
  /** Dominant color hex — energy-derived in v2 */
  dominantColor?: string;
  /** Particle texture — same as song-level particle in v2 */
  texture?: string;
  /** Concrete visual nouns from AI (v2) */
  nouns?: string[];

  // ── Energy features (v2 — set by enrichSectionsWithEnergy) ──
  avgEnergy?: number;
  peakEnergy?: number;
  avgBrightness?: number;
  slope?: number;
  deltaFromPrev?: number;

  // ── Time boundaries ──
  startSec?: number;
  endSec?: number;
  /** Computed by enrichSections() */
  startRatio?: number;
  /** Computed by enrichSections() */
  endRatio?: number;

  // ── Legacy fields (kept for cached data) ──
  /** @deprecated v1 */
  mood?: string;
  /** @deprecated v1 */
  motion?: string;
  /** @deprecated v1 */
  atmosphere?: string;
  /** @deprecated v1 */
  typography?: string;
  /** @deprecated v1 */
  fontProfile?: FontProfile;
  /** @deprecated v1 */
  structuralLabel?: string;
  /** @deprecated v1 */
  suggestedStartSec?: number;
  /** @deprecated v1 */
  suggestedEndSec?: number;
  /** @deprecated v1 */
  atmosphereState?: 'still' | 'drifting' | 'falling' | 'swirling';
}

export interface CinematicPhrase {
  /** Inclusive range of GLOBAL word indices in the flat word array.
   *  [0, 3] means words 0, 1, 2, 3 from the full song's word timestamps.
   *  Phrases can span across Whisper line boundaries. */
  wordRange: [number, number];
  /** Most impactful word in this phrase — UPPERCASE. Optional. */
  heroWord?: string;
  /** AI-selected exit animation for this phrase */
  exitEffect?: 'fade' | 'drift_up' | 'shrink' | 'dissolve' | 'cascade' | 'scatter' | 'slam' | 'glitch' | 'burn';
  /** True if this phrase contains lyrics that repeat elsewhere in the song (chorus) */
  isChorus?: boolean;
  /** @deprecated — replaced by exitEffect */
  effect?: Record<string, any>;
  /** @deprecated — use wordRange with global indices instead */
  lineIndex?: number;
  /** KEPT: layout (assigned by client) */
  composition?: "stack" | "line" | "center_word";
  /** KEPT: layout (assigned by client) */
  bias?: "left" | "center" | "right";
  /** KEPT: layout (assigned by client) */
  revealStyle?: "instant" | "stagger_fast" | "stagger_slow";
  /** KEPT: layout (assigned by client) */
  holdClass?: "short_hit" | "medium_groove" | "long_emotional";
  /** KEPT: assigned by client-side shuffle deck */
  presentationMode?: string;
  /** KEPT: assigned by client-side shuffle deck */
  entryCharacter?: string;
  /** KEPT: assigned by client-side shuffle deck */
  exitCharacter?: string;
  /** KEPT: assigned by client-side shuffle deck */
  ghostPreview?: boolean;
  /** KEPT: assigned by client-side shuffle deck */
  vibrateOnHold?: boolean;
  /** KEPT: assigned by client-side shuffle deck */
  elementalWash?: boolean;
}

// (SymbolSystem, CameraLanguage, ShotType, SilenceDirective removed — dead V2 fields)

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
  fontProfile?: FontProfile;
  atmosphere?: string;
  overrides?: Record<string, string | undefined>;
  sectionIndex?: number;
  description?: string;
  mood?: string;
}

// (SilenceDirective removed — dead V2 field)
