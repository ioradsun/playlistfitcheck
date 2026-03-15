import { useState, useEffect, useRef } from "react";
import { analyzeAudioAsync } from "@/engine/audioAnalyzerWorker";
import { runEssentiaAsync, preloadEssentia as preloadEssentiaWorker } from "@/engine/essentiaWorker";
import type { AudioAnalysis } from "@/engine/audioAnalyzer";

export interface BeatGridData {
  bpm: number;
  beats: number[]; // beat positions in seconds
  confidence: number;
  /** V2: Onset/hit events with strength */
  hits?: Array<{ time: number; strength: number; type: 'transient' | 'bass' | 'tonal' }>;
  /** V2: Per-beat energy aligned to beat positions */
  beatEnergies?: number[];
  /** V2: Full audio analysis (runtime only, not serialized) */
  _analysis?: AudioAnalysis;
}

/** Preload Essentia WASM + Core so beat detection starts instantly when audio arrives. */
export function preloadEssentia(): void {
  preloadEssentiaWorker();
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
 * Hook that runs Essentia.js RhythmExtractor2013 + AudioAnalyzer on an AudioBuffer
 * to detect beat positions, BPM, hit events, energy curve, and spectral features.
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
          if (cancelled) return;
          signal = resampled.getChannelData(0);
        } else {
          signal = monoData;
        }

        // ═══ Step 1: Essentia beat detection ═══
        const { bpm, beats, confidence } = await runEssentiaAsync(signal);
        if (cancelled) return;

        // ═══ Step 2: Audio analysis (onsets, energy, brightness) ═══
        let analysis: AudioAnalysis | undefined;
        let hits: BeatGridData['hits'];
        let beatEnergies: number[] | undefined;

        try {
          analysis = await analyzeAudioAsync(buffer, beats);
          hits = analysis.hits;
          beatEnergies = analysis.beatEnergies;
        } catch (analysisErr) {
          // Audio analysis failed (non-fatal)
        }

        if (!cancelled) {
          setBeatGrid({
            bpm: Math.round(bpm),
            beats,
            confidence,
            hits,
            beatEnergies,
            _analysis: analysis,
          });
          setLoading(false);
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
