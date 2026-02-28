/**
 * moodGrades.ts — Maps visual mood keywords to cinematic grade parameters.
 *
 * The AI picks ONE mood keyword per section. The engine looks up the full
 * grade recipe here. No blending, no averaging — one mood, one look.
 *
 * Each grade controls:
 *  - Image treatment (brightness, saturation, contrast, temperature)
 *  - Blur (type, radius, rack focus behavior)
 *  - Grain (intensity, size)
 *  - Vignette (radius, softness, intensity)
 *  - Ken Burns motion intent
 *  - Text mode derived from final brightness (not stored)
 */

export interface BlurGrade {
  type: 'none' | 'gaussian' | 'bloom' | 'tilt-shift';
  radius: number;           // px base — scaled by viewport
  rackFocus?: boolean;      // sharp when vocal active, blur between
}

export interface GrainGrade {
  intensity: number;        // 0-1
  size: number;             // px
}

export interface VignetteGrade {
  innerRadius: number;      // 0-1 fraction of canvas diagonal
  softness: number;         // 0-1 how gradual the falloff
  opacity: number;          // 0-1
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

  // Vignette
  vignette: VignetteGrade;

  // Ken Burns motion intent
  motionIntent: 'push-in' | 'pull-out' | 'drift-up' | 'drift-down' | 'drift-lateral' | 'breathing' | 'stable' | 'handheld' | 'slow-zoom';

  // Intensity response — how much beats affect brightness
  beatBrightnessGain: number;  // 0-0.1 typically

  // Text layout mode — engine picks this, not the user
  layoutMode: 'horizontal' | 'queue';
}

export const MOOD_GRADES: Record<string, MoodGrade> = {
  intimate: {
    brightness: 0.35,
    saturation: 0.65,
    contrast: 1.0,
    temperature: 0.2,
    blur: { type: 'gaussian', radius: 3, rackFocus: true },
    grain: { intensity: 0.3, size: 1.5 },
    vignette: { innerRadius: 0.25, softness: 0.5, opacity: 0.5 },
    motionIntent: 'push-in',
    beatBrightnessGain: 0.02,
    layoutMode: 'queue',
  },

  anthemic: {
    brightness: 0.55,
    saturation: 0.9,
    contrast: 1.2,
    temperature: 0.0,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    vignette: { innerRadius: 0.5, softness: 0.6, opacity: 0.2 },
    motionIntent: 'pull-out',
    beatBrightnessGain: 0.04,
    layoutMode: 'horizontal',
  },

  dreamy: {
    brightness: 0.50,
    saturation: 0.50,
    contrast: 0.85,
    temperature: 0.3,
    blur: { type: 'bloom', radius: 5 },
    grain: { intensity: 0.15, size: 2.0 },
    vignette: { innerRadius: 0.4, softness: 0.7, opacity: 0.25 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.01,
    layoutMode: 'queue',
  },

  aggressive: {
    brightness: 0.38,
    saturation: 0.7,
    contrast: 1.4,
    temperature: -0.3,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.2, size: 1.0 },
    vignette: { innerRadius: 0.2, softness: 0.3, opacity: 0.55 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.06,
    layoutMode: 'horizontal',
  },

  melancholy: {
    brightness: 0.32,
    saturation: 0.40,
    contrast: 1.0,
    temperature: -0.1,
    blur: { type: 'gaussian', radius: 2 },
    grain: { intensity: 0.35, size: 1.5 },
    vignette: { innerRadius: 0.3, softness: 0.5, opacity: 0.4 },
    motionIntent: 'drift-down',
    beatBrightnessGain: 0.01,
    layoutMode: 'queue',
  },

  euphoric: {
    brightness: 0.65,
    saturation: 1.15,
    contrast: 1.1,
    temperature: 0.2,
    blur: { type: 'bloom', radius: 3 },
    grain: { intensity: 0.0, size: 0 },
    vignette: { innerRadius: 0.6, softness: 0.8, opacity: 0.1 },
    motionIntent: 'pull-out',
    beatBrightnessGain: 0.05,
    layoutMode: 'horizontal',
  },

  eerie: {
    brightness: 0.28,
    saturation: 0.30,
    contrast: 1.3,
    temperature: -0.4,
    blur: { type: 'tilt-shift', radius: 4 },
    grain: { intensity: 0.25, size: 0.8 },
    vignette: { innerRadius: 0.2, softness: 0.4, opacity: 0.6 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.02,
    layoutMode: 'queue',
  },

  vulnerable: {
    brightness: 0.40,
    saturation: 0.50,
    contrast: 0.9,
    temperature: 0.15,
    blur: { type: 'gaussian', radius: 2, rackFocus: true },
    grain: { intensity: 0.3, size: 1.5 },
    vignette: { innerRadius: 0.25, softness: 0.5, opacity: 0.45 },
    motionIntent: 'breathing',
    beatBrightnessGain: 0.01,
    layoutMode: 'queue',
  },

  triumphant: {
    brightness: 0.60,
    saturation: 1.0,
    contrast: 1.25,
    temperature: 0.15,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.0, size: 0 },
    vignette: { innerRadius: 0.5, softness: 0.6, opacity: 0.15 },
    motionIntent: 'stable',
    beatBrightnessGain: 0.04,
    layoutMode: 'horizontal',
  },

  nostalgic: {
    brightness: 0.45,
    saturation: 0.55,
    contrast: 0.95,
    temperature: 0.35,
    blur: { type: 'gaussian', radius: 2 },
    grain: { intensity: 0.5, size: 2.0 },
    vignette: { innerRadius: 0.3, softness: 0.5, opacity: 0.35 },
    motionIntent: 'drift-lateral',
    beatBrightnessGain: 0.01,
    layoutMode: 'queue',
  },

  defiant: {
    brightness: 0.42,
    saturation: 0.80,
    contrast: 1.3,
    temperature: -0.15,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.1, size: 1.0 },
    vignette: { innerRadius: 0.25, softness: 0.4, opacity: 0.45 },
    motionIntent: 'push-in',
    beatBrightnessGain: 0.04,
    layoutMode: 'horizontal',
  },

  hopeful: {
    brightness: 0.58,
    saturation: 0.70,
    contrast: 1.0,
    temperature: 0.3,
    blur: { type: 'gaussian', radius: 1 },
    grain: { intensity: 0.05, size: 1.0 },
    vignette: { innerRadius: 0.5, softness: 0.7, opacity: 0.15 },
    motionIntent: 'drift-up',
    beatBrightnessGain: 0.03,
    layoutMode: 'queue',
  },

  raw: {
    brightness: 0.38,
    saturation: 0.60,
    contrast: 1.35,
    temperature: 0.0,
    blur: { type: 'none', radius: 0 },
    grain: { intensity: 0.55, size: 1.2 },
    vignette: { innerRadius: 0.2, softness: 0.3, opacity: 0.5 },
    motionIntent: 'handheld',
    beatBrightnessGain: 0.03,
    layoutMode: 'horizontal',
  },

  hypnotic: {
    brightness: 0.35,
    saturation: 0.70,
    contrast: 1.1,
    temperature: -0.1,
    blur: { type: 'tilt-shift', radius: 4 },
    grain: { intensity: 0.05, size: 1.0 },
    vignette: { innerRadius: 0.3, softness: 0.5, opacity: 0.35 },
    motionIntent: 'slow-zoom',
    beatBrightnessGain: 0.02,
    layoutMode: 'queue',
  },
};

/** Default grade when no visualMood is set */
export const DEFAULT_MOOD_GRADE = MOOD_GRADES.intimate;

/**
 * Resolve the mood grade for a section.
 * Falls back to 'intimate' for unknown keywords.
 */
export function getMoodGrade(visualMood: string | undefined | null): MoodGrade {
  if (!visualMood) return DEFAULT_MOOD_GRADE;
  return MOOD_GRADES[visualMood.toLowerCase().trim()] ?? DEFAULT_MOOD_GRADE;
}

/**
 * Build a CSS filter string from a mood grade + dynamic modifiers.
 *
 * @param grade - The mood grade
 * @param intensityMod - 0-1 from emotional intensity (brightens at climax)
 * @param beatMod - 0-1 from beat spring (brightness pulse on beats)
 * @param blurOverride - optional blur px override (for rack focus)
 */
export function buildGradeFilter(
  grade: MoodGrade,
  intensityMod: number = 0,
  beatMod: number = 0,
  blurOverride?: number,
): string {
  const brightness = Math.min(0.90, grade.brightness + intensityMod * 0.15 + beatMod * grade.beatBrightnessGain);
  const parts: string[] = [
    `brightness(${brightness.toFixed(2)})`,
    `saturate(${grade.saturation.toFixed(2)})`,
    `contrast(${grade.contrast.toFixed(2)})`,
  ];

  // Temperature: warm = sepia + slight hue shift, cool = hue-rotate toward blue
  if (grade.temperature > 0.05) {
    parts.push(`sepia(${(grade.temperature * 0.3).toFixed(2)})`);
  } else if (grade.temperature < -0.05) {
    parts.push(`hue-rotate(${Math.round(grade.temperature * 30)}deg)`);
  }

  // Blur
  const blurPx = blurOverride ?? grade.blur.radius;
  if (blurPx > 0.2) {
    parts.push(`blur(${blurPx.toFixed(1)}px)`);
  }

  return parts.join(' ');
}

/**
 * Determine text color mode from graded brightness.
 * Returns 'dark' if background will be bright enough for dark text,
 * 'light' otherwise.
 */
export function getTextMode(grade: MoodGrade, intensityMod: number = 0): 'light' | 'dark' {
  const effectiveBrightness = grade.brightness + intensityMod * 0.15;
  return effectiveBrightness > 0.52 ? 'dark' : 'light';
}

/**
 * Lerp between two grades for smooth section transitions.
 * All numeric values interpolate; enums snap at t=0.5.
 */
export function lerpGrade(a: MoodGrade, b: MoodGrade, t: number): MoodGrade {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    brightness: lerp(a.brightness, b.brightness),
    saturation: lerp(a.saturation, b.saturation),
    contrast: lerp(a.contrast, b.contrast),
    temperature: lerp(a.temperature, b.temperature),
    blur: {
      type: t < 0.5 ? a.blur.type : b.blur.type,
      radius: lerp(a.blur.radius, b.blur.radius),
      rackFocus: t < 0.5 ? a.blur.rackFocus : b.blur.rackFocus,
    },
    grain: {
      intensity: lerp(a.grain.intensity, b.grain.intensity),
      size: lerp(a.grain.size, b.grain.size),
    },
    vignette: {
      innerRadius: lerp(a.vignette.innerRadius, b.vignette.innerRadius),
      softness: lerp(a.vignette.softness, b.vignette.softness),
      opacity: lerp(a.vignette.opacity, b.vignette.opacity),
    },
    motionIntent: t < 0.5 ? a.motionIntent : b.motionIntent,
    beatBrightnessGain: lerp(a.beatBrightnessGain, b.beatBrightnessGain),
    layoutMode: t < 0.5 ? a.layoutMode : b.layoutMode,
  };
}
