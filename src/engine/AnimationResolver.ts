import { getRelativeLuminance, getSafeTextColor } from "./SystemStyles";

export interface LineAnimation {
  entryProgress: number;
  exitProgress: number;
  activeMod: string | null;
  lineColor: string;
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
  private repetitionByLineIndex = new Map<number, { repetitionIndex: number; repetitionTotal: number }>();
  private repetitionScales = new Map<number, number>();

  loadFromDna(dna: Record<string, unknown>, lines?: Array<{ text: string; start: number }>): void {
    this.lineMods.clear();
    this.wordMarks.clear();
    this.hookRanges = [];
    this.repetitionByLineIndex.clear();
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

    if (lines && lines.length > 0) {
      const lineGroups = new Map<string, number[]>();
      lines.forEach((line, lineIndex) => {
        const key = line.text.trim().toLowerCase().slice(0, 30);
        if (!key) return;
        const groupedLineIndexes = lineGroups.get(key) ?? [];
        groupedLineIndexes.push(lineIndex);
        lineGroups.set(key, groupedLineIndexes);
      });

      for (const [, groupedIndexes] of lineGroups) {
        const repetitionTotal = groupedIndexes.length;
        groupedIndexes.forEach((lineIndex, repetitionIndex) => {
          this.repetitionByLineIndex.set(lineIndex, { repetitionIndex, repetitionTotal });
        });
      }
    }

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
    palette: [string, string, string] | string[],
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

    const tKey = Math.round(lineStartSec);
    const activeMod =
      this.lineMods.get(tKey)?.[0] ??
      this.lineMods.get(tKey - 1)?.[0] ??
      this.lineMods.get(tKey + 1)?.[0] ??
      null;
    const isHookLine = this.hookRanges.some(
      (h) => lineStartSec >= h.start && lineStartSec < h.end,
    );

    const MOD_COLORS: Record<string, number> = {
      EMBER_RISE: 2,
      FLAME_BURST: 2,
      HEAT_SPIKE: 2,
      EMBER_GLOW: 2,
      IGNITE: 2,
      ERUPT: 2,
      GLITCH_FLASH: -1,
      STATIC_GLITCH: -1,
      THUNDER_CRACK: -1,
      GRAVITY_DROP: 1,
      TUNNEL_RUSH: 1,
      ECHO_FADE: 1,
      DISSOLVE: 1,
      BLUR_OUT: 1,
    };

    let lineColor = isHookLine
      ? "#ffffff"
      : exitProgress > 0.5
        ? (palette?.[1] ?? "#888888")
        : getSafeTextColor(palette);

    const repetitionData = this.repetitionByLineIndex.get(lineIndex);
    if (repetitionData && repetitionData.repetitionTotal > 2) {
      const progress = repetitionData.repetitionIndex / (repetitionData.repetitionTotal - 1);
      if (progress < 0.33) {
        lineColor = palette?.[1] ?? "#888888";
      } else if (progress < 0.66) {
        lineColor = getSafeTextColor(palette);
      } else {
        lineColor = "#ffffff";
      }
    }

    const modColorIndex = activeMod ? MOD_COLORS[activeMod] : undefined;
    if (modColorIndex === -1) {
      lineColor = "#ffffff";
    } else if (modColorIndex !== undefined) {
      lineColor = palette?.[modColorIndex] ?? lineColor;
    }

    lineColor = ensureContrast(lineColor, palette?.[0] ?? "#111111");

    const scale = isHookLine
      ? 1.0 + beatIntensity * 0.12
      : 1.0 + beatIntensity * 0.04;
    const baseFontScale = this.resolveFontScale(activeMod);
    const repetitionScale = this.repetitionScales.get(lineIndex) ?? 1;
    const fontScale = baseFontScale * repetitionScale;

    const fontScale = this.resolveFontScale(activeMod);

    return {
      entryProgress,
      exitProgress,
      activeMod,
      lineColor,
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
    const tKey = Math.round(lineStartSec);
    const mark =
      this.wordMarks.get(`${tKey}:${wordIndex}`) ??
      this.wordMarks.get(`${tKey - 1}:${wordIndex}`) ??
      this.wordMarks.get(`${tKey + 1}:${wordIndex}`);
    if (!mark) return null;
    return { mark, intensity: 0.5 + beatIntensity * 0.5 };
  }
}

function getContrastRatio(color: string, bg: string): number {
  const colorLum = getRelativeLuminance(color);
  const bgLum = getRelativeLuminance(bg);
  return (Math.max(colorLum, bgLum) + 0.05) / (Math.min(colorLum, bgLum) + 0.05);
}

function ensureContrast(color: string, bg: string): string {
  const ratio = getContrastRatio(color, bg);
  return ratio >= 4.5 ? color : "#ffffff";
}

export const animationResolver = new AnimationResolver();
