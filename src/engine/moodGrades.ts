/**
 * moodGrades.ts — Maps visual mood keywords to cinematic grade parameters.
 *
 * The AI picks ONE mood keyword per section. The engine looks up the full
 * grade recipe here. No blending, no averaging — one mood, one look.
 *
 * Each grade controls:
 *  - Image treatment (brightness, saturation, contrast, temperature)
 *  - Blur (type, radius, rack focus behavior)
 *  - Grain (intensity, size — capped at 0.15)
 *  - Ken Burns motion intent
 *  - Text mode derived from final brightness (not stored)
 *
 * Vignette overlay was REMOVED — use brightness() filter for edge darkening.
 */

interface BlurGrade {
  type: 'none' | 'gaussian' | 'bloom' | 'tilt-shift';
  radius: number;           // retained for compatibility; currently always 0
  rackFocus?: boolean;      // sharp when vocal active, blur between
}

interface GrainGrade {
  intensity: number;        // 0-1 (capped at 0.15 at render time)
  size: number;             // px
}

export interface MoodGrade {
  // Image color treatment (applied via ctx.filter)
  brightness: number;       // 0-1 (0.5 = no change)
  saturation: number;       // 0-2 (1.0 = no change)
  contrast: number;         // 0-2 (1.0 = no change)
  temperature: number;      // -1 cold to +1 warm (applied as hue-rotate + sepia mix)

  // Blur
  blur: BlurGrade;

  // Film grain
  grain: GrainGrade;

  // Ken Burns motion intent
  motionIntent: 'push-in' | 'pull-out' | 'drift-up' | 'drift-down' | 'drift-lateral' | 'breathing' | 'stable' | 'handheld' | 'slow-zoom';

  // Intensity response — how much beats affect brightness
  beatBrightnessGain: number;  // 0-0.1 typically

}

const MOOD_GRADES: Record<string, MoodGrade> = {

  // ── DARK MOODS (cool, desaturated, contrasty — but VISIBLE) ──

  noir: {
    brightness: 0.40,
    saturation: 0.45,
    contrast: 1.30,
    temperature: -0.25,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.12, size: 1.2 },
    motionIntent: 'stable',
    beatBrightnessGain: 0.05,
  },

  haunted: {
    brightness: 0.38,
    saturation: 0.40,
    contrast: 1.20,
    temperature: -0.30,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.12, size: 1.8 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.04,
  },

  eerie: {
    brightness: 0.40,
    saturation: 0.45,
    contrast: 1.25,
    temperature: -0.30,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 0.8 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.06,
  },

  melancholy: {
    brightness: 0.42,
    saturation: 0.50,
    contrast: 1.05,
    temperature: -0.05,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 1.5 },
    motionIntent: 'drift-down',
    beatBrightnessGain: 0.04,
  },

  // ── MEDIUM MOODS (warm or neutral, moderate treatment) ──

  intimate: {
    brightness: 0.45,
    saturation: 0.70,
    contrast: 1.05,
    temperature: 0.15,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 1.5 },
    motionIntent: 'push-in',
    beatBrightnessGain: 0.06,
  },

  vulnerable: {
    brightness: 0.47,
    saturation: 0.60,
    contrast: 0.95,
    temperature: 0.10,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 1.5 },
    motionIntent: 'breathing',
    beatBrightnessGain: 0.04,
  },

  nostalgic: {
    brightness: 0.50,
    saturation: 0.60,
    contrast: 1.00,
    temperature: 0.30,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.12, size: 2.0 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.04,
  },

  dreamy: {
    brightness: 0.52,
    saturation: 0.55,
    contrast: 0.90,
    temperature: 0.25,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 2.0 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.04,
  },

  hypnotic: {
    brightness: 0.45,
    saturation: 0.75,
    contrast: 1.10,
    temperature: -0.05,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.05, size: 1.0 },
    motionIntent: 'slow-zoom',
    beatBrightnessGain: 0.06,
  },

  raw: {
    brightness: 0.45,
    saturation: 0.65,
    contrast: 1.25,
    temperature: 0.0,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.12, size: 1.2 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.08,
  },

  defiant: {
    brightness: 0.48,
    saturation: 0.80,
    contrast: 1.20,
    temperature: -0.10,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.08, size: 1.0 },
    motionIntent: 'push-in',
    beatBrightnessGain: 0.10,
  },

  aggressive: {
    brightness: 0.44,
    saturation: 0.75,
    contrast: 1.30,
    temperature: -0.20,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.10, size: 1.0 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.15,
  },

  rebellious: {
    brightness: 0.48,
    saturation: 0.85,
    contrast: 1.20,
    temperature: 0.05,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.08, size: 1.0 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.12,
  },

  // ── BRIGHT MOODS (warm, saturated, open — the payoff) ──

  hopeful: {
    brightness: 0.58,
    saturation: 0.75,
    contrast: 1.05,
    temperature: 0.25,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.03, size: 1.0 },
    motionIntent: 'drift-up',
    beatBrightnessGain: 0.08,
  },

  triumphant: {
    brightness: 0.62,
    saturation: 1.00,
    contrast: 1.15,
    temperature: 0.15,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    motionIntent: 'stable',
    beatBrightnessGain: 0.10,
  },

  anthemic: {
    brightness: 0.58,
    saturation: 0.95,
    contrast: 1.15,
    temperature: 0.0,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    motionIntent: 'pull-out',
    beatBrightnessGain: 0.10,
  },

  euphoric: {
    brightness: 0.65,
    saturation: 1.10,
    contrast: 1.10,
    temperature: 0.15,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    motionIntent: 'pull-out',
    beatBrightnessGain: 0.12,
  },

  ethereal: {
    brightness: 0.58,
    saturation: 0.45,
    contrast: 0.90,
    temperature: -0.10,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.03, size: 1.0 },
    motionIntent: 'drift-up',
    beatBrightnessGain: 0.04,
  },

  celestial: {
    brightness: 0.62,
    saturation: 0.55,
    contrast: 0.95,
    temperature: -0.05,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    motionIntent: 'slow-zoom',
    beatBrightnessGain: 0.06,
  },
};

const DEFAULT_MOOD_GRADE: MoodGrade = {
  brightness: 0.50,
  saturation: 0.75,
  contrast: 1.05,
  temperature: 0.0,
  blur: { type: 'none', radius: 0 },
  grain: { intensity: 0.05, size: 1.0 },
  motionIntent: 'stable',
  beatBrightnessGain: 0.06,
};

/**
 * Resolve the mood grade for a section.
 * Falls back to a neutral mid-grade for unknown keywords.
 */
export function getMoodGrade(visualMood: string | undefined | null): MoodGrade {
  if (!visualMood) return DEFAULT_MOOD_GRADE;
  return MOOD_GRADES[visualMood.toLowerCase().trim()] ?? DEFAULT_MOOD_GRADE;
}

export function modulateGradeByEnergy(
  base: MoodGrade,
  energy: number,
  sectionProgress: number,
): MoodGrade {
  const clampedEnergy = Math.max(0, Math.min(1, energy));
  const clampedProgress = Math.max(0, Math.min(1, sectionProgress));
  const energyDelta = clampedEnergy - 0.5;

  const brightness = Math.min(0.72, Math.max(0.38, base.brightness + energyDelta * 0.12));
  const saturation = Math.min(1.20, Math.max(0.40, base.saturation + energyDelta * 0.15));
  const temperature = base.temperature + clampedProgress * 0.06;

  return {
    ...base,
    brightness,
    saturation,
    temperature,
  };
}

/**
 * Build a CSS filter string from a mood grade + dynamic modifiers.
 *
 * @param grade - The mood grade
 * @param intensityMod - 0-1 from emotional intensity (brightens at climax)
 * @param beatMod - 0-1 from beat spring (brightness pulse on beats)
 */
// Module-level LRU cache for filter strings — max 12 entries.
// beatMod changes every frame but is quantized to 0.02 steps so most frames
// hit the same key rather than building a new string each call.
const _gradeFilterCache = new Map<string, string>();

export function buildGradeFilter(
  grade: MoodGrade,
  intensityMod: number = 0,
  beatMod: number = 0,
): string {
  // Quantize beatMod to 0.02 steps — eliminates cache misses from sub-visual jitter
  const bModQ = Math.round(beatMod * 50) / 50;
  const key = `${grade.brightness.toFixed(2)}-${grade.saturation.toFixed(2)}-${grade.contrast.toFixed(2)}-${grade.temperature.toFixed(2)}-${intensityMod.toFixed(2)}-${bModQ.toFixed(2)}`;

  const cached = _gradeFilterCache.get(key);
  if (cached !== undefined) return cached;

  const brightness = Math.min(0.90, grade.brightness + intensityMod * 0.15 + bModQ * grade.beatBrightnessGain);
  const beatSatBoost = bModQ * 0.08;
  const saturation = Math.min(1.4, grade.saturation + beatSatBoost);
  const parts: string[] = [
    `brightness(${brightness.toFixed(2)})`,
    `saturate(${saturation.toFixed(2)})`,
    `contrast(${grade.contrast.toFixed(2)})`,
  ];

  // Temperature: warm = sepia + slight hue shift, cool = hue-rotate toward blue
  if (grade.temperature > 0.05) {
    parts.push(`sepia(${(grade.temperature * 0.3).toFixed(2)})`);
  } else if (grade.temperature < -0.05) {
    parts.push(`hue-rotate(${Math.round(grade.temperature * 30)}deg)`);
  }

  // Blur removed — background images render sharp. Text readability
  // comes from alpha spotlight + vignette, not depth-of-field.

  const result = parts.join(' ');

  // Evict oldest entry when over limit (simple FIFO)
  if (_gradeFilterCache.size >= 12) {
    _gradeFilterCache.delete(_gradeFilterCache.keys().next().value!);
  }
  _gradeFilterCache.set(key, result);
  return result;
}
