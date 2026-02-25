import type { ParticleConfig, ParticleSystemType, SceneManifest, TypographyProfile } from "./SceneManifest";

const GRAVITY_VALUES = [
  "normal",
  "inverted",
  "sideways",
  "slow-float",
  "slammed",
] as const;
const DECAY_VALUES = ["sudden", "linger", "breath", "echo"] as const;
const CONTRAST_VALUES = ["brutal", "soft", "neon", "ghost", "raw"] as const;
const BEAT_VALUES = ["seismic", "breath", "pulse", "ripple", "slam"] as const;
const STACK_VALUES = [
  "collapsing",
  "rising",
  "scattered",
  "centered",
  "falling",
] as const;
const LETTER_VALUES = [
  "fracturing",
  "dissolving",
  "materializing",
  "burning",
  "freezing",
  "static",
] as const;
const ENTRANCE_VALUES = [
  "materializes",
  "slams-in",
  "rises",
  "fractures-in",
  "fades",
  "cuts",
] as const;
const EXIT_VALUES = [
  "dissolves-upward",
  "shatters",
  "fades",
  "drops",
  "burns-out",
  "snaps-off",
] as const;
const BG_SYSTEM_VALUES = [
  "fracture",
  "pressure",
  "breath",
  "static",
  "burn",
  "void",
] as const;
const TYPOGRAPHY_PERSONAS = [
  "MONUMENTAL",
  "ELEGANT DECAY",
  "RAW TRANSCRIPT",
  "HANDWRITTEN MEMORY",
  "SHATTERED DISPLAY",
  "INVISIBLE INK",
] as const;
const TEXT_TRANSFORMS = ["uppercase", "lowercase", "none"] as const;
const VALID_PARTICLE_SYSTEMS = [
  "rain", "snow", "embers", "dust", "smoke", "petals", "ash", "bubbles",
  "lightning", "fireflies", "stars", "glitch", "confetti", "crystals", "moths", "none",
] as const;

export interface ManifestValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  manifest: SceneManifest;
}

const SAFE_DEFAULTS: SceneManifest = {
  world: "empty room with one light source",
  coreEmotion: "quiet and uncertain",
  gravity: "normal",
  tension: 0.5,
  decay: "linger",
  lightSource: "harsh overhead",
  palette: ["#0a0a0a", "#4a4a4a", "#e8e8e8"],
  contrastMode: "soft",
  letterPersonality: "static",
  stackBehavior: "centered",
  beatResponse: "pulse",
  lyricEntrance: "fades",
  lyricExit: "fades",
  backgroundSystem: "void",
  backgroundIntensity: 0.4,
  typographyProfile: {
    fontFamily: "Inter",
    fontWeight: 400,
    letterSpacing: "normal",
    textTransform: "none",
    lineHeightMultiplier: 1.4,
    hasSerif: false,
    personality: "RAW TRANSCRIPT",
  },
  particleConfig: {
    system: "none",
    density: 0.3,
    speed: 0.4,
    opacity: 0.35,
    color: "#e8e8e8",
    beatReactive: false,
    foreground: false,
  },
  songTitle: "Unknown",
  generatedAt: Date.now(),
};

function isValidHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
function isInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" && !isNaN(value) && value >= min && value <= max
  );
}
function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return (
    typeof value === "string" && (allowed as readonly string[]).includes(value)
  );
}
function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function validateTypographyProfile(
  raw: unknown,
  warnings: string[],
): TypographyProfile {
  const defaults = SAFE_DEFAULTS.typographyProfile;
  if (!raw || typeof raw !== "object") {
    warnings.push(
      "typographyProfile: missing or not an object — using safe default",
    );
    return { ...defaults };
  }
  const p = raw as Record<string, unknown>;
  const result: TypographyProfile = { ...defaults };

  if (typeof p.fontFamily === "string" && p.fontFamily.trim())
    result.fontFamily = p.fontFamily.trim();
  else warnings.push("typographyProfile.fontFamily: invalid — using Inter");

  if (
    typeof p.fontWeight === "number" &&
    p.fontWeight >= 100 &&
    p.fontWeight <= 900
  ) {
    result.fontWeight = (Math.round(p.fontWeight / 100) *
      100) as TypographyProfile["fontWeight"];
  } else
    warnings.push(
      `typographyProfile.fontWeight: invalid value "${p.fontWeight}" — using 400`,
    );

  if (typeof p.letterSpacing === "string" && p.letterSpacing.trim())
    result.letterSpacing = p.letterSpacing.trim();
  else warnings.push("typographyProfile.letterSpacing: invalid — using normal");

  if (isOneOf(p.textTransform, TEXT_TRANSFORMS))
    result.textTransform = p.textTransform;
  else
    warnings.push(
      `typographyProfile.textTransform: "${p.textTransform}" not valid — using none`,
    );

  result.lineHeightMultiplier = isInRange(p.lineHeightMultiplier, 0.7, 2.5)
    ? (p.lineHeightMultiplier as number)
    : 1.4;
  if (!isInRange(p.lineHeightMultiplier, 0.7, 2.5)) {
    warnings.push(
      `typographyProfile.lineHeightMultiplier: "${p.lineHeightMultiplier}" out of range — using 1.4`,
    );
  }

  if (typeof p.hasSerif === "boolean") result.hasSerif = p.hasSerif;
  else warnings.push("typographyProfile.hasSerif: not a boolean — using false");

  if (isOneOf(p.personality, TYPOGRAPHY_PERSONAS))
    result.personality = p.personality;
  else
    warnings.push(
      `typographyProfile.personality: "${p.personality}" not recognized — using RAW TRANSCRIPT`,
    );

  return result;
}


function normalizeParticleConfig(raw: unknown, manifest: SceneManifest): ParticleConfig {
  const defaults: ParticleConfig = {
    system: "none",
    density: 0.3,
    speed: 0.4,
    opacity: 0.35,
    color: manifest.palette[2],
    beatReactive: false,
    foreground: false,
  };

  if (!raw || typeof raw !== "object") return defaults;
  const p = raw as Record<string, unknown>;

  return {
    system: VALID_PARTICLE_SYSTEMS.includes(p.system as ParticleSystemType)
      ? (p.system as ParticleSystemType)
      : "none",
    density: clampNumber(p.density, 0, 1, 0.3),
    speed: clampNumber(p.speed, 0, 1, 0.4),
    opacity: clampNumber(p.opacity, 0, 1, 0.35),
    color: isValidHex(p.color) ? p.color : manifest.palette[2],
    beatReactive: typeof p.beatReactive === "boolean" ? p.beatReactive : false,
    foreground: typeof p.foreground === "boolean" ? p.foreground : false,
  };
}

function checkConsistency(m: SceneManifest, warnings: string[]): void {
  if (m.tension > 0.7 && ["breath", "ripple"].includes(m.beatResponse)) {
    warnings.push(
      `CONSISTENCY: high tension (${m.tension}) paired with gentle beatResponse "${m.beatResponse}" — world "${m.world}" may be energy-thought not world-thought`,
    );
  }
  if (m.tension < 0.3 && ["seismic", "slam"].includes(m.beatResponse)) {
    warnings.push(
      `CONSISTENCY: low tension (${m.tension}) paired with violent beatResponse "${m.beatResponse}"`,
    );
  }
  if (
    ["fracture", "burn"].includes(m.backgroundSystem) &&
    m.backgroundIntensity < 0.35
  ) {
    warnings.push(
      `CONSISTENCY: "${m.backgroundSystem}" background at low intensity (${m.backgroundIntensity}) — fracture/burn systems need intensity > 0.35 to read correctly`,
    );
  }
}

export function validateManifest(raw: unknown): ManifestValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    errors.push("manifest is not an object — cannot recover");
    return { valid: false, warnings, errors, manifest: { ...SAFE_DEFAULTS } };
  }

  const input = raw as Record<string, unknown>;
  const m = { ...SAFE_DEFAULTS } as SceneManifest;

  if (typeof input.world === "string" && input.world.trim().length > 3)
    m.world = input.world.trim();
  else
    warnings.push(
      `world: "${input.world}" is missing or too short — using safe default`,
    );

  if (typeof input.coreEmotion === "string" && input.coreEmotion.trim())
    m.coreEmotion = input.coreEmotion.trim();
  else warnings.push("coreEmotion: missing — using safe default");

  const enumFields: Array<{
    key: keyof SceneManifest;
    allowed: readonly string[];
    fallback: string;
  }> = [
    { key: "gravity", allowed: GRAVITY_VALUES, fallback: "normal" },
    { key: "decay", allowed: DECAY_VALUES, fallback: "linger" },
    { key: "contrastMode", allowed: CONTRAST_VALUES, fallback: "soft" },
    { key: "beatResponse", allowed: BEAT_VALUES, fallback: "pulse" },
    { key: "stackBehavior", allowed: STACK_VALUES, fallback: "centered" },
    { key: "letterPersonality", allowed: LETTER_VALUES, fallback: "static" },
    { key: "lyricEntrance", allowed: ENTRANCE_VALUES, fallback: "fades" },
    { key: "lyricExit", allowed: EXIT_VALUES, fallback: "fades" },
    { key: "backgroundSystem", allowed: BG_SYSTEM_VALUES, fallback: "void" },
  ];

  for (const { key, allowed, fallback } of enumFields) {
    const value = input[key];
    if (isOneOf(value, allowed as readonly string[]))
      (m as unknown as Record<string, unknown>)[key] = value;
    else {
      warnings.push(
        `${String(key)}: "${value}" is not a valid value — using "${fallback}"`,
      );
      (m as unknown as Record<string, unknown>)[key] = fallback;
    }
  }

  m.tension = clampNumber(input.tension, 0, 1, 0.5);
  if (!isInRange(input.tension, 0, 1))
    warnings.push(
      `tension: "${input.tension}" out of range — clamped to ${m.tension}`,
    );

  m.backgroundIntensity = clampNumber(input.backgroundIntensity, 0, 1, 0.4);
  if (!isInRange(input.backgroundIntensity, 0, 1))
    warnings.push(
      `backgroundIntensity: "${input.backgroundIntensity}" out of range — clamped to ${m.backgroundIntensity}`,
    );

  if (
    Array.isArray(input.palette) &&
    input.palette.length === 3 &&
    input.palette.every(isValidHex)
  ) {
    m.palette = input.palette as [string, string, string];
  } else {
    warnings.push(
      "palette: not a valid 3-hex array — using safe defaults where needed",
    );
    if (Array.isArray(input.palette)) {
      const salvaged = input.palette.map((slot, i) =>
        isValidHex(slot) ? slot : SAFE_DEFAULTS.palette[i],
      );
      if (salvaged.length === 3)
        m.palette = salvaged as [string, string, string];
    }
  }

  if (typeof input.lightSource === "string" && input.lightSource.trim())
    m.lightSource = input.lightSource.trim();
  else warnings.push("lightSource: missing — using harsh overhead");

  m.songTitle =
    typeof input.songTitle === "string" ? input.songTitle : "Unknown";
  m.generatedAt =
    typeof input.generatedAt === "number" ? input.generatedAt : Date.now();
  m.typographyProfile = validateTypographyProfile(
    input.typographyProfile,
    warnings,
  );
  m.particleConfig = normalizeParticleConfig(input.particleConfig, m);

  if (m.particleConfig.system !== "none") {
    if (m.particleConfig.foreground && m.particleConfig.opacity > 0.5) {
      m.particleConfig.opacity = 0.5;
      warnings.push(
        "particleConfig: foreground particles capped at opacity 0.5 to protect lyric readability",
      );
    }
    if (m.particleConfig.foreground && m.particleConfig.density > 0.6) {
      m.particleConfig.density = 0.6;
      warnings.push("particleConfig: foreground particle density capped at 0.6");
    }
  }

  checkConsistency(m, warnings);

  if (warnings.length > 0 && typeof globalThis.__LYRIC_DEBUG__ !== 'undefined') {
    console.warn(`[SceneManifest] "${m.songTitle}" — ${warnings.length} warning(s)`);
  }

  return { valid: errors.length === 0, warnings, errors, manifest: m };
}

export function safeManifest(raw: unknown): {
  manifest: SceneManifest;
  valid: boolean;
} {
  const result = validateManifest(raw);
  return { manifest: result.manifest, valid: result.valid };
}
