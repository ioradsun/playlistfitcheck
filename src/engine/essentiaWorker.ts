/**
 * essentiaWorker — Essentia.js beat detection wrapper.
 * Runs RhythmExtractor2013 via the essentia.js WASM module.
 */

let essentiaReady: Promise<any> | null = null;

/** Preload Essentia WASM so beat detection starts instantly when audio arrives. */
export function preloadEssentia(): void {
  if (!essentiaReady) {
    essentiaReady = importEssentia();
  }
}

async function importEssentia() {
  try {
    const { Essentia, EssentiaWASM } = await import("essentia.js");
    const wasmModule = await EssentiaWASM();
    return new Essentia(wasmModule);
  } catch {
    return null;
  }
}

export interface EssentiaResult {
  bpm: number;
  beats: number[];
  confidence: number;
}

/**
 * Run beat detection on a mono Float32Array signal (expected 44100 Hz).
 */
export async function runEssentiaAsync(signal: Float32Array): Promise<EssentiaResult> {
  if (!essentiaReady) essentiaReady = importEssentia();
  const essentia = await essentiaReady;

  if (!essentia) {
    // Fallback: estimate BPM from signal length, return empty beats
    return { bpm: 120, beats: [], confidence: 0 };
  }

  try {
    const vecSignal = essentia.arrayToVector(signal);
    const result = essentia.RhythmExtractor2013(vecSignal);
    const bpm: number = result.bpm ?? 120;
    const confidence: number = result.confidence ?? 0;
    const ticksVec = result.ticks;
    const beats: number[] = [];

    if (ticksVec && typeof ticksVec.size === "function") {
      const len = ticksVec.size();
      for (let i = 0; i < len; i++) {
        beats.push(ticksVec.get(i));
      }
    }

    return { bpm, beats, confidence };
  } catch {
    return { bpm: 120, beats: [], confidence: 0 };
  }
}
