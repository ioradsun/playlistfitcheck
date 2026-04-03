import type { Moment } from "@/lib/buildMoments";

export function deriveMomentFireCounts(
  reactionData: Record<string, { line: Record<number, number>; total: number }>,
  moments: Moment[],
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let i = 0; i < moments.length; i += 1) {
    let total = 0;
    for (const emojiData of Object.values(reactionData)) {
      for (const line of moments[i].lines) {
        total += emojiData.line[line.lineIndex] ?? 0;
      }
    }
    counts[i] = total;
  }
  return counts;
}
