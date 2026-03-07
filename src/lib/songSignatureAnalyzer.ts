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
 * Compute energy curve directly from raw audio samples.
 * This matches the original songSignature.worker.ts behavior and produces
 * sharp transitions needed by sectionDetector's ENERGY_BOUNDARY_THRESHOLD (0.2).
 *
 * The frame-based buildEnergyCurve() over-smooths because AudioAnalyzer
 * pre-normalizes frame.energy by peakEnergy, compressing dynamic range.
 */
export function computeEnergyCurveFromAudio(audioBuffer: AudioBuffer, windowSec = 0.5): Float32Array {
  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const totalSamples = channel.length;
  const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
  const windowCount = Math.max(1, Math.ceil(totalSamples / windowSize));
  const rmsValues = new Float32Array(windowCount);

  let minRms = Number.POSITIVE_INFINITY;
  let maxRms = Number.NEGATIVE_INFINITY;

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    const end = Math.min(totalSamples, start + windowSize);
    let power = 0;
    for (let i = start; i < end; i++) {
      const sample = channel[i];
      power += sample * sample;
    }
    const count = Math.max(1, end - start);
    const rms = Math.sqrt(power / count);
    rmsValues[w] = rms;
    if (rms < minRms) minRms = rms;
    if (rms > maxRms) maxRms = rms;
  }

  const range = maxRms - minRms;
  if (range <= 1e-6) return new Float32Array(windowCount);

  const normalized = new Float32Array(windowCount);
  for (let i = 0; i < windowCount; i++) {
    normalized[i] = clamp01((rmsValues[i] - minRms) / range);
  }
  return normalized;
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

  // Ensure energyCurve is Float32Array (survives JSON round-trip)
  let finalCurve = energyCurve;
  if (finalCurve && !(finalCurve instanceof Float32Array)) {
    finalCurve = new Float32Array(Object.values(finalCurve) as number[]);
  }

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
    energyCurve: finalCurve,
    analysisVersion: 1,
  };
}

/**
 * Build SongSignature with energy curve computed from raw audio.
 * Preferred over buildSongSignature() when audioBuffer is available,
 * because raw-audio RMS produces sharper energy transitions needed
 * by sectionDetector's boundary detection.
 */
export function buildSongSignatureWithAudio(
  audioBuffer: AudioBuffer,
  beatGrid: BeatGrid | BeatGridData,
  analysis: AudioAnalysis | undefined,
  lyrics: string | undefined,
  durationSec: number,
): SongSignature {
  let rmsMean = 0;
  let rmsVar = 0;
  let spectralCentroidHz = 0;

  if (analysis?.frames?.length) {
    const energies = analysis.frames.map((f: any) => f.energy as number);
    const centroids = analysis.frames.map((f: any) => f.centroid as number);
    rmsMean = energies.reduce((s: number, v: number) => s + v, 0) / energies.length;
    rmsVar = variance(energies);
    spectralCentroidHz = centroids.reduce((s: number, v: number) => s + v, 0) / centroids.length;
  }

  const energyCurve = computeEnergyCurveFromAudio(audioBuffer);

  const lyricWordCount = (lyrics || "").trim().split(/\s+/).filter(Boolean).length;
  const lyricDensity = lyricWordCount > 0 && durationSec > 0 ? lyricWordCount / durationSec : null;

  return {
    bpm: beatGrid.bpm,
    durationSec,
    tempoStability: clamp01(beatGrid.confidence),
    beatIntervalVariance: computeBeatIntervalVariance(beatGrid.beats),
    rmsMean,
    rmsVariance: rmsVar,
    zeroCrossingRate: 0,
    spectralCentroidHz,
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
