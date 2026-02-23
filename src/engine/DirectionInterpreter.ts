import type {
  Chapter,
  CinematicDirection,
  LineDirection,
  WordDirective,
} from "@/types/CinematicDirection";

export class DirectionInterpreter {
  constructor(
    public readonly direction: CinematicDirection,
    private totalDuration: number,
  ) {}

  getCurrentChapter(songProgress: number): Chapter {
    return this.direction.chapters.find((c) => (
      songProgress >= c.startRatio && songProgress <= c.endRatio
    )) ?? this.direction.chapters[0];
  }

  getWordDirective(word: string): WordDirective | null {
    const key = word.toLowerCase().replace(/[^a-z]/g, "");
    console.log('looking up:', key, 'available keys:', Object.keys(this.direction.wordDirectives ?? {}));
    return this.direction.wordDirectives?.[key] ?? null;
  }

  getLineDirection(lineIndex: number): LineDirection | null {
    return this.direction.storyboard[lineIndex] ?? null;
  }

  isClimaxMoment(songProgress: number): boolean {
    return Math.abs(songProgress - this.direction.climax.timeRatio) < 0.02;
  }

  getParticleDirective(songProgress: number): string {
    return this.getCurrentChapter(songProgress).particleDirective;
  }

  getLightDirective(songProgress: number): string {
    return this.getCurrentChapter(songProgress).lightBehavior;
  }

  getSongTime(songProgress: number): number {
    return this.totalDuration * Math.max(0, Math.min(1, songProgress));
  }

  isInSilence(
    activeLine: { start: number; end: number } | null,
    nextLine: { start: number } | null,
    currentTime: number,
  ): boolean {
    return !activeLine || Boolean(nextLine && currentTime < nextLine.start - 0.5);
  }

  applyEvolutionRule(
    rule: string,
    appearance: number,
    ctx: CanvasRenderingContext2D,
    wordX: number,
    wordY: number,
    colorOverride?: string | null,
  ): { yOffset: number } {
    let yOffset = 0;
    const normalizedRule = rule.toLowerCase();

    if (normalizedRule.includes("larger")) {
      const scale = Math.min(1.5, 1 + appearance * 0.05);
      ctx.transform(scale, 0, 0, scale, wordX * (1 - scale), wordY * (1 - scale));
    }
    if (normalizedRule.includes("glow") || normalizedRule.includes("luminous")) {
      ctx.shadowBlur = Math.min(30, appearance * 4);
      ctx.shadowColor = colorOverride ?? "#ffffff";
    }
    if (normalizedRule.includes("heavier") || normalizedRule.includes("sinking")) {
      yOffset += appearance * 2;
    }

    return { yOffset };
  }
}
