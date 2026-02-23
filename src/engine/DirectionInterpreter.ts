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
    return this.direction.wordDirectives[key] ?? null;
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
}
