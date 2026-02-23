import { safeManifest } from "./validateManifest";
import type { SceneManifest } from "./SceneManifest";

export function buildManifestFromDna(
  dna: Record<string, unknown> | null | undefined,
): SceneManifest | null {
  if (!dna) return null;

  const worldDecision = (dna.world_decision ?? {}) as Record<string, unknown>;
  const base =
    ((dna.scene_manifest ?? dna.sceneManifest ?? dna.physics_spec ?? dna.physicsSpec ?? {}) as Record<string, unknown>);

  const merged = {
    ...base,
    ...(worldDecision.backgroundSystem
      ? { backgroundSystem: worldDecision.backgroundSystem }
      : {}),
    ...(worldDecision.particleConfig
      ? { particleConfig: worldDecision.particleConfig }
      : {}),
    ...(worldDecision.world ? { world: worldDecision.world } : {}),
  };

  const { manifest, valid } = safeManifest(merged);

  if (!valid) {
    console.error("[buildManifestFromDna] validation failed:", merged);
    return null;
  }

  console.log("[buildManifestFromDna] manifest ready:", {
    world: manifest.world,
    backgroundSystem: manifest.backgroundSystem,
    particles: manifest.particleConfig?.system,
    typography: manifest.typographyProfile?.personality,
    palette: manifest.palette,
  });

  return manifest;
}
