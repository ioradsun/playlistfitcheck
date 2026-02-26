/**
 * validateFrameState — V3 bridge module.
 *
 * Provides `safeManifest()` which ensures a FrameRenderState has valid defaults.
 * In V3 the per-frame state is derived by `deriveFrameState()` in presetDerivation.ts;
 * this module exists only for backward-compat callers (LyricDisplay, LyricVideoComposer).
 */

import { deriveFrameState, type FrameRenderState } from "@/engine/presetDerivation";

const DEFAULT_FRAME_STATE: FrameRenderState = deriveFrameState({}, 0, 0);

export function safeManifest(raw: unknown): { manifest: FrameRenderState; warnings: string[] } {
  if (!raw || typeof raw !== "object") {
    return { manifest: { ...DEFAULT_FRAME_STATE }, warnings: ["empty input — using defaults"] };
  }

  const input = raw as Record<string, unknown>;
  const merged: FrameRenderState = { ...DEFAULT_FRAME_STATE };

  // Copy over any valid fields from input
  for (const key of Object.keys(DEFAULT_FRAME_STATE) as Array<keyof FrameRenderState>) {
    if (key in input && input[key] !== undefined && input[key] !== null) {
      (merged as any)[key] = input[key];
    }
  }

  // Also copy optional legacy fields if present
  const legacyKeys = [
    "world", "coreEmotion", "backgroundSystem", "lightSource", "palette",
    "contrastMode", "backgroundIntensity", "letterPersonality", "decay",
    "stackBehavior", "lyricEntrance", "lyricExit", "typographyProfile", "particleConfig",
  ] as const;

  for (const key of legacyKeys) {
    if (key in input && input[key] !== undefined && input[key] !== null) {
      (merged as any)[key] = input[key];
    }
  }

  return { manifest: merged, warnings: [] };
}
