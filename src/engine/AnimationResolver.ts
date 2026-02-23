export interface LineAnimation {
  entryProgress: number;
  exitProgress: number;
  activeMod: string | null;
  scale: number;
  fontScale: number;
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
  private repetitionScales = new Map<number, number>();

  loadFromDna(dna: Record<string, unknown>, lines?: Array<{ text: string; start: number }>): void {
    this.lineMods.clear();
    this.wordMarks.clear();
    this.hookRanges = [];
    this.repetitionScales.clear();

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

    if (this.hookRanges.length === 0 && lines && lines.length > 0) {
      const textCounts = new Map<string, number[]>();
      lines.forEach((line) => {
        const key = line.text.trim().toLowerCase().slice(0, 30);
        if (!key) return;
        const positions = textCounts.get(key) ?? [];
        positions.push(line.start);
        textCounts.set(key, positions);
      });

      for (const [, positions] of textCounts) {
        if (positions.length >= 3) {
          this.hookRanges.push({ start: positions[0], end: positions[0] + 8 });
          if (this.hookRanges.length >= 2) break;
        }
      }

      if (this.hookRanges.length > 0) {
        console.log("[AnimationResolver] synthetic hooks from repetition:", this.hookRanges);
      }
    }

    if (lines && lines.length > 0) {
      const textCount = new Map<string, number[]>();
      lines.forEach((line, i) => {
        const key = line.text.trim().toLowerCase().slice(0, 25);
        if (!key) return;
        if (!textCount.has(key)) textCount.set(key, []);
        textCount.get(key)!.push(i);
      });

      for (const [, indices] of textCount) {
        if (indices.length < 2) continue;
        const total = indices.length;
        indices.forEach((lineIndex, repetitionIndex) => {
          const repetitionScale = 1.0 + ((repetitionIndex + 1) / total) * 0.25;
          this.repetitionScales.set(lineIndex, repetitionScale);
        });
      }
    }

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
    const activeMod =
      this.lineMods.get(tKey)?.[0] ??
      this.lineMods.get(tKey - 1)?.[0] ??
      this.lineMods.get(tKey + 1)?.[0] ??
      null;
    const isHookLine = this.hookRanges.some(
      (h) => lineStartSec >= h.start && lineStartSec < h.end,
    );
    const fontScale = this.resolveFontScale(activeMod);
    const repetitionScale = this.repetitionScales.get(lineIndex) ?? 1.0;
    const baseScale = isHookLine
      ? 1.15 + beatIntensity * 0.18
      : activeMod
        ? 1.0 + beatIntensity * 0.18
        : 1.0 + beatIntensity * 0.06;
    const scale = baseScale * fontScale * repetitionScale;

    return {
      entryProgress,
      exitProgress,
      activeMod,
      scale,
      fontScale,
      opacityOverride: null,
      isHookLine,
      beatMultiplier: isHookLine ? 1.8 : 1.0,
    };
  }

  private resolveFontScale(activeMod: string | null): number {
    if (!activeMod) return 1.0;

    if (
      [
        "PULSE_STRONG",
        "HEAT_SPIKE",
        "ERUPT",
        "EXPLODE",
        "FLAME_BURST",
        "SHATTER",
        "HOOK_FRACTURE",
      ].includes(activeMod)
    ) {
      return 1.2;
    }

    if (
      ["PULSE_SOFT", "FADE_OUT", "BLUR_OUT", "ECHO_FADE", "DISSOLVE"].includes(
        activeMod,
      )
    ) {
      return 0.85;
    }

    return 1.0;
  }

  resolveWord(
    lineStartSec: number,
    wordIndex: number,
    beatIntensity: number,
  ): WordAnimation | null {
    // word_marks are also keyed by t_lyric (seconds), not lineIndex
    const tKey = Math.round(lineStartSec);
    const mark =
      this.wordMarks.get(`${tKey}:${wordIndex}`) ??
      this.wordMarks.get(`${tKey - 1}:${wordIndex}`) ??
      this.wordMarks.get(`${tKey + 1}:${wordIndex}`);
    if (!mark) return null;
    return { mark, intensity: 0.5 + beatIntensity * 0.5 };
  }
}

export const animationResolver = new AnimationResolver();
