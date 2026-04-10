/**
 * MotionIdentity.ts — 4-layer audio-derived motion system.
 *
 * The audio IS the choreography. No AI, no random seeds.
 * Every parameter comes from audio features we already extract.
 *
 * Layer 1: Song-level identity (derived once from full-song fingerprint)
 * Layer 2: Section modulation (derived per section from local audio average)
 * Layer 3: Phrase reading budget (derived per phrase from word count + duration)
 * Layer 4: Hero event cooldown (tracked at runtime)
 */

import type { AudioAnalysis } from "@/engine/audioAnalyzer";

export interface SongMotionIdentity {
  label: string;
  flowContinuity: number;
  hitSharpness: number;
  gravity: number;
  lateralBias: number;
  anticipation: number;
  impact: number;
  recovery: number;
  carry: number;
}

export interface SectionMotionMod {
  amplitudeScale: number;
  flowShift: number;
}

export interface PhraseMotionBudget {
  damping: number;
}

export function deriveSongMotionIdentity(
  bpm: number,
  analysis: AudioAnalysis | null,
  beats: number[],
): SongMotionIdentity {
  const frames = analysis?.frames ?? [];
  const hits = analysis?.hits ?? [];

  let avgBrightness = 0.5;
  let avgLowRatio = 0.3;
  let avgEnergy = 0.5;
  let energyVariance = 0;

  if (frames.length > 0) {
    let sumB = 0;
    let sumL = 0;
    let sumE = 0;
    for (const frame of frames) {
      sumB += frame.brightness;
      sumL += frame.lowRatio;
      sumE += frame.energy;
    }
    avgBrightness = sumB / frames.length;
    avgLowRatio = sumL / frames.length;
    avgEnergy = sumE / frames.length;

    let sumSqDiff = 0;
    for (const frame of frames) {
      const delta = frame.energy - avgEnergy;
      sumSqDiff += delta * delta;
    }
    energyVariance = Math.sqrt(sumSqDiff / frames.length);
  }

  let bassHits = 0;
  let transientHits = 0;
  let tonalHits = 0;
  for (const hit of hits) {
    if (hit.type === 'bass') bassHits += 1;
    else if (hit.type === 'transient') transientHits += 1;
    else tonalHits += 1;
  }
  const totalHits = Math.max(1, hits.length);
  const bassRatio = bassHits / totalHits;
  const transientRatio = transientHits / totalHits;
  const tonalRatio = tonalHits / totalHits;

  const songDur = frames.length > 0 ? frames[frames.length - 1].time : 180;
  const onsetDensity = hits.length / Math.max(1, songDur);

  let beatRegularity = 0.8;
  if (beats.length > 2) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i += 1) intervals.push(beats[i] - beats[i - 1]);
    const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    let sumSq = 0;
    for (const interval of intervals) sumSq += (interval - avgInterval) * (interval - avgInterval);
    const cv = avgInterval > 0 ? Math.sqrt(sumSq / intervals.length) / avgInterval : 0;
    beatRegularity = Math.max(0, Math.min(1, 1 - cv * 5));
  }

  const flowContinuity = clamp(
    0.5
      - bassRatio * 0.4
      + tonalRatio * 0.3
      - (bpm > 130 ? 0.15 : 0)
      + (bpm < 90 ? 0.2 : 0)
      + (1 - beatRegularity) * 0.15
      - energyVariance * 0.1,
  );

  const hitSharpness = clamp(
    0.5
      + transientRatio * 0.35
      + (bpm > 140 ? 0.15 : 0)
      - tonalRatio * 0.25
      - (avgBrightness > 0.6 ? 0.1 : 0)
      + energyVariance * 0.08,
  );

  const gravity = clamp(
    0.4
      + bassRatio * 0.4
      + avgLowRatio * 0.2
      - avgBrightness * 0.25
      - tonalRatio * 0.15,
  );

  const lateralBias = clamp(
    0.35
      + transientRatio * 0.3
      + (1 - beatRegularity) * 0.2
      - bassRatio * 0.25
      - gravity * 0.15,
  );

  const anticipation = clamp(
    0.3
      + tonalRatio * 0.3
      + (avgEnergy < 0.4 ? 0.2 : 0)
      - transientRatio * 0.2,
  );

  const impact = clamp(hitSharpness * 0.7 + bassRatio * 0.2 + avgEnergy * 0.15 + energyVariance * 0.1);

  const recovery = clamp(
    0.4
      + gravity * 0.3
      + (1 - hitSharpness) * 0.2
      - (bpm > 140 ? 0.15 : 0),
  );

  const carry = clamp(
    flowContinuity * 0.6
      + tonalRatio * 0.2
      + (1 - hitSharpness) * 0.15
      - bassRatio * 0.1,
  );

  let label = 'bounce';
  if (gravity > 0.7 && flowContinuity < 0.3) label = 'slam';
  else if (flowContinuity > 0.7 && lateralBias > 0.45) label = 'groove';
  else if (flowContinuity > 0.8 && avgEnergy < 0.4) label = 'float';
  else if (lateralBias > 0.55 && hitSharpness > 0.6) label = 'snap';
  else if (onsetDensity > 4 && bpm > 140) label = 'shake';
  else if (gravity > 0.6 && bpm < 85) label = 'heavy';

  return { label, flowContinuity, hitSharpness, gravity, lateralBias, anticipation, impact, recovery, carry };
}

export function deriveSectionMotionMod(
  analysis: AudioAnalysis | null,
  startSec: number,
  endSec: number,
  songAvgEnergy: number,
): SectionMotionMod {
  if (!analysis || analysis.frames.length === 0) return { amplitudeScale: 1, flowShift: 0 };

  const { frames, frameRate } = analysis;
  const startFrame = Math.max(0, Math.floor(startSec * frameRate));
  const endFrame = Math.min(frames.length - 1, Math.ceil(endSec * frameRate));
  if (startFrame >= endFrame) return { amplitudeScale: 1, flowShift: 0 };

  let sumE = 0;
  let sumB = 0;
  let count = 0;
  for (let i = startFrame; i <= endFrame; i += 1) {
    sumE += frames[i].energy;
    sumB += frames[i].brightness;
    count += 1;
  }
  const sectionEnergy = count > 0 ? sumE / count : songAvgEnergy;
  const sectionBrightness = count > 0 ? sumB / count : 0.5;
  const energyRatio = songAvgEnergy > 0 ? sectionEnergy / songAvgEnergy : 1;
  const amplitudeScale = clamp(energyRatio, 0.5, 1.5);
  const flowShift = clamp((sectionBrightness - 0.5) * 0.3 - (sectionEnergy > 0.75 ? 0.1 : 0), -0.3, 0.3);
  return { amplitudeScale, flowShift };
}

export function deriveAllSectionMods(
  analysis: AudioAnalysis | null,
  chapters: Array<{ startRatio: number; endRatio: number }>,
  songDuration: number,
): SectionMotionMod[] {
  let songAvgEnergy = 0.5;
  if (analysis && analysis.frames.length > 0) {
    let sum = 0;
    for (const frame of analysis.frames) sum += frame.energy;
    songAvgEnergy = sum / analysis.frames.length;
  }

  return chapters.map((chapter) => deriveSectionMotionMod(
    analysis,
    chapter.startRatio * songDuration,
    chapter.endRatio * songDuration,
    songAvgEnergy,
  ));
}

export function derivePhraseMotionBudget(wordCount: number, durationMs: number): PhraseMotionBudget {
  const durationSec = Math.max(0.1, durationMs / 1000);
  const wordsPerSec = wordCount / durationSec;
  let damping: number;

  if (wordCount <= 1) damping = Math.max(0, 0.15 - durationSec * 0.05);
  else if (wordCount <= 3) damping = clamp(wordsPerSec * 0.15, 0.05, 0.5);
  else damping = clamp(wordsPerSec * 0.2, 0.2, 0.85);

  return { damping };
}

export class HeroEventTracker {
  private _lastHeroTime = -Infinity;
  private _lastHeroScale = 0;

  recordHeroEvent(time: number, emphasisLevel: number): void {
    this._lastHeroTime = time;
    this._lastHeroScale = emphasisLevel;
  }

  getCooldownMultiplier(time: number): number {
    const elapsed = time - this._lastHeroTime;
    if (elapsed > 2) return 1;
    if (elapsed > 1) return 0.7 + (elapsed - 1) * 0.3;
    if (elapsed > 0.5) return 0.5 + (elapsed - 0.5) * 0.4;
    return 0.3;
  }

  reset(): void {
    this._lastHeroTime = -Infinity;
    this._lastHeroScale = 0;
  }
}

export function computeTensionResponse(hitAge: number, identity: SongMotionIdentity): number {
  const { anticipation, impact: impactStrength, recovery: recoveryStrength, carry } = identity;
  const anticipationDur = 0.02 + anticipation * 0.12;
  const impactDur = 0.01 + (1 - impactStrength) * 0.06;
  const recoveryDur = 0.08 + recoveryStrength * 0.35;

  if (hitAge < 0) {
    if (anticipation < 0.3) return 0;
    const preHitWindow = anticipation * 0.08;
    const preHitAge = -hitAge;
    if (preHitAge > preHitWindow) return 0;
    return (1 - preHitAge / preHitWindow) * anticipation * 0.3;
  }

  if (hitAge < impactDur) return 1;

  const decayAge = hitAge - impactDur;
  if (decayAge < recoveryDur) {
    const decayProgress = decayAge / recoveryDur;
    const baseDecay = Math.exp(-decayProgress * 3);
    return baseDecay * (1 - carry * 0.3) + carry * 0.15;
  }

  if (carry > 0.3) {
    const carryAge = hitAge - impactDur - recoveryDur;
    return Math.max(0, carry * 0.1 * Math.exp(-carryAge * 2));
  }

  return 0;
}

export function computeInterBeatSway(phase: number, flow: number): { x: number; y: number } {
  if (flow < 0.25) {
    const decay = Math.exp(-phase * 8);
    return { x: 0, y: -decay * 0.3 };
  }

  if (flow < 0.6) {
    const amp = flow * 1.5;
    const decay = 0.5 + 0.5 * Math.cos(phase * Math.PI);
    return {
      x: Math.sin(phase * Math.PI * 2) * amp * decay * 0.6,
      y: Math.cos(phase * Math.PI * 2) * amp * decay * 0.4,
    };
  }

  const amp = flow * 1.2;
  return {
    x: Math.sin(phase * Math.PI * 2) * amp * 0.8,
    y: Math.cos(phase * Math.PI * 2) * amp * 0.5,
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
