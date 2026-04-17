import { useMemo } from "react";
import {
  resolveTypographyFromDirection,
  type ResolvedTypography,
} from "@/lib/fontResolver";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

/**
 * Hook — resolve typography from a LyricDanceData shape.
 *
 * Encapsulates the `data.cinematic_direction.typographyPlan` drilling that
 * callers would otherwise do manually. Every React component that needs
 * resolved typography calls this hook instead of the resolver directly,
 * making it impossible to pass the wrong argument shape.
 *
 * Memoized on the direction reference: re-resolves only when the AI output changes.
 */
export function useResolvedTypography(
  data: LyricDanceData | null | undefined,
): ResolvedTypography {
  return useMemo(
    () => resolveTypographyFromDirection(data?.cinematic_direction ?? null),
    [data?.cinematic_direction],
  );
}
