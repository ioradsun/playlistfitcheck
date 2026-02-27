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

export interface SectionGrade {
  baseTextColor: string;
  futureTextColor: string;
  activeTextColor: string;
  glowColor: string;
  echoColor: string;
  overlayStyle: 'grain' | 'haze' | 'glass' | 'none';
  temperature: number;
  contrast: number;
  hazeLift: number;
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
  0: { pulseAmp: 0.02, glowGain: 0.03, particleBurst: 0, microCamPush: 0 },
  1: { pulseAmp: 0.06, glowGain: 0.08, particleBurst: 0.1, microCamPush: 0.01 },
  2: { pulseAmp: 0.1, glowGain: 0.16, particleBurst: 0.2, microCamPush: 0.02 },
  3: { pulseAmp: 0.16, glowGain: 0.24, particleBurst: 0.35, microCamPush: 0.03 },
  4: { pulseAmp: 0.22, glowGain: 0.34, particleBurst: 0.5, microCamPush: 0.05 },
  5: { pulseAmp: 0.28, glowGain: 0.45, particleBurst: 0.7, microCamPush: 0.07 },
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
): {
  lineSettings: Record<number, ResolvedLineSettings>;
  wordSettings: Record<string, ResolvedWordSettings>;
  sectionGrades: SectionGrade[];
} {
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
      entryStyle: String(story.entryStyle ?? section.motion ?? songDefaults.entryStyle ?? "fades"),
      exitStyle: String(story.exitStyle ?? section.motion ?? songDefaults.exitStyle ?? "fades"),
      typography: String((story as any).typography ?? section.typography ?? d.typography ?? songDefaults.typography ?? "clean-modern"),
      texture: String((story as any).texture ?? section.texture ?? d.texture ?? songDefaults.texture ?? "dust"),
      atmosphere: String((story as any).atmosphere ?? section.atmosphere ?? d.atmosphere ?? songDefaults.atmosphere ?? "cinematic"),
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

  const sectionGrades = sections.map((section) => resolveSectionGrade(section as Record<string, unknown>, d));
  return { lineSettings, wordSettings, sectionGrades };
}

function resolveSectionGrade(section: Record<string, unknown>, root: Record<string, unknown>): SectionGrade {
  const mood = String(section.mood ?? root.sceneTone ?? '').toLowerCase();
  const atmosphere = String(section.atmosphere ?? root.atmosphere ?? '').toLowerCase();
  const texture = String(section.texture ?? root.texture ?? '').toLowerCase();
  const styleToken = `${mood} ${atmosphere} ${texture}`;
  const cool = /(lonely|void|dark|glass|winter|night)/.test(styleToken);
  const warm = /(warm|devotion|sun|golden|ember)/.test(styleToken);
  const hazy = /(haze|stars|mist|dust)/.test(styleToken);
  const glass = /(glass|mirror|crystal)/.test(styleToken);

  const activeTextColor = cool ? '#eaf2ff' : (warm ? '#fff0dc' : '#f5f7ff');
  const baseTextColor = cool ? '#cfd9ee' : (warm ? '#e9ddc8' : '#d8deea');
  const futureTextColor = cool ? '#7183a6' : (warm ? '#8f7c67' : '#6f788f');
  const glowColor = cool ? '#9eb8ff' : (warm ? '#ffcfa3' : '#bed0ff');
  const echoColor = cool ? '#9caecc' : (warm ? '#c3ae91' : '#98a2bf');

  return {
    baseTextColor,
    futureTextColor,
    activeTextColor,
    glowColor,
    echoColor,
    overlayStyle: glass ? 'glass' : (hazy ? 'haze' : (texture.includes('grain') || texture.includes('dust') ? 'grain' : 'none')),
    temperature: cool ? -0.7 : (warm ? 0.7 : 0),
    contrast: cool ? 0.75 : (warm ? 0.52 : 0.62),
    hazeLift: hazy ? 0.28 : 0.12,
  };
}

export function blendSectionGrade(a: SectionGrade, b: SectionGrade, t: number): SectionGrade {
  const m = clamp01(t);
  const c = (ca: string, cb: string) => {
    const pa = Number.parseInt(ca.slice(1), 16);
    const pb = Number.parseInt(cb.slice(1), 16);
    const ar = (pa >> 16) & 0xff;
    const ag = (pa >> 8) & 0xff;
    const ab = pa & 0xff;
    const br = (pb >> 16) & 0xff;
    const bg = (pb >> 8) & 0xff;
    const bb = pb & 0xff;
    const rr = Math.round(ar + (br - ar) * m);
    const rg = Math.round(ag + (bg - ag) * m);
    const rb = Math.round(ab + (bb - ab) * m);
    return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rb.toString(16).padStart(2, '0')}`;
  };
  return {
    baseTextColor: c(a.baseTextColor, b.baseTextColor),
    futureTextColor: c(a.futureTextColor, b.futureTextColor),
    activeTextColor: c(a.activeTextColor, b.activeTextColor),
    glowColor: c(a.glowColor, b.glowColor),
    echoColor: c(a.echoColor, b.echoColor),
    overlayStyle: m < 0.5 ? a.overlayStyle : b.overlayStyle,
    temperature: a.temperature + (b.temperature - a.temperature) * m,
    contrast: a.contrast + (b.contrast - a.contrast) * m,
    hazeLift: a.hazeLift + (b.hazeLift - a.hazeLift) * m,
  };
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
