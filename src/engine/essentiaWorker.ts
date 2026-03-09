/**
 * EssentiaWorker — runs Essentia beat detection in a Web Worker.
 * Uses inline worker pattern to avoid separate file bundling issues.
 */

let workerBlobUrl: string | null = null;

interface BeatResult {
  bpm: number;
  beats: number[];
  confidence: number;
}

function getWorkerUrl(): string {
  if (workerBlobUrl) return workerBlobUrl;

  const workerCode = `
    const ESSENTIA_WASM_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js";
    const ESSENTIA_CORE_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js";

    let essentia = null;

    async function loadEssentia() {
      if (essentia) return essentia;
      importScripts(ESSENTIA_WASM_URL, ESSENTIA_CORE_URL);
      const wasmModule = await EssentiaWASM();
      essentia = new Essentia(wasmModule);
      return essentia;
    }

    self.onmessage = async function(e) {
      const { signal, sampleRate } = e.data;

      try {
        const ess = await loadEssentia();

        let processSignal = new Float32Array(signal);
        if (sampleRate !== 44100) {
          const ratio = 44100 / sampleRate;
          const newLength = Math.ceil(processSignal.length * ratio);
          const resampled = new Float32Array(newLength);

          for (let i = 0; i < newLength; i++) {
            const srcIdx = i / ratio;
            const floor = Math.floor(srcIdx);
            const ceil = Math.min(floor + 1, processSignal.length - 1);
            const frac = srcIdx - floor;
            resampled[i] = processSignal[floor] * (1 - frac) + processSignal[ceil] * frac;
          }

          processSignal = resampled;
        }

        const vectorSignal = ess.arrayToVector(processSignal);
        const result = ess.RhythmExtractor2013(vectorSignal, 208, "multifeature", 40);

        const beatsVector = result.ticks;
        const beats = [];
        for (let i = 0; i < beatsVector.size(); i++) {
          beats.push(beatsVector.get(i));
        }

        const bpm = result.bpm;
        const confidence = result.confidence;

        vectorSignal.delete();
        beatsVector.delete();

        self.postMessage({ bpm, beats, confidence });
      } catch (err) {
        self.postMessage({ error: err.message || "Beat detection failed" });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

export function detectBeatsAsync(monoSignal: Float32Array, sampleRate: number): Promise<BeatResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerUrl());

    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data as BeatResult);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Worker error'));
    };

    worker.postMessage({ signal: monoSignal.buffer, sampleRate }, [monoSignal.buffer]);
  });
}
