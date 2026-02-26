/**
 * Web Worker for song signature analysis.
 * Moves the O(n²) DFT and energy curve computation off the main thread.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function variance(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  let acc = 0;
  for (const value of values) {
    const delta = value - mean;
    acc += delta * delta;
  }
  return acc / values.length;
}

function computeBeatIntervalVariance(beats: number[]): number {
  if (beats.length < 3) return 0;
  const intervals: number[] = [];
  for (let i = 0; i < beats.length - 1; i += 1) {
    const interval = beats[i + 1] - beats[i];
    if (interval > 0) intervals.push(interval);
  }
  if (intervals.length < 2) return 0;
  const meanInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  if (meanInterval <= 0) return 0;
  const normalizedVariance = variance(intervals) / (meanInterval * meanInterval);
  return clamp01(normalizedVariance / 0.12);
}

function computeFrameFeatures(signal: Float32Array, sampleRate: number): {
  rmsMean: number;
  rmsVariance: number;
  zeroCrossingRate: number;
  spectralCentroidHz: number;
} {
  const frameSize = 256;
  const hopSize = 128;
  if (signal.length < frameSize) {
    return { rmsMean: 0, rmsVariance: 0, zeroCrossingRate: 0, spectralCentroidHz: 0 };
  }

  const rmsValues: number[] = [];
  let zcrAccum = 0;
  let zcrFrames = 0;
  let centroidAccum = 0;
  let centroidFrames = 0;

  for (let offset = 0; offset + frameSize <= signal.length; offset += hopSize) {
    let power = 0;
    let zeroCrosses = 0;

    for (let i = 0; i < frameSize; i += 1) {
      const sample = signal[offset + i];
      power += sample * sample;
      if (i > 0) {
        const prev = signal[offset + i - 1];
        if ((prev >= 0 && sample < 0) || (prev < 0 && sample >= 0)) zeroCrosses += 1;
      }
    }

    const rms = Math.sqrt(power / frameSize);
    rmsValues.push(rms);
    zcrAccum += zeroCrosses / (frameSize - 1);
    zcrFrames += 1;

    let magnitudeSum = 0;
    let weightedFreqSum = 0;
    const half = frameSize / 2;
    for (let k = 0; k <= half; k += 1) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < frameSize; n += 1) {
        const angle = (2 * Math.PI * k * n) / frameSize;
        const sample = signal[offset + n];
        re += sample * Math.cos(angle);
        im -= sample * Math.sin(angle);
      }
      const magnitude = Math.sqrt(re * re + im * im);
      const frequency = (k * sampleRate) / frameSize;
      magnitudeSum += magnitude;
      weightedFreqSum += magnitude * frequency;
    }

    if (magnitudeSum > 0) {
      centroidAccum += weightedFreqSum / magnitudeSum;
      centroidFrames += 1;
    }
  }

  return {
    rmsMean: rmsValues.length ? rmsValues.reduce((sum, v) => sum + v, 0) / rmsValues.length : 0,
    rmsVariance: variance(rmsValues),
    zeroCrossingRate: zcrFrames ? zcrAccum / zcrFrames : 0,
    spectralCentroidHz: centroidFrames ? centroidAccum / centroidFrames : 0,
  };
}

function computeEnergyCurve(signal: Float32Array, sampleRate: number, windowSec = 0.5): Float32Array {
  const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
  const windows = Math.max(1, Math.ceil(signal.length / windowSize));
  const rmsValues = new Float32Array(windows);

  let minRms = Number.POSITIVE_INFINITY;
  let maxRms = Number.NEGATIVE_INFINITY;

  for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
    const start = windowIndex * windowSize;
    const end = Math.min(signal.length, start + windowSize);
    let power = 0;
    for (let i = start; i < end; i += 1) {
      const sample = signal[i];
      power += sample * sample;
    }
    const count = Math.max(1, end - start);
    const rms = Math.sqrt(power / count);
    rmsValues[windowIndex] = rms;
    if (rms < minRms) minRms = rms;
    if (rms > maxRms) maxRms = rms;
  }

  const range = maxRms - minRms;
  if (range <= 1e-6) return new Float32Array(windows);

  const normalized = new Float32Array(windows);
  for (let i = 0; i < windows; i += 1) {
    normalized[i] = clamp01((rmsValues[i] - minRms) / range);
  }
  return normalized;
}

export interface WorkerInput {
  monoSignal: Float32Array;
  sampleRate: number;
  beatGrid: { bpm: number; beats: number[]; confidence: number };
  lyrics: string;
  durationSec: number;
}

export interface WorkerOutput {
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

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { monoSignal, sampleRate, beatGrid, lyrics, durationSec } = e.data;

  const frameFeatures = computeFrameFeatures(monoSignal, sampleRate);
  const energyCurve = computeEnergyCurve(monoSignal, sampleRate, 0.5);

  const lyricWordCount = (lyrics || "").trim().split(/\s+/).filter(Boolean).length;

  const result: WorkerOutput = {
    bpm: beatGrid.bpm,
    durationSec,
    tempoStability: clamp01(beatGrid.confidence),
    beatIntervalVariance: computeBeatIntervalVariance(beatGrid.beats),
    rmsMean: frameFeatures.rmsMean,
    rmsVariance: frameFeatures.rmsVariance,
    zeroCrossingRate: frameFeatures.zeroCrossingRate,
    spectralCentroidHz: frameFeatures.spectralCentroidHz,
    lyricDensity: lyricWordCount > 0 && durationSec > 0 ? lyricWordCount / durationSec : null,
    energyCurve,
    analysisVersion: 1,
  };

  // Transfer the energyCurve buffer for zero-copy
  self.postMessage(result, [energyCurve.buffer] as any);
};
