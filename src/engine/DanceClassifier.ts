/**
 * DanceClassifier — determines what kind of dance a song calls for.
 *
 * Runs ONCE at song load time. Produces a single DancePattern enum that
 * MotionGrammar.ts uses to pick the correct shape function for word motion.
 *
 * Classification is a decision tree on existing audio features:
 *   - BPM (from BeatGrid)
 *   - Average energy (from AudioAnalysis frames or beatEnergies)
 *   - Average low-frequency ratio (bass-heaviness)
 *   - Beat strength variance (steady vs. syncopated)
 *   - Average brightness (dark vs. bright spectral character)
 *
 * All inputs are already computed by audioAnalyzer.ts and BeatConductor.ts.
 * No new audio analysis. No AI calls. ~200μs to run.
 *
 * RULES:
 * - No React. No hooks. No side effects.
 * - Pure function: same input, same output.
 * - No imports from components.
 */

import type { BeatGrid } from '@/engine/BeatConductor';
import type { AudioAnalysis } from '@/engine/audioAnalyzer';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

/**
 * The six fundamental dance patterns.
 *
 * bounce  — Hip-hop/pop bounce. Fast drop on beat, parabolic return.
 * groove  — Syncopated R&B/funk. Asymmetric Y, backbeat emphasis.
 * sway    — Ballad/slow jam. Lateral X pendulum over 2-bar window.
 * slam    — Trap/heavy EDM. Sawtooth Y, gravity dominant.
 * pulse   — Four-on-the-floor EDM/house. Scale breathing, minimal translation.
 * drift   — Ambient/spoken word. Slow Lissajous, beats gently nudge.
 */
export type DancePattern = 'bounce' | 'groove' | 'sway' | 'slam' | 'pulse' | 'drift';

/**
 * Full classification result with the derived features for debugging/tuning.
 */
export interface DanceClassification {
  pattern: DancePattern;
  /** Features used for classification (for debug HUD) */
  features: {
    bpm: number;
    avgEnergy: number;
    avgLowRatio: number;
    beatStrengthVariance: number;
    avgBrightness: number;
    energyVariance: number;
  };
  /** Confidence 0-1 — how clearly the song fits one pattern vs. borderline */
  confidence: number;
}

// ──────────────────────────────────────────────────────────────
// Feature extraction
// ──────────────────────────────────────────────────────────────

interface Features {
  bpm: number;
  avgEnergy: number;
  avgLowRatio: number;
  beatStrengthVariance: number;
  avgBrightness: number;
  energyVariance: number;
}

function extractFeatures(beatGrid: BeatGrid, analysis: AudioAnalysis | null): Features {
  const bpm = Math.max(30, beatGrid.bpm ?? 120);

  // From AudioAnalysis frames (preferred — full spectral data)
  if (analysis && analysis.frames.length > 0) {
    const frames = analysis.frames;
    const n = frames.length;

    let sumEnergy = 0;
    let sumLowRatio = 0;
    let sumBrightness = 0;
    for (let i = 0; i < n; i++) {
      sumEnergy += frames[i].energy;
      sumLowRatio += frames[i].lowRatio;
      sumBrightness += frames[i].brightness;
    }
    const avgEnergy = sumEnergy / n;
    const avgLowRatio = sumLowRatio / n;
    const avgBrightness = sumBrightness / n;

    // Energy variance
    let sumSqEnergy = 0;
    for (let i = 0; i < n; i++) {
      const d = frames[i].energy - avgEnergy;
      sumSqEnergy += d * d;
    }
    const energyVariance = Math.sqrt(sumSqEnergy / n);

    // Beat strength variance (from beatEnergies if available)
    let beatStrengthVariance = 0;
    const be = beatGrid.beatEnergies;
    if (be && be.length > 1) {
      let sumBE = 0;
      for (let i = 0; i < be.length; i++) sumBE += be[i];
      const meanBE = sumBE / be.length;
      let sumSqBE = 0;
      for (let i = 0; i < be.length; i++) {
        const d = be[i] - meanBE;
        sumSqBE += d * d;
      }
      beatStrengthVariance = Math.sqrt(sumSqBE / be.length);
    }

    return { bpm, avgEnergy, avgLowRatio, beatStrengthVariance, avgBrightness, energyVariance };
  }

  // Fallback: no AudioAnalysis (DB playback without runtime analysis).
  // Use beatEnergies if available, otherwise return neutral defaults.
  const be = beatGrid.beatEnergies;
  if (be && be.length > 1) {
    let sumBE = 0;
    for (let i = 0; i < be.length; i++) sumBE += be[i];
    const avgEnergy = sumBE / be.length;

    let sumSqBE = 0;
    for (let i = 0; i < be.length; i++) {
      const d = be[i] - avgEnergy;
      sumSqBE += d * d;
    }
    const beatStrengthVariance = Math.sqrt(sumSqBE / be.length);

    return {
      bpm,
      avgEnergy,
      avgLowRatio: 0.3, // assume moderate bass without spectral data
      beatStrengthVariance,
      avgBrightness: 0.5,
      energyVariance: beatStrengthVariance, // best proxy
    };
  }

  // No audio data at all — classify from BPM alone
  return {
    bpm,
    avgEnergy: 0.5,
    avgLowRatio: 0.3,
    beatStrengthVariance: 0.1,
    avgBrightness: 0.5,
    energyVariance: 0.15,
  };
}

// ──────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────

/**
 * Classify a song into a DancePattern.
 *
 * Decision tree priority (evaluated top to bottom, first match wins):
 *
 * 1. drift   — very slow OR very quiet+dark (ambient, spoken word)
 * 2. slam    — fast + high energy + bass-heavy (trap, heavy EDM)
 * 3. groove  — uneven beat strengths + bass + slower (R&B, funk, neo-soul)
 * 4. pulse   — steady beats + high energy + mid-fast (house, 4-on-the-floor)
 * 5. sway    — slow + soft + dark (ballads, slow jams)
 * 6. bounce  — everything else (default — hip-hop/pop bounce)
 */
export function classifyDance(beatGrid: BeatGrid, analysis: AudioAnalysis | null = null): DanceClassification {
  const f = extractFeatures(beatGrid, analysis);
  let pattern: DancePattern;
  let confidence = 0.7; // default moderate confidence

  // 1. DRIFT — very slow or very quiet+dark
  if (f.bpm < 75 || (f.avgEnergy < 0.25 && f.avgBrightness < 0.35)) {
    pattern = 'drift';
    confidence = f.bpm < 65 ? 0.9 : f.avgEnergy < 0.2 ? 0.85 : 0.7;
  }
  // 2. SLAM — fast + high energy + bass-dominant
  else if (f.bpm > 130 && f.avgEnergy > 0.55 && f.avgLowRatio > 0.3) {
    pattern = 'slam';
    confidence = f.avgEnergy > 0.7 ? 0.9 : 0.75;
  }
  // 3. GROOVE — syncopated (high beat variance) + bass + moderate tempo
  else if (f.beatStrengthVariance > 0.15 && f.avgLowRatio > 0.28 && f.bpm >= 75 && f.bpm <= 125) {
    pattern = 'groove';
    confidence = f.beatStrengthVariance > 0.2 ? 0.85 : 0.7;
  }
  // 4. PULSE — steady beats (low variance) + high energy + mid-fast
  else if (f.beatStrengthVariance < 0.1 && f.avgEnergy > 0.45 && f.bpm >= 115 && f.bpm <= 140) {
    pattern = 'pulse';
    confidence = f.beatStrengthVariance < 0.07 ? 0.85 : 0.7;
  }
  // 5. SWAY — slow + soft + darker spectral character
  else if (f.bpm <= 100 && f.avgEnergy < 0.45 && f.avgBrightness < 0.5) {
    pattern = 'sway';
    confidence = f.avgEnergy < 0.35 ? 0.85 : 0.7;
  }
  // 6. BOUNCE — default (covers hip-hop, pop, melodic rap)
  else {
    pattern = 'bounce';
    // Higher confidence when clearly in the bounce sweet spot
    confidence = (f.bpm >= 90 && f.bpm <= 140 && f.avgLowRatio > 0.3) ? 0.85 : 0.65;
  }

  return {
    pattern,
    features: f,
    confidence,
  };
}

/**
 * Override a song-level pattern for a specific section.
 *
 * Uses section role + energy to pick a more appropriate pattern.
 * Called per-section when section boundaries are known.
 */
export function classifySection(
  songPattern: DancePattern,
  sectionRole: string,
  sectionAvgEnergy: number,
  bpm: number,
): DancePattern {
  // Drops and choruses intensify the song pattern
  if (sectionRole === 'drop' && bpm > 120) {
    return sectionAvgEnergy > 0.6 ? 'slam' : 'pulse';
  }
  if (sectionRole === 'chorus' && sectionAvgEnergy > 0.5) {
    // Chorus keeps song pattern but if it was drift/sway, upgrade to bounce
    if (songPattern === 'drift' || songPattern === 'sway') return 'bounce';
    return songPattern;
  }
  // Verses in high-energy songs might sway
  if (sectionRole === 'verse' && sectionAvgEnergy < 0.35) {
    if (songPattern === 'bounce' || songPattern === 'slam') return 'sway';
    return songPattern;
  }
  // Breakdowns go to drift
  if (sectionRole === 'breakdown') return 'drift';
  // Bridges tend to sway
  if (sectionRole === 'bridge' && sectionAvgEnergy < 0.45) return 'sway';
  // Default: keep song pattern
  return songPattern;
}
