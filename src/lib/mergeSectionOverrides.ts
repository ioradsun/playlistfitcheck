import type { SectionRole } from "@/engine/sectionDetector";
import type { LyricSection } from "@/hooks/useLyricSections";

export interface SectionOverride {
  sectionIndex: number;
  role?: SectionRole;
  startSec?: number;
  endSec?: number;
}

export type SectionOverrides = SectionOverride[];

function labelFromRole(role: SectionRole, count: number): string {
  switch (role) {
    case "intro":
      return "Intro";
    case "outro":
      return "Outro";
    case "bridge":
      return "Bridge";
    case "prechorus":
      return "Pre-Chorus";
    case "chorus":
      return count > 1 ? `Chorus ${count}` : "Chorus";
    case "verse":
      return `Verse ${count}`;
    case "drop":
      return "Drop";
    case "breakdown":
      return "Breakdown";
    default:
      return "Section";
  }
}

export function mergeSectionOverrides(
  detectedSections: LyricSection[],
  overrides: SectionOverrides | null,
): LyricSection[] {
  if (!overrides?.length) return detectedSections;

  const next = detectedSections.map((section) => ({ ...section }));

  overrides.forEach((override) => {
    const idx = next.findIndex((section) => section.sectionIndex === override.sectionIndex);
    if (idx === -1) return;
    const current = next[idx];

    if (typeof override.startSec === "number") {
      current.startSec = override.startSec;
      if (idx > 0) next[idx - 1].endSec = override.startSec;
    }

    if (typeof override.endSec === "number") {
      current.endSec = override.endSec;
      if (idx < next.length - 1) next[idx + 1].startSec = override.endSec;
    }

    if (override.role) {
      current.role = override.role;
      current.labelSource = "user";
      current.confidence = 1;
    }
  });

  // Recompute labels by role order for consistency after role changes.
  const roleCounts: Partial<Record<SectionRole, number>> = {};
  return next.map((section) => {
    const count = (roleCounts[section.role] ?? 0) + 1;
    roleCounts[section.role] = count;

    if (section.labelSource === "user") {
      return {
        ...section,
        label: labelFromRole(section.role, count),
      };
    }

    return section;
  });
}
