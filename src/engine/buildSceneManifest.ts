import type { PhysicsSpec } from "./PhysicsIntegrator";
import type { SceneManifest } from "./SceneManifest";

const systemMap: Record<string, SceneManifest["backgroundSystem"]> = {
  fracture: "fracture",
  pressure: "pressure",
  breath: "breath",
  static: "static",
  burn: "burn",
  combustion: "burn",
  orbit: "breath",
  void: "void",
};

const lightBySystem: Record<SceneManifest["backgroundSystem"], string> = {
  fracture: "harsh overhead",
  pressure: "fluorescent",
  breath: "golden hour",
  static: "fluorescent",
  burn: "flickering left",
  void: "moonlight",
};

function moodToWorld(description?: string): string {
  return description && description.trim().length > 3
    ? description.trim()
    : "empty room with one light source";
}

export function deriveSceneManifestFromSpec(params: {
  spec: PhysicsSpec;
  mood?: string;
  description?: string;
  songTitle?: string;
}): SceneManifest {
  const { spec, mood, description, songTitle } = params;
  const backgroundSystem =
    systemMap[(spec.system || "void").toLowerCase()] || "void";

  const palette = [
    spec.palette?.[0] || "#0a0a0a",
    spec.palette?.[1] || "#4a4a4a",
    spec.palette?.[2] || "#e8e8e8",
  ] as [string, string, string];

  // Use typography from physicsSpec if available, otherwise fallback defaults
  const srcTypo = spec.typographyProfile as any;
  const typographyProfile = srcTypo?.fontFamily
    ? {
        fontFamily: srcTypo.fontFamily,
        fontWeight: srcTypo.fontWeight ?? 500,
        letterSpacing: srcTypo.letterSpacing ?? "normal",
        textTransform: srcTypo.textTransform ?? "none",
        lineHeightMultiplier: srcTypo.lineHeightMultiplier ?? 1.4,
        hasSerif: srcTypo.hasSerif ?? false,
        personality: srcTypo.personality ?? "RAW TRANSCRIPT",
      }
    : {
        fontFamily: "Inter",
        fontWeight: 500,
        letterSpacing: "normal" as const,
        textTransform: "none" as const,
        lineHeightMultiplier: 1.4,
        hasSerif: false,
        personality: "RAW TRANSCRIPT" as const,
      };

  // Use particle config from physicsSpec if available
  const srcParticle = (spec as any).particleConfig;
  const particleConfig = srcParticle?.system && srcParticle.system !== "none"
    ? {
        system: srcParticle.system,
        density: srcParticle.density ?? 0.3,
        speed: srcParticle.speed ?? 0.4,
        opacity: srcParticle.opacity ?? 0.35,
        color: srcParticle.color ?? palette[2],
        beatReactive: srcParticle.beatReactive ?? false,
        foreground: srcParticle.foreground ?? false,
      }
    : {
        system: "none" as const,
        density: 0.3,
        speed: 0.4,
        opacity: 0.35,
        color: palette[2],
        beatReactive: false,
        foreground: false,
      };

  return {
    world: moodToWorld(description),
    coreEmotion: mood || "brooding",
    gravity: "normal",
    tension:
      typeof spec.params?.mass === "number"
        ? Math.min(1, Math.max(0, spec.params.mass / 2.5))
        : 0.5,
    decay: "linger",
    lightSource: lightBySystem[backgroundSystem],
    palette,
    contrastMode: "soft",
    letterPersonality: "static",
    stackBehavior: "centered",
    beatResponse:
      backgroundSystem === "fracture"
        ? "slam"
        : backgroundSystem === "breath"
          ? "breath"
          : "pulse",
    lyricEntrance: "fades",
    lyricExit: "fades",
    backgroundSystem,
    backgroundIntensity: backgroundSystem === "void" ? 0.35 : 0.5,
    typographyProfile,
    particleConfig,
    songTitle: songTitle || "Unknown",
    generatedAt: Date.now(),
  };
}
