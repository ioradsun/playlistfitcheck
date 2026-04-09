import type { CinematicSection } from "@/types/CinematicDirection";

export function enrichSections(sections: CinematicSection[] | undefined, totalDurationSec?: number): CinematicSection[] {
  if (!sections || sections.length === 0) {
    return [
      { sectionIndex: 0, description: "Opening", startRatio: 0, endRatio: 0.33 },
      { sectionIndex: 1, description: "Middle", startRatio: 0.33, endRatio: 0.66 },
      { sectionIndex: 2, description: "Climax", startRatio: 0.66, endRatio: 1 },
    ];
  }
  const count = sections.length;
  const dur = totalDurationSec && totalDurationSec > 0 ? totalDurationSec : null;
  return sections.map((s, i) => {
    const hasAbsTime = s.startSec != null && s.endSec != null;
    let startRatio = s.startRatio ?? i / count;
    let endRatio = s.endRatio ?? (i + 1) / count;
    let startSec = s.startSec;
    let endSec = s.endSec;

    if (hasAbsTime && dur) {
      startRatio = s.startSec! / dur;
      endRatio = s.endSec! / dur;
    } else if (!hasAbsTime && dur) {
      startSec = startRatio * dur;
      endSec = endRatio * dur;
    }

    return { ...s, startRatio, endRatio, startSec, endSec };
  });
}
