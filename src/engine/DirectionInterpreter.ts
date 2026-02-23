import type {
  Chapter,
  CinematicDirection,
  LineDirection,
  ShotType,
  TensionStage,
  WordDirective,
} from "@/types/CinematicDirection";

export interface WordHistory {
  count: number;
  firstSeen: number;
  lastSeen: number;
  positions: Array<{ x: number; y: number }>;
}

export interface EvolutionProps {
  scaleMultiplier: number;
  glowRadius: number;
  opacityMultiplier: number;
  yOffset: number;
}

export function applyEvolutionRule(
  ctx: CanvasRenderingContext2D,
  rule: string,
  history: WordHistory,
  wordX: number,
  wordY: number,
  wordWidth: number,
  fontSize: number,
  beatIntensity: number,
  palette: string[],
): EvolutionProps {
  const count = history.count;
  const r = rule.toLowerCase();

  let scaleMultiplier = 1.0;
  let glowRadius = 0;
  let opacityMultiplier = 1.0;
  let yOffset = 0;

  if (r.includes("larger") || r.includes("prominent") || r.includes("bigger")) {
    scaleMultiplier = Math.min(1.6, 1 + count * 0.06);
  }

  if (r.includes("luminous") || r.includes("brighter") || r.includes("glow")) {
    glowRadius = Math.min(35, count * 4);
  }

  if (r.includes("heavier") || r.includes("sinking") || r.includes("deeper")) {
    yOffset = Math.min(count * 2, 20);
    scaleMultiplier = Math.max(scaleMultiplier, Math.min(1.2, 1 + count * 0.02));
  }

  if (r.includes("frantic") || r.includes("faster") || r.includes("intense")) {
    glowRadius = Math.max(glowRadius, Math.min(20, count * 2 + beatIntensity * 4));
  }

  if (r.includes("fades") || r.includes("recedes") || r.includes("quieter")) {
    opacityMultiplier = Math.max(0.3, 1 - count * 0.08);
  }

  if (r.includes("expands") || r.includes("aura") || r.includes("field")) {
    const ringRadius = (wordWidth / 2) * (1.3 + count * 0.1);
    ctx.beginPath();
    ctx.ellipse(
      wordX + wordWidth / 2,
      wordY - fontSize / 2,
      ringRadius,
      ringRadius * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = `rgba(240,248,255,${Math.min(0.4, count * 0.05)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    scaleMultiplier = Math.max(scaleMultiplier, Math.min(1.5, 1 + count * 0.05));
  }

  if (r.includes("consuming") && count > 8) {
    const bigRadius = Math.max(wordWidth, ctx.canvas.width * 0.45);
    ctx.beginPath();
    ctx.ellipse(
      wordX + wordWidth / 2,
      wordY - fontSize / 2,
      bigRadius,
      Math.max(40, bigRadius * 0.35),
      0,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = `rgba(240,248,255,${Math.min(0.3, 0.12 + count * 0.015)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    scaleMultiplier = Math.max(scaleMultiplier, 1.5);
    glowRadius = Math.max(glowRadius, 30);
  }

  if (r.includes("color") || r.includes("shifts")) {
    ctx.fillStyle = palette[count % Math.max(1, palette.length)] ?? "#ffffff";
  }

  scaleMultiplier = Math.min(scaleMultiplier, 2.0);
  glowRadius = Math.min(glowRadius, 40);
  opacityMultiplier = Math.max(opacityMultiplier, 0.2);

  return { scaleMultiplier, glowRadius, opacityMultiplier, yOffset };
}


export function getCurrentTensionStage(
  songProgress: number,
  tensionCurve: TensionStage[] | undefined,
): TensionStage | null {
  if (!tensionCurve) return null;
  return tensionCurve.find((stage) => (
    songProgress >= stage.startRatio && songProgress <= stage.endRatio
  )) ?? null;
}

export function getActiveShot(
  lineIndex: number,
  shotProgression: ShotType[] | undefined,
): ShotType | null {
  if (!shotProgression) return null;
  return shotProgression.find((shot) => shot.lineIndex === lineIndex) ?? null;
}

export class DirectionInterpreter {
  private evolutionCache = new Map<string, { count: number; props: EvolutionProps }>();

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
    ctx: CanvasRenderingContext2D,
    rule: string,
    history: WordHistory,
    wordX: number,
    wordY: number,
    wordWidth: number,
    fontSize: number,
    beatIntensity: number,
    palette: string[],
  ): EvolutionProps {
    const normalizedRule = rule.toLowerCase();
    const hasDrawSideEffects = normalizedRule.includes("expands")
      || normalizedRule.includes("aura")
      || normalizedRule.includes("field")
      || normalizedRule.includes("consuming")
      || normalizedRule.includes("color")
      || normalizedRule.includes("shifts");

    const cacheKey = `${normalizedRule}::${history.count}`;
    if (!hasDrawSideEffects) {
      const cached = this.evolutionCache.get(cacheKey);
      if (cached && cached.count === history.count) {
        return cached.props;
      }
    }

    const props = applyEvolutionRule(
      ctx,
      rule,
      history,
      wordX,
      wordY,
      wordWidth,
      fontSize,
      beatIntensity,
      palette,
    );

    if (!hasDrawSideEffects) {
      this.evolutionCache.set(cacheKey, { count: history.count, props });
    }

    return props;
  }

  invalidateEvolutionCache(): void {
    this.evolutionCache.clear();
  }
}
