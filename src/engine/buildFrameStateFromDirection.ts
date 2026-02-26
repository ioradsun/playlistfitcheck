/**
 * buildFrameStateFromDirection — V3 bridge module.
 *
 * Converts renderData (which may contain cinematic_direction)
 * into a FrameRenderState using the V3 pipeline (deriveFrameState).
 */

import { deriveFrameState, type FrameRenderState } from "@/engine/presetDerivation";
import { safeManifest } from "@/engine/validateFrameState";

export function buildFrameStateFromDirection(
  renderData: Record<string, unknown>,
): FrameRenderState | null {
  if (!renderData) return null;

  // If there's already a frame_state, validate and return it
  const existingState = renderData.frame_state ?? renderData.frameState;
  if (existingState && typeof existingState === "object") {
    return safeManifest(existingState).manifest;
  }

  // Derive from cinematic direction using V3 pipeline
  const direction = renderData.cinematic_direction ?? renderData.cinematicDirection ?? {};
  const state = deriveFrameState(direction, 0, 0);

  // Carry forward legacy fields from the direction if present
  const dir = direction as Record<string, unknown>;
  if (dir.sceneTone || dir.palette || dir.atmosphere) {
    const visualWorld = (dir as any).visualWorld;
    if (visualWorld) {
      if (visualWorld.palette) (state as any).palette = visualWorld.palette;
      if (visualWorld.lightSource) (state as any).lightSource = visualWorld.lightSource;
      if (visualWorld.backgroundSystem) (state as any).backgroundSystem = visualWorld.backgroundSystem;
    }
  }

  return state;
}
