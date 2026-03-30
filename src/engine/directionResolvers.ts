import type {
  CinematicSection,
  WordDirective,
  TensionStage,
} from "@/types/CinematicDirection";

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
    // If sections have absolute time boundaries, compute ratios from them
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



export function buildWordDirectiveMap(directives: WordDirective[] | undefined): Map<string, WordDirective> {
  const map = new Map<string, WordDirective>();
  if (!directives) return map;
  for (const wd of directives) {
    const key = (wd.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key) map.set(key, wd);
  }
  return map;
}


export function deriveTensionCurve(emotionalArc: string | undefined): TensionStage[] {
  const curves: Record<string, TensionStage[]> = {
    "slow-burn": [
      { stage: "Setup", startRatio: 0, endRatio: 0.3, motionIntensity: 0.3, particleDensity: 0.2, lightBrightness: 0.4, cameraMovement: "Drift", typographyAggression: 0.2 },
      { stage: "Build", startRatio: 0.3, endRatio: 0.6, motionIntensity: 0.5, particleDensity: 0.5, lightBrightness: 0.6, cameraMovement: "PushIn", typographyAggression: 0.5 },
      { stage: "Peak", startRatio: 0.6, endRatio: 0.85, motionIntensity: 0.9, particleDensity: 0.9, lightBrightness: 0.9, cameraMovement: "Shake", typographyAggression: 0.9 },
      { stage: "Release", startRatio: 0.85, endRatio: 1, motionIntensity: 0.4, particleDensity: 0.3, lightBrightness: 0.5, cameraMovement: "Drift", typographyAggression: 0.3 },
    ],
  };
  return curves[emotionalArc ?? "slow-burn"] ?? curves["slow-burn"];
}


export function deriveClimaxRatio(emotionalArc: string | undefined): number {
  const arc = emotionalArc ?? "slow-burn";
  if (arc === "eruption") return 0.6;
  if (arc === "collapse") return 0.15;
  if (arc === "dawn") return 0.85;
  return 0.65;
}
