/**
 * deriveCanvasManifest — THE single source of truth for building a SceneManifest
 * from stored Song DNA / physics_spec data.
 *
 * Both ShareableLyricDance (full song) and useHookCanvas (hook/battle) MUST use
 * this function so that palette, typography, particles, entrance/exit, and effects
 * are consistent across every render surface.
 */

import type { PhysicsSpec } from "./PhysicsIntegrator";
import type { SceneManifest } from "./SceneManifest";
import { safeManifest } from "./validateManifest";
import { applyTypographyProfile, ensureTypographyProfileReady, getSafeTextColor, getRelativeLuminance } from "./SystemStyles";

export interface DeriveManifestInput {
  /** The physics_spec from the stored record */
  physicsSpec: PhysicsSpec;
  /** Pre-built scene_manifest stored alongside the record (may be null) */
  storedManifest?: Record<string, unknown> | null;
  /** Fallback palette from the record's palette column */
  fallbackPalette?: string[];
  /** system_type from the record */
  systemType?: string;
}

export interface DeriveManifestResult {
  /** Fully validated SceneManifest */
  manifest: SceneManifest;
  /** Text-safe palette where [0] is a readable text color (not background) */
  textPalette: [string, string, string];
  /** The chosen safe text color */
  textColor: string;
  /** Contrast ratio of textColor against background */
  contrastRatio: number;
  /** Whether a stored manifest was used (true) or derived from spec (false) */
  fromStoredManifest: boolean;
}

/**
 * Derives a fully resolved SceneManifest from the best available data.
 * Priority: storedManifest > physicsSpec fields > safe defaults.
 *
 * NEVER returns hardcoded "Inter" / "fades" / "none" unless the source data
 * genuinely has no typography/particles/entrance specified.
 */
export function deriveCanvasManifest(input: DeriveManifestInput): DeriveManifestResult {
  const { physicsSpec: spec, storedManifest, fallbackPalette, systemType } = input;

  // ── Step 1: Build raw manifest from best source ──────────────────────────
  let rawManifest: Record<string, unknown>;
  let fromStoredManifest = false;

  if (storedManifest && typeof storedManifest === "object" && Object.keys(storedManifest).length > 2) {
    // Prefer stored manifest (comes from AI analysis, has full world-building)
    rawManifest = { ...storedManifest };
    fromStoredManifest = true;
  } else {
    // Fall back to building from physics_spec
    rawManifest = buildFromSpec(spec, systemType);
  }

  // ── Step 2: Overlay any physicsSpec fields the manifest is missing ────────
  // Typography: spec.typographyProfile takes precedence if manifest doesn't have one
  if (!rawManifest.typographyProfile && spec.typographyProfile) {
    rawManifest.typographyProfile = spec.typographyProfile;
  }
  // Particles: ensure spec's particle config propagates
  if (!rawManifest.particleConfig && (spec as any).particleConfig) {
    rawManifest.particleConfig = (spec as any).particleConfig;
  }
  // Palette: overlay from spec or fallback
  if (!rawManifest.palette) {
    rawManifest.palette = spec.palette || fallbackPalette || ["#0a0a0a", "#a855f7", "#ec4899"];
  }
  // Background system
  if (!rawManifest.backgroundSystem && (systemType || spec.system)) {
    const sys = (systemType || spec.system || "void").toLowerCase();
    const sysMap: Record<string, string> = {
      fracture: "fracture", pressure: "pressure", breath: "breath",
      static: "static", burn: "burn", combustion: "burn",
      orbit: "breath", void: "void",
    };
    rawManifest.backgroundSystem = sysMap[sys] || "void";
  }

  // ── Step 3: Validate & produce final manifest ────────────────────────────
  const { manifest } = safeManifest(rawManifest);

  // ── Step 4: Apply typography so getSystemStyle uses it ────────────────────
  if (manifest.typographyProfile) {
    applyTypographyProfile(manifest.typographyProfile);
  }

  // ── Step 5: Compute text-safe colors ─────────────────────────────────────
  const textColor = getSafeTextColor(manifest.palette);
  const bgLum = getRelativeLuminance(manifest.palette[0]);
  const textLum = getRelativeLuminance(textColor);
  const contrastRatio = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05);

  const textPalette: [string, string, string] = [
    textColor,
    manifest.palette[1],
    manifest.palette[2],
  ];

  return {
    manifest,
    textPalette,
    textColor,
    contrastRatio,
    fromStoredManifest,
  };
}

/** Async version that also ensures fonts are loaded before returning */
export async function deriveCanvasManifestAsync(input: DeriveManifestInput): Promise<DeriveManifestResult> {
  const result = deriveCanvasManifest(input);
  if (result.manifest.typographyProfile?.fontFamily) {
    await ensureTypographyProfileReady(result.manifest.typographyProfile);
  }
  return result;
}

// ── Internal helper ─────────────────────────────────────────────────────────

function buildFromSpec(spec: PhysicsSpec, systemType?: string): Record<string, unknown> {
  const sys = (systemType || spec.system || "void").toLowerCase();
  const sysMap: Record<string, string> = {
    fracture: "fracture", pressure: "pressure", breath: "breath",
    static: "static", burn: "burn", combustion: "burn",
    orbit: "breath", void: "void",
  };
  const backgroundSystem = sysMap[sys] || "void";

  const palette = spec.palette || ["#0a0a0a", "#a855f7", "#ec4899"];

  return {
    world: "derived from physics spec",
    coreEmotion: "brooding",
    backgroundSystem,
    palette,
    typographyProfile: spec.typographyProfile || undefined,
    particleConfig: (spec as any).particleConfig || undefined,
    lyricEntrance: (spec as any).lyricEntrance || undefined,
    lyricExit: (spec as any).lyricExit || undefined,
  };
}

// ── 1Hz throttled diagnostic logger ─────────────────────────────────────────

let lastLogTime = 0;

export function logManifestDiagnostics(
  label: string,
  data: {
    palette: string[];
    fontFamily: string;
    particleSystem: string;
    beatIntensity: number;
    activeMod: string | null;
    entryProgress: number;
    exitProgress: number;
    textColor: string;
    contrastRatio: number;
    effectKey?: string;
  },
): void {
  const now = performance.now();
  if (now - lastLogTime < 1000) return; // 1Hz throttle
  lastLogTime = now;

  console.log(`[${label}] manifest flow`, {
    palette: data.palette,
    fontFamily: data.fontFamily,
    particles: data.particleSystem,
    beatIntensity: Number(data.beatIntensity.toFixed(3)),
    activeMod: data.activeMod,
    entry: Number(data.entryProgress.toFixed(2)),
    exit: Number(data.exitProgress.toFixed(2)),
    textColor: data.textColor,
    contrast: Number(data.contrastRatio.toFixed(2)),
    effectKey: data.effectKey ?? "—",
  });
}
