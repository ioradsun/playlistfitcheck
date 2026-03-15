export interface EssentiaResult {
  bpm: number;
  beats: number[];
  confidence: number;
}

const ESSENTIA_WASM_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js";
const ESSENTIA_UMD_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js";
const ESSENTIA_CORE_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js";

let workerBlobUrl: string | null = null;
let essentiaInstance: any = null;
let loadPromise: Promise<any> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(s);
  });
}

async function loadEssentiaMainThread(): Promise<any> {
  if (essentiaInstance) return essentiaInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await Promise.all([loadScript(ESSENTIA_WASM_URL), loadScript(ESSENTIA_CORE_URL)]);

    const w = window as any;
    const wasmModule = await w.EssentiaWASM();
    essentiaInstance = new w.Essentia(wasmModule);

    return essentiaInstance;
  })();

  return loadPromise;
}

async function runEssentiaMainThread(signal: Float32Array): Promise<EssentiaResult> {
  const essentia = await loadEssentiaMainThread();

  await new Promise<void>((r) => setTimeout(r, 0));

  const vectorSignal = essentia.arrayToVector(signal);
  const result = essentia.RhythmExtractor2013(vectorSignal, 208, "multifeature", 40);

  const beatsVector = result.ticks;
  const beats: number[] = [];
  for (let i = 0; i < beatsVector.size(); i++) {
    beats.push(beatsVector.get(i));
  }

  const bpm = result.bpm;
  const confidence = result.confidence;

  vectorSignal.delete();
  beatsVector.delete();

  return { bpm, beats, confidence };
}

function getWorkerUrl(): string {
  if (workerBlobUrl) return workerBlobUrl;

  const workerCode = `
    let essentia = null;
    let initPromise = null;

    async function ensureEssentia() {
      if (essentia) return essentia;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        importScripts(${JSON.stringify(ESSENTIA_UMD_URL)}, ${JSON.stringify(ESSENTIA_CORE_URL)});

        let wasmModule = self.EssentiaWASM;
        if (typeof wasmModule === 'function') {
          wasmModule = await wasmModule();
        }
        essentia = new self.Essentia(wasmModule);
        return essentia;
      })();

      return initPromise;
    }

    self.onmessage = async function (e) {
      const { signal } = e.data;
      try {
        const api = await ensureEssentia();
        const mono = new Float32Array(signal);
        const vectorSignal = api.arrayToVector(mono);
        const result = api.RhythmExtractor2013(vectorSignal, 208, 'multifeature', 40);

        const beatsVector = result.ticks;
        const beats = [];
        for (let i = 0; i < beatsVector.size(); i++) {
          beats.push(beatsVector.get(i));
        }

        const bpm = result.bpm;
        const confidence = result.confidence;

        vectorSignal.delete();
        beatsVector.delete();

        self.postMessage({ type: 'result', bpm, beats, confidence });
      } catch (err) {
        self.postMessage({ type: 'error', message: (err && err.message) || 'Essentia worker failed' });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

export function runEssentiaAsync(signal: Float32Array): Promise<EssentiaResult> {
  if (typeof Worker === 'undefined') {
    return runEssentiaMainThread(signal);
  }

  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(getWorkerUrl());
      const copy = signal.slice();

      const timeoutId = setTimeout(() => {
        worker.terminate();
        console.warn('[beat-grid] Essentia worker timed out, falling back to main thread');
        void runEssentiaMainThread(signal).then(resolve).catch(reject);
      }, 60000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();

        if (e.data.type === 'result') {
          resolve({
            bpm: e.data.bpm as number,
            beats: e.data.beats as number[],
            confidence: e.data.confidence as number,
          });
          return;
        }

        console.warn('[beat-grid] Essentia worker failed, falling back to main thread:', e.data.message);
        void runEssentiaMainThread(signal).then(resolve).catch(reject);
      };

      worker.onerror = () => {
        clearTimeout(timeoutId);
        worker.terminate();
        console.warn('[beat-grid] Essentia worker errored, falling back to main thread');
        void runEssentiaMainThread(signal).then(resolve).catch(reject);
      };

      worker.postMessage({ signal: copy.buffer }, [copy.buffer]);
    } catch {
      void runEssentiaMainThread(signal).then(resolve).catch(reject);
    }
  });
}

export function preloadEssentia(): void {
  if (typeof Worker === 'undefined') {
    void loadEssentiaMainThread();
    return;
  }

  try {
    const worker = new Worker(getWorkerUrl());
    const signal = new Float32Array(1024);

    const timeoutId = setTimeout(() => {
      worker.terminate();
    }, 15000);

    worker.onmessage = () => {
      clearTimeout(timeoutId);
      worker.terminate();
    };

    worker.onerror = () => {
      clearTimeout(timeoutId);
      worker.terminate();
    };

    worker.postMessage({ signal: signal.buffer }, [signal.buffer]);
  } catch {
    void loadEssentiaMainThread();
  }
}

export function revokeEssentiaWorker(): void {
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}
