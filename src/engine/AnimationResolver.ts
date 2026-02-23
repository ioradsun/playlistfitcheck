export interface LineAnimation {
  entryProgress: number;
  exitProgress: number;
  activeMod: string | null;
  scale: number;
  opacityOverride: number | null;
  isHookLine: boolean;
  beatMultiplier: number;
}

export interface WordAnimation {
  mark: string;
  intensity: number;
}

export class AnimationResolver {
  private lineMods = new Map<number, string[]>();
  private wordMarks = new Map<string, string>();
  private hookRanges: Array<{ start: number; end: number }> = [];

  loadFromDna(dna: Record<string, unknown>): void {
    this.lineMods.clear();
    this.wordMarks.clear();
    this.hookRanges = [];

    const lexicon = (dna?.physics_spec as any)?.lexicon ?? (dna?.physicsSpec as any)?.lexicon;

    for (const mod of lexicon?.line_mods ?? []) {
      this.lineMods.set(mod.t_lyric, mod.mods);
    }
    for (const wm of lexicon?.word_marks ?? []) {
      this.wordMarks.set(`${wm.t_lyric}:${wm.wordIndex}`, wm.mark);
    }

    const hooks = (dna?.hottest_hooks ?? []) as any[];
    this.hookRanges = hooks.map((h) => ({
      start: h.start_sec ?? h.start ?? 0,
      end: (h.start_sec ?? h.start ?? 0) + (h.duration_sec ?? 10),
    }));

    console.log("[AnimationResolver] loaded:", {
      lineMods: this.lineMods.size,
      wordMarks: this.wordMarks.size,
      hooks: this.hookRanges,
    });
  }

  resolveLine(
    lineIndex: number,
    lineStartSec: number,
    lineEndSec: number,
    currentTimeSec: number,
    beatIntensity: number,
  ): LineAnimation {
    const duration = Math.max(0.001, lineEndSec - lineStartSec);
    const elapsed = currentTimeSec - lineStartSec;
    const entryDur = Math.min(0.35, duration * 0.2);
    const exitDur = Math.min(0.35, duration * 0.2);
    const entryProgress = Math.min(1, Math.max(0, elapsed / entryDur));
    const exitProgress =
      elapsed > duration - exitDur
        ? Math.min(1, (elapsed - (duration - exitDur)) / exitDur)
        : 0;

    // line_mods are keyed by t_lyric (seconds), not lineIndex
    const tKey = Math.round(lineStartSec);
    const activeMod = this.lineMods.get(tKey)?.[0] ?? null;
    const isHookLine = this.hookRanges.some(
      (h) => lineStartSec >= h.start && lineStartSec < h.end,
    );
    const scale = isHookLine
      ? 1.0 + beatIntensity * 0.12
      : 1.0 + beatIntensity * 0.04;

    return {
      entryProgress,
      exitProgress,
      activeMod,
      scale,
      opacityOverride: null,
      isHookLine,
      beatMultiplier: isHookLine ? 1.8 : 1.0,
    };
  }

  resolveWord(
    lineStartSec: number,
    wordIndex: number,
    beatIntensity: number,
  ): WordAnimation | null {
    // word_marks are also keyed by t_lyric (seconds), not lineIndex
    const tKey = Math.round(lineStartSec);
    const mark = this.wordMarks.get(`${tKey}:${wordIndex}`);
    if (!mark) return null;
    return { mark, intensity: 0.5 + beatIntensity * 0.5 };
  }
}

export const animationResolver = new AnimationResolver();
