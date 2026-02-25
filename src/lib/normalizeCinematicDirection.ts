/** @deprecated Use directionResolvers instead */
export function normalizeCinematicDirection(raw: unknown): any {
  // Pass-through to avoid runtime errors during transition
  // Real normalization logic has moved to directionResolvers.ts
  return raw;
}
