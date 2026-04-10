import type { CinematicDirection } from "@/types/CinematicDirection";

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
  const cd = raw as CinematicDirection;
  if (!Array.isArray(cd.sections) || cd.sections.length === 0) return null;
  return cd;
}
