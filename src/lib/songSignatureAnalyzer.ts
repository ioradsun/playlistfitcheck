import type { BeatGridData } from "@/hooks/useBeatGrid";

export type BeatGrid = {
  bpm: number;
  beats: number[]; // seconds from Essentia RhythmExtractor2013 ticks
  confidence: number; // 0..1
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
  analysisVersion: 1;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function toMonoBuffer(audioBuffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = audioBuffer;
  if (numberOfChannels === 1) return audioBuffer.getChannelData(0);

  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += channelData[i];
  }
  const gain = 1 / numberOfChannels;
  for (let i = 0; i < length; i += 1) mono[i] *= gain;
  return mono;
}

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
  const frameSize = 256; // small to keep O(n²) fallback cheap in-browser
  const hopSize = 128;
  if (signal.length < frameSize) {
    return {
      rmsMean: 0,
      rmsVariance: 0,
      zeroCrossingRate: 0,
      spectralCentroidHz: 0,
    };
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
    rmsMean: rmsValues.length
      ? rmsValues.reduce((sum, v) => sum + v, 0) / rmsValues.length
      : 0,
    rmsVariance: variance(rmsValues),
    zeroCrossingRate: zcrFrames ? zcrAccum / zcrFrames : 0,
    spectralCentroidHz: centroidFrames ? centroidAccum / centroidFrames : 0,
  };
}

export const songSignatureAnalyzer = {
  async analyze(
    audioBuffer: AudioBuffer,
    beatGrid: BeatGrid | BeatGridData,
    lyrics?: string,
    durationSec?: number,
  ): Promise<SongSignature> {
    const signal = toMonoBuffer(audioBuffer);
    const frameFeatures = computeFrameFeatures(signal, audioBuffer.sampleRate);
    const lyricWordCount = (lyrics || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    const effectiveDuration = durationSec ?? audioBuffer.duration;

    return {
      bpm: beatGrid.bpm,
      durationSec: effectiveDuration,
      tempoStability: clamp01(beatGrid.confidence),
      // Derived from interval regularity (no per-beat strengths in Essentia output).
      beatIntervalVariance: computeBeatIntervalVariance(beatGrid.beats),
      rmsMean: frameFeatures.rmsMean,
      rmsVariance: frameFeatures.rmsVariance,
      zeroCrossingRate: frameFeatures.zeroCrossingRate,
      spectralCentroidHz: frameFeatures.spectralCentroidHz,
      lyricDensity:
        lyricWordCount > 0 && effectiveDuration > 0
          ? lyricWordCount / effectiveDuration
          : null,
      analysisVersion: 1,
    };
  },
};
