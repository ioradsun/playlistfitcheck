export interface EssentiaResult {
  bpm: number;
  beats: number[];
  confidence: number;
}

const ESSENTIA_WASM_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js";
const ESSENTIA_UMD_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.umd.js";
const ESSENTIA_CORE_WORKER_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.umd.js";
const ESSENTIA_CORE_MAIN_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js";

let workerBlobUrl: string | null = null;
let essentiaInstance: any = null;
let loadPromise: Promise<any> | null = null;

// ── Persistent worker singleton ──────────────────────────────────────────────
let persistentWorker: Worker | null = null;
let workerReady = false;
let workerInitPromise: Promise<void> | null = null;
let pendingResolve: ((result: EssentiaResult) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

function getWorkerCode(): string {
  return `
    let essentia = null;
    let initPromise = null;

    async function ensureEssentia() {
      if (essentia) return essentia;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        importScripts(${JSON.stringify(ESSENTIA_UMD_URL)}, ${JSON.stringify(ESSENTIA_CORE_WORKER_URL)});

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
      if (e.data.type === 'warmup') {
        try {
          await ensureEssentia();
          self.postMessage({ type: 'ready' });
        } catch (err) {
          self.postMessage({ type: 'error', message: (err && err.message) || 'Warmup failed' });
        }
        return;
      }

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
}

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([getWorkerCode()], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

function ensurePersistentWorker(): Promise<void> {
  if (workerReady && persistentWorker) return Promise.resolve();
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = new Promise<void>((resolve, reject) => {
    try {
      const worker = new Worker(getWorkerBlobUrl());

      const initTimeout = setTimeout(() => {
        // Warmup timed out — worker is probably broken
        worker.terminate();
        persistentWorker = null;
        workerInitPromise = null;
        reject(new Error('Essentia worker warmup timed out'));
      }, 30000);

      worker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(initTimeout);
          persistentWorker = worker;
          workerReady = true;

          // Re-wire onmessage for analysis results
          worker.onmessage = handleWorkerMessage;
          worker.onerror = handleWorkerError;
          resolve();
          return;
        }
        if (e.data.type === 'error') {
          clearTimeout(initTimeout);
          worker.terminate();
          persistentWorker = null;
          workerInitPromise = null;
          reject(new Error(e.data.message || 'Essentia worker init failed'));
          return;
        }
      };

      worker.onerror = () => {
        clearTimeout(initTimeout);
        worker.terminate();
        persistentWorker = null;
        workerInitPromise = null;
        reject(new Error('Essentia worker errored during init'));
      };

      // Trigger WASM download + init
      worker.postMessage({ type: 'warmup' });
    } catch (err) {
      workerInitPromise = null;
      reject(err);
    }
  });

  return workerInitPromise;
}

function handleWorkerMessage(e: MessageEvent): void {
  if (e.data.type === 'result' && pendingResolve) {
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingReject = null;
    resolve({ bpm: e.data.bpm, beats: e.data.beats, confidence: e.data.confidence });
  } else if (e.data.type === 'error' && pendingReject) {
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
    const reject = pendingReject;
    pendingResolve = null;
    pendingReject = null;
    reject(new Error(e.data.message || 'Essentia analysis failed'));
  }
}

function handleWorkerError(): void {
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  // Worker is dead — reset state so next call creates a new one
  persistentWorker = null;
  workerReady = false;
  workerInitPromise = null;
  reject?.(new Error('Essentia worker crashed'));
}

// ── Main thread fallback ─────────────────────────────────────────────────────

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
    await Promise.all([loadScript(ESSENTIA_WASM_URL), loadScript(ESSENTIA_CORE_MAIN_URL)]);

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

// ── Public API ───────────────────────────────────────────────────────────────

export function runEssentiaAsync(signal: Float32Array): Promise<EssentiaResult> {
  if (typeof Worker === 'undefined') {
    return runEssentiaMainThread(signal);
  }

  return (async () => {
    try {
      await ensurePersistentWorker();
    } catch {
      // Worker init failed — fall back to main thread
      console.warn('[beat-grid] Persistent worker failed, falling back to main thread');
      return runEssentiaMainThread(signal);
    }

    if (!persistentWorker) {
      return runEssentiaMainThread(signal);
    }

    return new Promise<EssentiaResult>((resolve, reject) => {
      // Only one analysis at a time — reject if busy
      if (pendingResolve) {
        reject(new Error('Essentia worker busy'));
        return;
      }

      pendingResolve = resolve;
      pendingReject = reject;

      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        const rej = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        // Worker is stuck — kill and recreate on next call
        persistentWorker?.terminate();
        persistentWorker = null;
        workerReady = false;
        workerInitPromise = null;
        console.warn('[beat-grid] Essentia worker timed out, falling back to main thread');
        void runEssentiaMainThread(signal).then(resolve).catch(r => rej?.(r));
      }, 60000);

      const copy = signal.slice();
      persistentWorker!.postMessage({ signal: copy.buffer }, [copy.buffer]);
    });
  })();
}

export function preloadEssentia(): void {
  if (typeof Worker === 'undefined') {
    void loadEssentiaMainThread();
    return;
  }

  // Warm up the persistent worker — downloads WASM + initializes
  void ensurePersistentWorker().catch(() => {
    // Warmup failed — will retry on first actual analysis call
  });
}

export function revokeEssentiaWorker(): void {
  if (persistentWorker) {
    persistentWorker.terminate();
    persistentWorker = null;
    workerReady = false;
    workerInitPromise = null;
  }
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}
