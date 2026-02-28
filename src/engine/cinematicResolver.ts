import type { CinematicDirection, StoryboardEntry, WordDirective } from "@/types/CinematicDirection";

export interface ResolvedLineSettings {
  lineIndex: number;
  sectionIndex: number;
  heroWord: string;
  heroToken: string;
  entryStyle: string;
  exitStyle: string;
  typography: string;
  texture: string;
  atmosphere: string;
}

export interface ResolvedWordSettings {
  token: string;
  emphasisLevel: number;
  behavior: string;
  ghostTrail: boolean;
  ghostDirection: 'up' | 'down' | 'left' | 'right' | 'radial';
  letterSequence: boolean;
  entry: string;
  exit: string;
  pulseAmp: number;
  glowGain: number;
  particleBurst: number;
  microCamPush: number;
}

export interface BeatSpineState {
  beatPhase: number;
  beatPulse: number;
  beatIndex: number;
  nextBeat: number;
}

const EMPHASIS_LEVEL_MAP: Record<number, Pick<ResolvedWordSettings, 'pulseAmp' | 'glowGain' | 'particleBurst' | 'microCamPush'>> = {
  0: { pulseAmp: 0.01, glowGain: 0.02, particleBurst: 0, microCamPush: 0 },
  1: { pulseAmp: 0.015, glowGain: 0.05, particleBurst: 0, microCamPush: 0 },
  2: { pulseAmp: 0.025, glowGain: 0.10, particleBurst: 0.1, microCamPush: 0.005 },
  3: { pulseAmp: 0.04, glowGain: 0.18, particleBurst: 0.2, microCamPush: 0.01 },
  4: { pulseAmp: 0.05, glowGain: 0.30, particleBurst: 0.4, microCamPush: 0.02 },
  5: { pulseAmp: 0.06, glowGain: 0.42, particleBurst: 0.65, microCamPush: 0.03 },
};

const DEFAULT_WORD: ResolvedWordSettings = {
  token: "",
  emphasisLevel: 0,
  behavior: "none",
  ghostTrail: false,
  ghostDirection: "up",
  letterSequence: false,
  entry: "fades",
  exit: "fades",
  ...EMPHASIS_LEVEL_MAP[0],
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
}

function resolveSectionIndex(
  sections: Array<{ startSec?: number; endSec?: number; startRatio?: number; endRatio?: number }>,
  tSec: number,
  totalDurationSec: number,
): number {
  if (!sections.length) return 0;
  const ratio = totalDurationSec > 0 ? clamp01(tSec / totalDurationSec) : 0;
  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    const hasAbs = Number.isFinite(s.startSec) && Number.isFinite(s.endSec);
    if (hasAbs && tSec >= (s.startSec ?? 0) && tSec < (s.endSec ?? Number.MAX_SAFE_INTEGER)) return i;
    if (!hasAbs && ratio >= (s.startRatio ?? 0) && ratio < (s.endRatio ?? 1)) return i;
  }
  return Math.max(0, sections.length - 1);
}

function toWordDirectiveMap(wordDirectives: CinematicDirection['wordDirectives']): Map<string, WordDirective> {
  const map = new Map<string, WordDirective>();
  if (!wordDirectives) return map;
  if (Array.isArray(wordDirectives)) {
    for (const wd of wordDirectives) {
      const key = normalizeToken(wd.word);
      if (key) map.set(key, wd);
    }
    return map;
  }
  for (const [word, wd] of Object.entries(wordDirectives)) {
    const key = normalizeToken(word || (wd as WordDirective)?.word);
    if (key) map.set(key, wd as WordDirective);
  }
  return map;
}

function toStoryboardMap(storyboard: CinematicDirection['storyboard']): Map<number, StoryboardEntry> {
  const map = new Map<number, StoryboardEntry>();
  if (!Array.isArray(storyboard)) return map;
  storyboard.forEach((entry, idx) => {
    const lineIndex = Number.isFinite((entry as StoryboardEntry).lineIndex)
      ? (entry as StoryboardEntry).lineIndex
      : idx;
    map.set(lineIndex, entry as StoryboardEntry);
  });
  return map;
}

export function resolveCinematicState(
  direction: CinematicDirection | null | undefined,
  lines: Array<{ start: number; end: number; text: string }>,
  durationSec: number,
): { lineSettings: Record<number, ResolvedLineSettings>; wordSettings: Record<string, ResolvedWordSettings> } {
  const d = direction ?? {};
  const songDefaults = (d as any).songDefaults ?? {};
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const storyMap = toStoryboardMap(d.storyboard);
  const wdMap = toWordDirectiveMap(d.wordDirectives);

  const lineSettings: Record<number, ResolvedLineSettings> = {};
  lines.forEach((line, idx) => {
    const lineMid = ((line.start ?? 0) + (line.end ?? 0)) * 0.5;
    const sectionIndex = resolveSectionIndex(sections, lineMid, durationSec);
    const section = sections[sectionIndex] ?? {} as Record<string, unknown>;
    const story = storyMap.get(idx) ?? ({} as StoryboardEntry);
    const heroToken = normalizeToken(story.heroWord ?? "");

    lineSettings[idx] = {
      lineIndex: idx,
      sectionIndex,
      heroWord: story.heroWord ?? "",
      heroToken,
      entryStyle: String(story.entryStyle ?? (section as any).motion ?? songDefaults.entryStyle ?? "fades"),
      exitStyle: String(story.exitStyle ?? (section as any).motion ?? songDefaults.exitStyle ?? "fades"),
      typography: String((story as any).typography ?? (section as any).typography ?? d.typography ?? songDefaults.typography ?? "clean-modern"),
      texture: String((story as any).texture ?? (section as any).texture ?? d.texture ?? songDefaults.texture ?? "dust"),
      atmosphere: String((story as any).atmosphere ?? (section as any).atmosphere ?? d.atmosphere ?? songDefaults.atmosphere ?? "cinematic"),
    };
  });

  const wordSettings: Record<string, ResolvedWordSettings> = {};
  wdMap.forEach((wd, token) => {
    const emphasisLevel = Math.max(0, Math.min(5, Math.round(wd.emphasisLevel ?? 0)));
    wordSettings[token] = {
      ...DEFAULT_WORD,
      token,
      emphasisLevel,
      behavior: String(wd.behavior ?? wd.kineticClass ?? "none"),
      ghostTrail: Boolean(wd.ghostTrail),
      ghostDirection: (wd.ghostDirection ?? "up") as ResolvedWordSettings['ghostDirection'],
      letterSequence: Boolean(wd.letterSequence),
      entry: String(wd.entry ?? "fades"),
      exit: String(wd.exit ?? "fades"),
      ...(EMPHASIS_LEVEL_MAP[emphasisLevel] ?? EMPHASIS_LEVEL_MAP[0]),
    };
  });

  return { lineSettings, wordSettings };
}

export function computeBeatSpine(
  tSec: number,
  beatGrid: { bpm?: number; beats?: number[] | null } | null | undefined,
  options?: { lookAheadSec?: number; pulseWidth?: number },
): BeatSpineState {
  const beats = (beatGrid?.beats ?? []).filter((b): b is number => Number.isFinite(b));
  if (!beats.length) return { beatPhase: 0, beatPulse: 0, beatIndex: -1, nextBeat: 0 };

  const lookAheadSec = options?.lookAheadSec ?? 0.03;
  const pulseWidth = Math.max(0.01, options?.pulseWidth ?? 0.11);
  let beatIndex = -1;
  for (let i = 0; i < beats.length; i += 1) {
    if (beats[i] <= tSec) beatIndex = i;
    else break;
  }
  const nextBeat = beats[Math.min(beats.length - 1, Math.max(0, beatIndex + 1))] ?? 0;
  const prevBeat = beatIndex >= 0 ? beats[beatIndex] : beats[0];
  const bpm = beatGrid?.bpm ?? 120;
  const period = Math.max(0.25, 60 / Math.max(1, bpm));
  const beatPhase = clamp01((tSec - prevBeat) / period);

  const probe = tSec + lookAheadSec;
  const nearestBeat = beats.reduce((best, candidate) => {
    const bestDist = Math.abs(best - probe);
    const candDist = Math.abs(candidate - probe);
    return candDist < bestDist ? candidate : best;
  }, beats[0]);
  const dist = Math.abs(nearestBeat - probe);
  const beatPulse = Math.exp(-Math.pow(dist / pulseWidth, 2));
  return { beatPhase, beatPulse: clamp01(beatPulse), beatIndex, nextBeat };
}

export function isExactHeroTokenMatch(word: string, heroWord: string): boolean {
  const a = normalizeToken(word);
  const b = normalizeToken(heroWord);
  return Boolean(a && b && a === b);
}
