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
    typographyProfile: {
      fontFamily: "Inter",
      fontWeight: 500,
      letterSpacing: "normal",
      textTransform: "none",
      lineHeightMultiplier: 1.4,
      hasSerif: false,
      personality: "RAW TRANSCRIPT",
    },
    songTitle: songTitle || "Unknown",
    generatedAt: Date.now(),
  };
}
