import type { CinematicDirection, CinematicSection } from "@/types/CinematicDirection";

export function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
}

/**
 * Normalize a raw cinematic_direction value from the DB into a guaranteed-valid
 * CinematicDirection object, or null if it cannot be salvaged.
 */
export function normalizeCinematicDirection(
  raw: unknown,
): CinematicDirection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const cd = raw as CinematicDirection & { chapters?: any[] };

  // Legacy format: chapters[] but no sections[] — convert
  if (
    (!Array.isArray(cd.sections) || cd.sections.length === 0)
    && Array.isArray(cd.chapters)
    && cd.chapters.length > 0
  ) {
    const sections: CinematicSection[] = cd.chapters.map((ch: any, i: number) => ({
      sectionIndex: i,
      description: ch.backgroundDirective ?? ch.title ?? `Section ${i}`,
      mood: ch.emotionalArc ?? ch.mood ?? undefined,
      visualMood: ch.visualMood ?? undefined,
      motion: ch.motion ?? undefined,
      texture: ch.texture ?? undefined,
      atmosphere: ch.atmosphere ?? undefined,
      startSec: ch.startSec ?? undefined,
      endSec: ch.endSec ?? undefined,
      startRatio: ch.startRatio ?? undefined,
      endRatio: ch.endRatio ?? undefined,
      atmosphereState: ch.atmosphereState ?? undefined,
      dominantColor: ch.dominantColor ?? undefined,
    }));
    return { ...cd, sections };
  }

  if (!Array.isArray(cd.sections) || cd.sections.length === 0) return null;

  return cd;
}
