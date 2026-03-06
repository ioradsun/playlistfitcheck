import type { SectionRole } from "@/engine/sectionDetector";
import type { LyricSection } from "@/hooks/useLyricSections";

export interface SectionOverride {
  sectionIndex: number;
  role?: SectionRole;
  startSec?: number;
  endSec?: number;
  isNew?: boolean;
  removed?: boolean;
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
  const detectedIndexSet = new Set(detectedSections.map((section) => section.sectionIndex));

  overrides.forEach((override) => {
    if (override.isNew || override.removed) return;
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

  const removedIndices = new Set(overrides.filter((override) => override.removed).map((override) => override.sectionIndex));

  const withoutRemoved = next.filter((section) => !removedIndices.has(section.sectionIndex));

  const addedSections = overrides
    .filter((override) => override.isNew && !override.removed)
    .map<LyricSection | null>((override) => {
      if (typeof override.startSec !== "number" || typeof override.endSec !== "number" || !override.role) {
        return null;
      }
      return {
        sectionIndex: override.sectionIndex,
        role: override.role,
        label: labelFromRole(override.role, 1),
        labelSource: "user",
        startSec: override.startSec,
        endSec: override.endSec,
        lines: [],
        confidence: 1,
      };
    })
    .filter((section): section is LyricSection => !!section)
    .filter((section) => !detectedIndexSet.has(section.sectionIndex));

  const sorted = [...withoutRemoved, ...addedSections].sort((a, b) => a.startSec - b.startSec);

  // Recompute labels by role order for consistency after role changes.
  const roleCounts: Partial<Record<SectionRole, number>> = {};
  return sorted.map((section, idx) => {
    const count = (roleCounts[section.role] ?? 0) + 1;
    roleCounts[section.role] = count;
    return {
      ...section,
      sectionIndex: idx,
      label: labelFromRole(section.role, count),
    };
  });
}
