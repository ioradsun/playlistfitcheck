import type {
  CinematicSection,
  WordDirective,
  TensionStage,
} from "@/types/CinematicDirection";

export function enrichSections(sections: CinematicSection[] | undefined): CinematicSection[] {
  if (!sections || sections.length === 0) {
    return [
      { sectionIndex: 0, description: "Opening", startRatio: 0, endRatio: 0.33 },
      { sectionIndex: 1, description: "Middle", startRatio: 0.33, endRatio: 0.66 },
      { sectionIndex: 2, description: "Climax", startRatio: 0.66, endRatio: 1 },
    ];
  }
  const count = sections.length;
  return sections.map((s, i) => ({
    ...s,
    startRatio: s.startRatio ?? i / count,
    endRatio: s.endRatio ?? (i + 1) / count,
  }));
}

export function findSectionByProgress(sections: CinematicSection[] | undefined, progress: number): CinematicSection | null {
  const enriched = enrichSections(sections);
  return enriched.find((s) => progress >= (s.startRatio ?? 0) && progress < (s.endRatio ?? 1)) ?? enriched[enriched.length - 1] ?? null;
}

export function findSectionIndexByProgress(sections: CinematicSection[] | undefined, progress: number): number {
  const enriched = enrichSections(sections);
  const idx = enriched.findIndex((s) => progress >= (s.startRatio ?? 0) && progress < (s.endRatio ?? 1));
  return idx >= 0 ? idx : Math.max(0, enriched.length - 1);
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

export function findWordDirective(directives: WordDirective[] | undefined, word: string): WordDirective | null {
  if (!directives) return null;
  const key = word.toLowerCase().replace(/[^a-z]/g, "");
  return directives.find((wd) => (wd.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === key) ?? null;
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

export function getTensionStageForProgress(emotionalArc: string | undefined, progress: number): TensionStage | null {
  const curve = deriveTensionCurve(emotionalArc);
  return curve.find((s) => progress >= s.startRatio && progress <= s.endRatio) ?? curve[0] ?? null;
}

export function deriveClimaxRatio(emotionalArc: string | undefined): number {
  const arc = emotionalArc ?? "slow-burn";
  if (arc === "eruption") return 0.6;
  if (arc === "collapse") return 0.15;
  if (arc === "dawn") return 0.85;
  return 0.65;
}
