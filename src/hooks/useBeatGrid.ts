import { useState, useEffect, useRef } from "react";

export interface BeatGridData {
  bpm: number;
  beats: number[]; // beat positions in seconds
  confidence: number;
}

// CDN URLs for essentia.js
const ESSENTIA_WASM_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js";
const ESSENTIA_CORE_URL = "https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js";

let essentiaInstance: any = null;
let loadPromise: Promise<any> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
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

async function loadEssentia(): Promise<any> {
  if (essentiaInstance) return essentiaInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Load WASM module first, then core
    await loadScript(ESSENTIA_WASM_URL);
    await loadScript(ESSENTIA_CORE_URL);

    const w = window as any;
    // EssentiaWASM is a factory that returns a promise
    const wasmModule = await w.EssentiaWASM();
    essentiaInstance = new w.Essentia(wasmModule);
    console.log("[beat-grid] Essentia.js loaded, version:", essentiaInstance.version);
    return essentiaInstance;
  })();

  return loadPromise;
}

function getMonoChannel(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) / 2;
  }
  return mono;
}

/**
 * Hook that runs Essentia.js RhythmExtractor2013 on an AudioBuffer
 * to detect beat positions and BPM.
 * Loads Essentia WASM from CDN on first use (~2MB).
 */
export function useBeatGrid(buffer: AudioBuffer | null): {
  beatGrid: BeatGridData | null;
  loading: boolean;
  error: string | null;
} {
  const [beatGrid, setBeatGrid] = useState<BeatGridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzedRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    if (!buffer || buffer === analyzedRef.current) return;
    analyzedRef.current = buffer;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const essentia = await loadEssentia();
        const monoData = getMonoChannel(buffer);

        // Resample to 44100 if needed
        let signal: Float32Array;
        if (buffer.sampleRate !== 44100) {
          const offlineCtx = new OfflineAudioContext(1, Math.ceil(buffer.duration * 44100), 44100);
          const src = offlineCtx.createBufferSource();
          src.buffer = buffer;
          src.connect(offlineCtx.destination);
          src.start();
          const resampled = await offlineCtx.startRendering();
          signal = resampled.getChannelData(0);
        } else {
          signal = monoData;
        }

        const vectorSignal = essentia.arrayToVector(signal);
        const result = essentia.RhythmExtractor2013(vectorSignal, 208, "multifeature", 40);

        // Extract beat positions
        const beatsVector = result.ticks;
        const beats: number[] = [];
        for (let i = 0; i < beatsVector.size(); i++) {
          beats.push(beatsVector.get(i));
        }

        const bpm = result.bpm;
        const confidence = result.confidence;

        // Clean up WASM vectors
        vectorSignal.delete();
        beatsVector.delete();

        if (!cancelled) {
          setBeatGrid({ bpm: Math.round(bpm), beats, confidence });
          setLoading(false);
          console.log(`[beat-grid] ${beats.length} beats, BPM: ${Math.round(bpm)}, conf: ${confidence.toFixed(2)}`);
        }
      } catch (err: any) {
        console.error("[beat-grid] Analysis failed:", err);
        if (!cancelled) {
          setError(err.message || "Beat detection failed");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [buffer]);

  return { beatGrid, loading, error };
}
