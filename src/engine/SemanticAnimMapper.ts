/**
 * SemanticAnimMapper — The word IS the directive.
 *
 * Design principle: if a word has obvious visual semantics, it should
 * animate accordingly WITHOUT any AI annotation. "Red" turns red.
 * "Wave" undulates in. "Spin" rotates. "Whisper" fades softly.
 *
 * Priority chain (unchanged):
 *   manifest directive > wordDirectives (AI) > SEMANTIC AUTO-MAP > storyboard > motion defaults
 *
 * This module is the "SEMANTIC AUTO-MAP" layer — a pure function from
 * normalized word text → partial visual overrides. Returns null for
 * words with no obvious semantic mapping (the vast majority).
 *
 * Rules are intentionally conservative: only map when the visual
 * metaphor is OBVIOUS to any human viewer. "Clockwork" spins.
 * "Falling" drops. "Gold" is gold. No ambiguity.
 */

import type { EntryStyle, ExitStyle, BehaviorStyle } from '@/lib/sceneCompiler';

// ═══════════════════════════════════════════════════════════════
// Public interface
// ═══════════════════════════════════════════════════════════════

export interface SemanticOverride {
  entry?: EntryStyle;
  exit?: ExitStyle;
  behavior?: BehaviorStyle;
  colorOverride?: string;
  /** Extra glow multiplier (stacks with existing glow pipeline) */
  glowMult?: number;
}

/**
 * Pure function: word text → visual overrides (or null).
 * Runs at compile time (once per word), not per-frame.
 */
export function getSemanticOverride(word: string): SemanticOverride | null {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean || clean.length < 2) return null;

  // Walk the rule categories in priority order.
  // First match wins — categories are ordered from most specific to most general.
  return matchColor(clean)
    ?? matchRotation(clean)
    ?? matchVerticalMotion(clean)
    ?? matchHorizontalMotion(clean)
    ?? matchImpact(clean)
    ?? matchExplosion(clean)
    ?? matchWater(clean)
    ?? matchFire(clean)
    ?? matchCold(clean)
    ?? matchLight(clean)
    ?? matchDark(clean)
    ?? matchSize(clean)
    ?? matchSpeed(clean)
    ?? matchGentle(clean)
    ?? matchTremor(clean)
    ?? matchWeight(clean)
    ?? matchDisappear(clean)
    ?? matchGrowth(clean)
    ?? matchTime(clean)
    ?? null;
}


// ═══════════════════════════════════════════════════════════════
// Rule categories — each is a self-contained matcher
// ═══════════════════════════════════════════════════════════════
// Pattern: Set of stems/words → SemanticOverride
// Uses startsWith for stems (e.g. "burn" matches "burning", "burned")
// Uses exact match for short/ambiguous words (e.g. "red", "up")

// ── COLORS ────────────────────────────────────────────────────
// "The word is 'red', it should turn red."

const COLOR_MAP: [string[], string][] = [
  [['red'],                           '#EF4444'],
  [['blue'],                          '#3B82F6'],
  [['green'],                         '#22C55E'],
  [['gold', 'golden'],               '#FFD700'],
  [['purple'],                        '#A855F7'],
  [['pink'],                          '#EC4899'],
  [['orange'],                        '#F97316'],
  [['yellow'],                        '#FBBF24'],
  [['white'],                         '#FFFFFF'],
  [['black'],                         '#1A1A2E'],
  [['silver'],                        '#C0C0C0'],
  [['crimson'],                       '#DC143C'],
  [['scarlet'],                       '#FF2400'],
  [['violet'],                        '#8B5CF6'],
  [['neon'],                          '#39FF14'],
  [['ruby'],                          '#E0115F'],
  [['emerald'],                       '#50C878'],
  [['sapphire'],                      '#0F52BA'],
  [['copper'],                        '#B87333'],
  [['bronze'],                        '#CD7F32'],
  [['ivory'],                         '#FFFFF0'],
  [['grey', 'gray'],                  '#9CA3AF'],
  [['blood', 'bleed', 'bleeding'],    '#8B0000'],
];

function matchColor(w: string): SemanticOverride | null {
  for (const [words, color] of COLOR_MAP) {
    if (words.some(c => w === c || (c.length >= 4 && w.startsWith(c)))) {
      return { colorOverride: color, glowMult: 0.5 };
    }
  }
  return null;
}

// ── ROTATION ──────────────────────────────────────────────────
// "Clockwork spun around like a clock."
const ROTATION_WORDS = ['spin', 'spinning', 'twist', 'twisting', 'turn', 'turning', 'rotate', 'rotating', 'clockwork', 'clock', 'wheel', 'whirl', 'swirl', 'spiral', 'tornado', 'cyclone', 'vortex', 'revolve', 'orbit', 'circle', 'dizzy', 'round'];

function matchRotation(w: string): SemanticOverride | null {
  if (ROTATION_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'spin-in', exit: 'spin-out', behavior: 'pendulum' };
  }
  return null;
}

// ── VERTICAL MOTION (up) ──────────────────────────────────────
const RISE_WORDS = ['rise', 'rising', 'fly', 'flying', 'soar', 'soaring', 'float', 'floating', 'heaven', 'sky', 'ascend', 'above', 'higher', 'lift', 'elevate', 'launch', 'takeoff', 'angel'];

function matchVerticalMotion(w: string): SemanticOverride | null {
  // Rising
  if (RISE_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'rise', exit: 'soar', behavior: 'float' };
  }
  // Falling
  const FALL_WORDS = ['fall', 'falling', 'drop', 'dropping', 'sink', 'sinking', 'plunge', 'dive', 'down', 'descend', 'crash', 'collapse', 'tumble', 'gravity'];
  if (FALL_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'drop', exit: 'gravity-fall' };
  }
  return null;
}

// ── HORIZONTAL MOTION ─────────────────────────────────────────
const RUSH_WORDS = ['run', 'running', 'rush', 'rushing', 'race', 'racing', 'chase', 'chasing', 'sprint', 'dash', 'bolt', 'speed', 'fast', 'quick', 'rapid', 'zoom', 'flash'];
const DRIFT_WORDS = ['drift', 'drifting', 'glide', 'gliding', 'sail', 'sailing', 'cruise', 'cruising', 'coast', 'wander', 'roam', 'stroll', 'flow', 'flowing', 'stream', 'breeze'];

function matchHorizontalMotion(w: string): SemanticOverride | null {
  if (RUSH_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'punch-in', exit: 'punch-out', behavior: 'lean' };
  }
  if (DRIFT_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'drift-in', exit: 'drift-up', behavior: 'float' };
  }
  return null;
}

// ── IMPACT ────────────────────────────────────────────────────
const IMPACT_WORDS = ['slam', 'smash', 'hit', 'punch', 'kick', 'stomp', 'pound', 'strike', 'smack', 'bash', 'hammer', 'knock', 'bang', 'thud', 'crush', 'wreck'];

function matchImpact(w: string): SemanticOverride | null {
  if (IMPACT_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'slam-down', exit: 'shatter', behavior: 'vibrate' };
  }
  return null;
}

// ── EXPLOSION ─────────────────────────────────────────────────
const EXPLODE_WORDS = ['explode', 'explosion', 'bomb', 'boom', 'blast', 'rocket', 'detonate', 'erupt', 'burst', 'kaboom', 'firework', 'fireworks', 'dynamite', 'missile'];

function matchExplosion(w: string): SemanticOverride | null {
  if (EXPLODE_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'explode-in', exit: 'scatter-fly', glowMult: 1.5 };
  }
  return null;
}

// ── WATER ─────────────────────────────────────────────────────
// "Wave should come in like a wave."
const WATER_WORDS = ['wave', 'waves', 'ocean', 'surf', 'surfing', 'surfin', 'tide', 'sea', 'swim', 'swimming', 'pour', 'pouring', 'drown', 'drowning', 'splash', 'ripple', 'current', 'underwater'];

function matchWater(w: string): SemanticOverride | null {
  if (WATER_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'melt-in', exit: 'evaporate', behavior: 'float', colorOverride: '#38BDF8' };
  }
  return null;
}

// ── FIRE ──────────────────────────────────────────────────────
const FIRE_WORDS = ['fire', 'flame', 'flames', 'burn', 'burning', 'blaze', 'blazing', 'inferno', 'heat', 'ember', 'embers', 'ignite', 'scorch', 'torch', 'hell', 'lava', 'volcanic'];

function matchFire(w: string): SemanticOverride | null {
  if (FIRE_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'rise', exit: 'burn-out', behavior: 'flicker', colorOverride: '#FF8C00', glowMult: 2.0 };
  }
  return null;
}

// ── COLD/ICE ──────────────────────────────────────────────────
const COLD_WORDS = ['freeze', 'frozen', 'ice', 'icy', 'cold', 'frost', 'frosty', 'winter', 'snow', 'arctic', 'chill', 'chilling', 'frigid', 'glacier', 'blizzard'];

function matchCold(w: string): SemanticOverride | null {
  if (COLD_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'snap-in', exit: 'freeze-crack', behavior: 'freeze', colorOverride: '#A8D8EA' };
  }
  return null;
}

// ── LIGHT/SHINE ───────────────────────────────────────────────
const LIGHT_WORDS = ['light', 'lights', 'shine', 'shining', 'shiny', 'glow', 'glowing', 'bright', 'brillian', 'radiant', 'radiance', 'illuminate', 'luminous', 'spark', 'sparkle', 'stars', 'star', 'sun', 'sunrise', 'dawn', 'ray', 'rays', 'beam', 'flash', 'dazzle', 'shimmer', 'twinkle', 'gleam', 'spotlight'];

function matchLight(w: string): SemanticOverride | null {
  if (LIGHT_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'bloom', exit: 'burn-out', colorOverride: '#FFD700', glowMult: 2.5 };
  }
  return null;
}

// ── DARK/SHADOW ───────────────────────────────────────────────
const DARK_WORDS = ['dark', 'darkness', 'shadow', 'shadows', 'midnight', 'night', 'void', 'abyss', 'black', 'blackout', 'eclipse', 'obsidian'];

function matchDark(w: string): SemanticOverride | null {
  if (DARK_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'surface', exit: 'vanish', colorOverride: '#2D2D3F', glowMult: 0 };
  }
  return null;
}

// ── SIZE ──────────────────────────────────────────────────────
const BIG_WORDS = ['big', 'huge', 'massive', 'giant', 'enormous', 'colossal', 'titan', 'mega', 'monster', 'beast', 'immense', 'king', 'throne'];
const SMALL_WORDS = ['small', 'tiny', 'little', 'micro', 'mini', 'atom', 'ant', 'grain', 'speck', 'whisper'];

function matchSize(w: string): SemanticOverride | null {
  if (BIG_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'explode-in', exit: 'dissolve' };
  }
  if (SMALL_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'whisper', exit: 'evaporate' };
  }
  return null;
}

// ── SPEED (instant appearance) ────────────────────────────────
const SNAP_WORDS = ['snap', 'instant', 'sudden', 'blink', 'click', 'now', 'stop', 'bang', 'pop'];

function matchSpeed(w: string): SemanticOverride | null {
  if (SNAP_WORDS.some(r => w === r)) {
    return { entry: 'snap-in', exit: 'snap-out' };
  }
  return null;
}

// ── GENTLE/SOFT ───────────────────────────────────────────────
const GENTLE_WORDS = ['soft', 'gentle', 'quiet', 'silence', 'silent', 'peace', 'peaceful', 'calm', 'still', 'tender', 'delicate', 'feather', 'breath', 'breathe', 'sigh', 'lullaby', 'hush'];

function matchGentle(w: string): SemanticOverride | null {
  if (GENTLE_WORDS.some(r => w === r || (r.length >= 5 && w.startsWith(r)))) {
    return { entry: 'whisper', exit: 'exhale', behavior: 'float' };
  }
  return null;
}

// ── TREMOR/SHAKE ──────────────────────────────────────────────
const TREMOR_WORDS = ['shake', 'shaking', 'shaky', 'tremble', 'trembling', 'shiver', 'shivering', 'earthquake', 'quake', 'vibrate', 'nervous', 'anxiety', 'scared', 'terrified', 'panic', 'afraid'];

function matchTremor(w: string): SemanticOverride | null {
  if (TREMOR_WORDS.some(r => w === r || (r.length >= 5 && w.startsWith(r)))) {
    return { entry: 'shatter-in', behavior: 'vibrate' };
  }
  return null;
}

// ── WEIGHT/HEAVY ──────────────────────────────────────────────
const WEIGHT_WORDS = ['heavy', 'weight', 'load', 'loaded', 'burden', 'anchor', 'stone', 'boulder', 'mountain', 'concrete', 'iron', 'steel', 'chain', 'chains', 'gravity'];

function matchWeight(w: string): SemanticOverride | null {
  if (WEIGHT_WORDS.some(r => w === r || (r.length >= 5 && w.startsWith(r)))) {
    return { entry: 'stomp', exit: 'gravity-fall' };
  }
  return null;
}

// ── DISAPPEAR/GHOST ───────────────────────────────────────────
const VANISH_WORDS = ['ghost', 'vanish', 'disappear', 'invisible', 'phantom', 'fade', 'fading', 'gone', 'lost', 'empty', 'hollow', 'nothing', 'nowhere', 'void'];

function matchDisappear(w: string): SemanticOverride | null {
  if (VANISH_WORDS.some(r => w === r || (r.length >= 5 && w.startsWith(r)))) {
    return { entry: 'materialize', exit: 'vanish', behavior: 'flicker' };
  }
  return null;
}

// ── GROWTH/BLOOM ──────────────────────────────────────────────
const GROWTH_WORDS = ['grow', 'growing', 'bloom', 'blooming', 'blossom', 'flower', 'plant', 'seed', 'sprout', 'evolve', 'expand', 'spread', 'unfold'];

function matchGrowth(w: string): SemanticOverride | null {
  if (GROWTH_WORDS.some(r => w === r || (r.length >= 4 && w.startsWith(r)))) {
    return { entry: 'bloom', exit: 'evaporate', behavior: 'grow' };
  }
  return null;
}

// ── TIME/PATIENCE ─────────────────────────────────────────────
const TIME_WORDS = ['time', 'patience', 'patient', 'wait', 'waiting', 'forever', 'eternal', 'infinity', 'infinite', 'slow', 'slowly', 'timeless', 'century', 'decades', 'moment', 'second'];

function matchTime(w: string): SemanticOverride | null {
  if (TIME_WORDS.some(r => w === r || (r.length >= 5 && w.startsWith(r)))) {
    return { entry: 'breathe-in', exit: 'linger', behavior: 'pulse' };
  }
  return null;
}
