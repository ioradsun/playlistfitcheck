/**
 * buildManifestFromDna — delegates to the unified deriveCanvasManifest pipeline.
 *
 * This is a convenience wrapper for callers that have a raw Song DNA object
 * (with physics_spec, scene_manifest, world_decision, palette, system_type, etc).
 * It normalises the DNA shape and passes it through the single shared derivation.
 */

import { deriveCanvasManifest } from "./deriveCanvasManifest";
import type { PhysicsSpec } from "./PhysicsIntegrator";
import type { SceneManifest } from "./SceneManifest";

export function buildManifestFromDna(
  dna: Record<string, unknown> | null | undefined,
): SceneManifest | null {
  if (!dna) return null;

  // Extract physics_spec (both casing conventions)
  const physicsSpec = (dna.physics_spec ?? dna.physicsSpec ?? {}) as PhysicsSpec;

  // Extract stored scene_manifest (both casing conventions)
  const storedManifest = (
    dna.scene_manifest ?? dna.sceneManifest ?? null
  ) as Record<string, unknown> | null;

  // Apply world_decision overrides onto storedManifest if present
  const worldDecision = (dna.world_decision ?? {}) as Record<string, unknown>;
  let mergedManifest = storedManifest;
  if (worldDecision && Object.keys(worldDecision).length > 0 && storedManifest) {
    mergedManifest = {
      ...storedManifest,
      ...(worldDecision.backgroundSystem
        ? { backgroundSystem: worldDecision.backgroundSystem }
        : {}),
      ...(worldDecision.particleConfig
        ? { particleConfig: worldDecision.particleConfig }
        : {}),
      ...(worldDecision.world ? { world: worldDecision.world } : {}),
    };
  } else if (worldDecision && Object.keys(worldDecision).length > 0) {
    mergedManifest = worldDecision;
  }

  const fallbackPalette = (dna.palette ?? physicsSpec.palette) as string[] | undefined;
  const systemType = (dna.system_type ?? (physicsSpec as any).system) as string | undefined;

  const { manifest } = deriveCanvasManifest({
    physicsSpec,
    storedManifest: mergedManifest,
    fallbackPalette: fallbackPalette ?? undefined,
    systemType: systemType ?? undefined,
  });

  return manifest;
}
