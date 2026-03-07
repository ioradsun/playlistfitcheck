import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { AudioAnalysis } from "@/engine/audioAnalyzer";

export type BeatGrid = {
  bpm: number;
  beats: number[];
  confidence: number;
};

export interface SongSignature {
  bpm: number;
  durationSec: number;
  tempoStability: number;
  beatIntervalVariance: number;
  rmsMean: number;
  rmsVariance: number;
  zeroCrossingRate: number;
  spectralCentroidHz: number;
  lyricDensity: number | null;
  energyCurve: Float32Array;
  analysisVersion: 1;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function variance(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let acc = 0;
  for (const v of values) {
    const d = v - mean;
    acc += d * d;
  }
  return acc / values.length;
}

function computeBeatIntervalVariance(beats: number[]): number {
  if (beats.length < 3) return 0;
  const intervals: number[] = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const interval = beats[i + 1] - beats[i];
    if (interval > 0) intervals.push(interval);
  }
  if (intervals.length < 2) return 0;
  const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (meanInterval <= 0) return 0;
  return clamp01(variance(intervals) / (meanInterval * meanInterval) / 0.12);
}

/**
 * Build an energy curve at 0.5s resolution from AudioAnalysis frames.
 * AudioAnalysis frames are at ~43fps (sampleRate/hopSize). We downsample
 * to 0.5s windows to match what sectionDetector expects.
 */
function buildEnergyCurve(frames: AudioAnalysis["frames"], duration: number, frameRate: number): Float32Array {
  const WINDOW_SEC = 0.5;
  const windowCount = Math.max(1, Math.ceil(duration / WINDOW_SEC));
  const curve = new Float32Array(windowCount);

  for (let w = 0; w < windowCount; w++) {
    const startTime = w * WINDOW_SEC;
    const endTime = startTime + WINDOW_SEC;
    const startFrame = Math.floor(startTime * frameRate);
    const endFrame = Math.min(frames.length, Math.ceil(endTime * frameRate));
    let sum = 0;
    let count = 0;
    for (let f = startFrame; f < endFrame; f++) {
      if (f < frames.length) {
        sum += frames[f].energy;
        count++;
      }
    }
    curve[w] = count > 0 ? sum / count : 0;
  }

  // Normalize to 0..1
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i] < min) min = curve[i];
    if (curve[i] > max) max = curve[i];
  }
  const range = max - min;
  if (range > 1e-6) {
    for (let i = 0; i < curve.length; i++) {
      curve[i] = clamp01((curve[i] - min) / range);
    }
  }

  return curve;
}

/**
 * Build SongSignature synchronously from existing AudioAnalysis data.
 * No Web Worker needed — AudioAnalysis already has per-frame energy, centroid, etc.
 * Falls back to a minimal signature if no analysis is available.
 */
export function buildSongSignature(
  beatGrid: BeatGrid | BeatGridData,
  analysis: AudioAnalysis | undefined,
  lyrics: string | undefined,
  durationSec: number,
): SongSignature {
  const lyricWordCount = (lyrics || "").trim().split(/\s+/).filter(Boolean).length;
  const lyricDensity = lyricWordCount > 0 && durationSec > 0 ? lyricWordCount / durationSec : null;

  if (!analysis || !analysis.frames || analysis.frames.length === 0) {
    return {
      bpm: beatGrid.bpm,
      durationSec,
      tempoStability: clamp01(beatGrid.confidence),
      beatIntervalVariance: computeBeatIntervalVariance(beatGrid.beats),
      rmsMean: 0,
      rmsVariance: 0,
      zeroCrossingRate: 0,
      spectralCentroidHz: 0,
      lyricDensity,
      energyCurve: new Float32Array(0),
      analysisVersion: 1,
    };
  }

  const frames = analysis.frames;
  const energies = frames.map((f: any) => f.energy as number);
  const centroids = frames.map((f: any) => f.centroid as number);
  const rmsMean = energies.reduce((s: number, v: number) => s + v, 0) / energies.length;
  const avgCentroid = centroids.reduce((s: number, v: number) => s + v, 0) / centroids.length;

  const energyCurve = buildEnergyCurve(frames, durationSec, analysis.frameRate);

  return {
    bpm: beatGrid.bpm,
    durationSec,
    tempoStability: clamp01(beatGrid.confidence),
    beatIntervalVariance: computeBeatIntervalVariance(beatGrid.beats),
    rmsMean,
    rmsVariance: variance(energies),
    zeroCrossingRate: 0, // Not available from AudioAnalysis; unused by sectionDetector
    spectralCentroidHz: avgCentroid,
    lyricDensity,
    energyCurve,
    analysisVersion: 1,
  };
}

// DEPRECATED: Kept for backwards compatibility if anything still imports the old API.
export const songSignatureAnalyzer = {
  async analyze(
    _audioBuffer: AudioBuffer,
    beatGrid: BeatGrid | BeatGridData,
    lyrics?: string,
    durationSec?: number,
  ): Promise<SongSignature> {
    return buildSongSignature(beatGrid, undefined, lyrics, durationSec ?? 0);
  },
};
