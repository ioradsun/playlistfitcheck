/**
 * useBeatGrid — lightweight beat detection powered by AudioAnalyzer onsets.
 *
 * Pipeline: AudioAnalyzer (Web Worker) → deriveBPM (IOI histogram) → findPhase (grid scoring)
 * Runs in <1ms on the main thread after the worker returns.
 * Replaces the previous WASM beat extraction path (~105MB AudioBuffer processing, OOM-prone).
 */

import { useState, useEffect, useRef } from "react";
import { analyzeAudioAsync } from "@/engine/audioAnalyzerWorker";
import type { AudioAnalysis, HitEvent } from "@/engine/audioAnalyzer";

export interface BeatGridData {
  bpm: number;
  beats: number[];
  confidence: number;
  hits?: Array<{ time: number; strength: number; type: "transient" | "bass" | "tonal" }>;
  beatEnergies?: number[];
  _analysis?: AudioAnalysis;
  /** Runtime-only: phase offset in seconds (first downbeat position). Not serialized to DB. */
  _phase?: number;
}

// ── BPM Detection: IOI histogram with Gaussian genre prior ──────────────

const MIN_BPM = 60;
const MAX_BPM = 200;
const BPM_BINS = MAX_BPM - MIN_BPM + 1;

/**
 * Derive BPM from inter-onset intervals of rhythmically significant hits.
 * Operates on ~100-500 hit events, not raw audio. <1ms.
 */
function deriveBPM(hits: HitEvent[]): { bpm: number; confidence: number } {
  // Filter to rhythmically significant hits (kicks + strong snares)
  const rhythmic = hits.filter(
    (h) => h.type === "bass" || (h.type === "transient" && h.strength > 0.4),
  );

  if (rhythmic.length < 4) {
    return { bpm: 120, confidence: 0 };
  }

  // Collect inter-onset intervals
  const iois: number[] = [];
  for (let i = 1; i < rhythmic.length; i++) {
    const dt = rhythmic[i].time - rhythmic[i - 1].time;
    if (dt > 0.15 && dt < 2.0) iois.push(dt); // 30-400 BPM range
  }

  if (iois.length < 3) {
    return { bpm: 120, confidence: 0 };
  }

  // Histogram: each IOI votes for its BPM + half-time/double-time
  const histogram = new Float32Array(BPM_BINS);

  for (const ioi of iois) {
    const baseBpm = 60 / ioi;
    for (const mult of [0.5, 1, 2]) {
      const candidate = Math.round(baseBpm * mult);
      if (candidate >= MIN_BPM && candidate <= MAX_BPM) {
        const exactBpm = baseBpm * mult;
        const intDist = Math.abs(exactBpm - candidate);
        const weight = 1.0 - Math.min(1, intDist * 4);
        histogram[candidate - MIN_BPM] += Math.max(0, weight);
      }
    }
  }

  // Gaussian genre prior: bias toward 80-160 BPM where most music lives
  for (let i = 0; i < BPM_BINS; i++) {
    const bpm = i + MIN_BPM;
    histogram[i] *= Math.exp(-((bpm - 120) ** 2) / (40 ** 2));
  }

  // Find peak
  let bestIdx = 0;
  for (let i = 1; i < BPM_BINS; i++) {
    if (histogram[i] > histogram[bestIdx]) bestIdx = i;
  }

  const bpm = bestIdx + MIN_BPM;
  const peak = histogram[bestIdx];
  const confidence = Math.min(1, peak / (iois.length * 0.5));

  return { bpm, confidence };
}

// ── Phase Detection: score every candidate offset against all hits ───────

/**
 * Find the phase offset where bass/transient hits best align to a BPM grid.
 * Tests 32 candidates per beat period. Immune to pickup notes, artifacts,
 * and intro noise — a single stray hit can't outscore a repeating kick pattern.
 * <1ms on the hit array.
 */
function findPhase(hits: HitEvent[], bpm: number): number {
  const period = 60 / bpm;
  const steps = 32;
  const step = period / steps;
  let bestPhase = 0;
  let bestScore = -1;

  for (let p = 0; p < steps; p++) {
    const candidate = p * step;
    let score = 0;
    for (const hit of hits) {
      if (hit.type !== "bass" && hit.strength < 0.4) continue;
      const dist = ((hit.time - candidate) % period + period) % period;
      const nearestDist = Math.min(dist, period - dist);
      if (nearestDist < 0.06) {
        score += hit.strength * Math.exp(-(nearestDist * nearestDist) / 0.001);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = candidate;
    }
  }

  return bestPhase;
}

// ── Public hook ──────────────────────────────────────────────────────────

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
        // Single async step: AudioAnalyzer runs in its own Web Worker
        const analysis = await analyzeAudioAsync(buffer);
        if (cancelled) return;

        // Derive BPM + phase from onsets — <1ms on main thread
        const { bpm, confidence } = deriveBPM(analysis.hits);
        const phase = findPhase(analysis.hits, bpm);

        // Generate phase-aligned synthetic beats for energy alignment
        const period = 60 / bpm;
        const syntheticBeats: number[] = [];
        for (let t = phase; t < analysis.duration; t += period) {
          syntheticBeats.push(t);
        }

        // Align energy to synthetic beats (for BeatConductor strength blending)
        let beatEnergies: number[] | undefined;
        if (syntheticBeats.length > 0 && analysis.frames.length > 0) {
          const frameRate = analysis.frameRate;
          beatEnergies = syntheticBeats.map((beatTime) => {
            const windowSec = 0.05;
            const startFrame = Math.max(0, Math.floor((beatTime - windowSec) * frameRate));
            const endFrame = Math.min(
              analysis.frames.length - 1,
              Math.ceil((beatTime + windowSec) * frameRate),
            );
            let sum = 0;
            let cnt = 0;
            for (let f = startFrame; f <= endFrame; f++) {
              sum += analysis.frames[f].energy;
              cnt++;
            }
            return cnt > 0 ? sum / cnt : 0;
          });
        }

        if (!cancelled) {
          setBeatGrid({
            bpm: Math.round(bpm),
            beats: [],         // BeatConductor generates synthetic beats from bpm + _phase
            confidence,
            hits: analysis.hits,
            beatEnergies,
            _analysis: analysis,
            _phase: phase,
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

    return () => {
      cancelled = true;
    };
  }, [buffer]);

  return { beatGrid, loading, error };
}
