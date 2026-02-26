import type { BeatGridData } from "@/hooks/useBeatGrid";
import type { WorkerInput, WorkerOutput } from "@/workers/songSignature.worker";

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
  energyCurve: Float32Array;
  analysisVersion: 1;
}

function toMonoSignal(audioBuffer: AudioBuffer): Float32Array {
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

export const songSignatureAnalyzer = {
  async analyze(
    audioBuffer: AudioBuffer,
    beatGrid: BeatGrid | BeatGridData,
    lyrics?: string,
    durationSec?: number,
  ): Promise<SongSignature> {
    const monoSignal = toMonoSignal(audioBuffer);
    const effectiveDuration = durationSec ?? audioBuffer.duration;

    const input: WorkerInput = {
      monoSignal,
      sampleRate: audioBuffer.sampleRate,
      beatGrid: { bpm: beatGrid.bpm, beats: beatGrid.beats, confidence: beatGrid.confidence },
      lyrics: lyrics || "",
      durationSec: effectiveDuration,
    };

    return new Promise<SongSignature>((resolve, reject) => {
      const worker = new Worker(
        new URL("@/workers/songSignature.worker.ts", import.meta.url),
        { type: "module" },
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error("Song signature analysis timed out (30s)"));
      }, 30_000);

      worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(e.data as SongSignature);
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(`Song signature worker error: ${err.message}`));
      };

      // Transfer the monoSignal buffer for zero-copy
      worker.postMessage(input, [monoSignal.buffer]);
    });
  },
};
