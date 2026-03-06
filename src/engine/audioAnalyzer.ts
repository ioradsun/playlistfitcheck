/**
 * AudioAnalyzer — extracts hit events, energy curve, and spectral features
 * from an AudioBuffer using native Web Audio APIs + manual DSP.
 *
 * This runs ONCE after beat detection, enriching the beat grid with:
 * - Onset/hit events with strength (0-1) — for punch zoom, slam, shake
 * - Energy envelope (RMS per frame) — for continuous intensity signal
 * - Spectral centroid curve — for brightness (dark verse → bright chorus)
 * - Low-frequency energy ratio — for kick/bass detection
 *
 * All outputs are time-indexed arrays that BeatConductor can consume.
 *
 * RULES:
 * - No React. No hooks. Pure computation.
 * - Runs once, produces immutable data.
 * - All analysis at ~43fps (1024-sample hop at 44100Hz).
 */

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

/** A single detected onset/hit event */
export interface HitEvent {
  /** Time in seconds */
  time: number;
  /** Strength 0-1 (normalized against song peak) */
  strength: number;
  /** Type hint: 'transient' (snare/click), 'bass' (kick/sub), 'tonal' (chord/vocal) */
  type: 'transient' | 'bass' | 'tonal';
}

/** Per-frame audio features (one entry per analysis frame, ~43fps) */
export interface AudioFrame {
  /** Frame center time in seconds */
  time: number;
  /** RMS energy 0-1 (normalized) */
  energy: number;
  /** Spectral centroid in Hz (higher = brighter) */
  centroid: number;
  /** Normalized centroid 0-1 (0 = dark/bassy, 1 = bright/tinny) */
  brightness: number;
  /** Low-frequency energy ratio 0-1 (energy below 200Hz / total energy) */
  lowRatio: number;
  /** Spectral flux (change from previous frame, used for onset detection) */
  flux: number;
}

/** Complete audio analysis result */
export interface AudioAnalysis {
  /** Detected hit/onset events sorted by time */
  hits: HitEvent[];
  /** Per-frame audio features (~43fps) */
  frames: AudioFrame[];
  /** Analysis frame rate (frames per second) */
  frameRate: number;
  /** Song duration in seconds */
  duration: number;
  /** Peak RMS energy (for normalization) */
  peakEnergy: number;
  /** Smoothed energy envelope (one value per beat, if beats provided) */
  beatEnergies?: number[];
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const FFT_SIZE = 2048; // frequency resolution
const HOP_SIZE = 1024; // ~43 fps at 44100Hz
const SAMPLE_RATE = 44100;
const LOW_FREQ_CUTOFF = 200; // Hz — below this = "bass"
const ONSET_THRESHOLD = 0.35; // Spectral flux threshold for onset detection
const ONSET_MIN_GAP = 0.05; // Minimum seconds between onsets
const ONSET_ADAPTIVE_WINDOW = 10; // Frames for adaptive threshold

// ──────────────────────────────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────────────────────────────

/**
 * Analyze an AudioBuffer and extract hit events + audio features.
 *
 * @param buffer - The AudioBuffer to analyze (will be downmixed to mono)
 * @param beats - Optional beat timestamps for per-beat energy alignment
 * @returns Complete audio analysis
 */
export function analyzeAudio(buffer: AudioBuffer, beats?: number[]): AudioAnalysis {
  const startTime = performance.now();

  // Downmix to mono
  const mono = getMonoChannel(buffer);

  // Resample to 44100 if needed (simple approach: just use as-is if close enough)
  const sampleRate = buffer.sampleRate;
  const totalSamples = mono.length;
  const duration = totalSamples / sampleRate;

  // Compute hop in samples (adjusted for actual sample rate)
  const hop = Math.round(HOP_SIZE * (sampleRate / SAMPLE_RATE));
  const fftSize = FFT_SIZE;
  const halfFFT = fftSize / 2;

  // Pre-compute Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Frequency bin resolution
  const binHz = sampleRate / fftSize;
  const lowBinCutoff = Math.ceil(LOW_FREQ_CUTOFF / binHz);

  // Frame-by-frame analysis
  const numFrames = Math.floor((totalSamples - fftSize) / hop);
  const frames: AudioFrame[] = new Array(numFrames);
  let prevMagnitudes: Float32Array | null = null;
  let peakEnergy = 0;
  let peakFlux = 0;

  // Temporary buffers (reuse to avoid GC)
  const realBuf = new Float32Array(fftSize);
  const imagBuf = new Float32Array(fftSize);
  const magnitudes = new Float32Array(halfFFT);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hop;
    const time = (offset + fftSize / 2) / sampleRate;

    // ─── RMS Energy ───
    let rmsSum = 0;
    for (let i = 0; i < fftSize && offset + i < totalSamples; i++) {
      const s = mono[offset + i] * window[i];
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / fftSize);
    if (rms > peakEnergy) peakEnergy = rms;

    // ─── FFT (real DFT via naive O(N log N) approach) ───
    // Apply window and copy to real buffer
    for (let i = 0; i < fftSize; i++) {
      realBuf[i] = (offset + i < totalSamples) ? mono[offset + i] * window[i] : 0;
      imagBuf[i] = 0;
    }
    fftInPlace(realBuf, imagBuf, fftSize);

    // Compute magnitudes
    for (let i = 0; i < halfFFT; i++) {
      magnitudes[i] = Math.sqrt(realBuf[i] * realBuf[i] + imagBuf[i] * imagBuf[i]);
    }

    // ─── Spectral Centroid ───
    let weightedSum = 0;
    let magSum = 0;
    for (let i = 1; i < halfFFT; i++) {
      const freq = i * binHz;
      weightedSum += freq * magnitudes[i];
      magSum += magnitudes[i];
    }
    const centroid = magSum > 0 ? weightedSum / magSum : 0;

    // ─── Low-Frequency Energy Ratio ───
    let lowEnergy = 0;
    let totalEnergy = 0;
    for (let i = 0; i < halfFFT; i++) {
      const e = magnitudes[i] * magnitudes[i];
      totalEnergy += e;
      if (i < lowBinCutoff) lowEnergy += e;
    }
    const lowRatio = totalEnergy > 0 ? lowEnergy / totalEnergy : 0;

    // ─── Spectral Flux (half-wave rectified difference) ───
    let flux = 0;
    if (prevMagnitudes) {
      for (let i = 0; i < halfFFT; i++) {
        const diff = magnitudes[i] - prevMagnitudes[i];
        if (diff > 0) flux += diff;
      }
    }
    if (flux > peakFlux) peakFlux = flux;

    // Store previous magnitudes
    if (!prevMagnitudes) prevMagnitudes = new Float32Array(halfFFT);
    prevMagnitudes.set(magnitudes);

    frames[f] = {
      time,
      energy: rms,
      centroid,
      brightness: 0, // normalized after all frames
      lowRatio,
      flux,
    };
  }

  // ─── Normalize ───
  const maxCentroid = Math.max(1, ...frames.map(f => f.centroid));
  for (const frame of frames) {
    frame.energy = peakEnergy > 0 ? frame.energy / peakEnergy : 0;
    frame.brightness = maxCentroid > 0 ? Math.min(1, frame.centroid / (maxCentroid * 0.7)) : 0;
    frame.flux = peakFlux > 0 ? frame.flux / peakFlux : 0;
  }

  // ─── Onset Detection (adaptive threshold on spectral flux) ───
  const hits = detectOnsets(frames, sampleRate, lowBinCutoff, binHz);

  // ─── Per-beat energy alignment ───
  let beatEnergies: number[] | undefined;
  if (beats && beats.length > 0) {
    beatEnergies = alignEnergyToBeats(frames, beats);
  }

  const elapsed = performance.now() - startTime;

  return {
    hits,
    frames,
    frameRate: sampleRate / hop,
    duration,
    peakEnergy,
    beatEnergies,
  };
}

// ──────────────────────────────────────────────────────────────
// Onset Detection
// ──────────────────────────────────────────────────────────────

function detectOnsets(frames: AudioFrame[], sampleRate: number, lowBinCutoff: number, binHz: number): HitEvent[] {
  const hits: HitEvent[] = [];
  let lastOnsetTime = -1;

  for (let f = 1; f < frames.length; f++) {
    const frame = frames[f];

    // Adaptive threshold: mean flux in surrounding window + offset
    let localMean = 0;
    let count = 0;
    const halfWin = ONSET_ADAPTIVE_WINDOW;
    for (let j = Math.max(0, f - halfWin); j <= Math.min(frames.length - 1, f + halfWin); j++) {
      localMean += frames[j].flux;
      count++;
    }
    localMean = count > 0 ? localMean / count : 0;
    const threshold = Math.max(ONSET_THRESHOLD, localMean + 0.15);

    if (frame.flux > threshold && (frame.time - lastOnsetTime) > ONSET_MIN_GAP) {
      // Classify the hit type
      let type: HitEvent['type'] = 'transient';
      if (frame.lowRatio > 0.5) {
        type = 'bass'; // kick/sub-heavy onset
      } else if (frame.brightness > 0.6 && frame.flux < 0.6) {
        type = 'tonal'; // chord change / vocal onset
      }

      hits.push({
        time: frame.time,
        strength: Math.min(1, frame.flux),
        type,
      });

      lastOnsetTime = frame.time;
    }
  }

  return hits;
}

// ──────────────────────────────────────────────────────────────
// Beat-energy alignment
// ──────────────────────────────────────────────────────────────

function alignEnergyToBeats(frames: AudioFrame[], beats: number[]): number[] {
  const beatEnergies: number[] = new Array(beats.length);
  const frameRate = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 43;

  for (let bi = 0; bi < beats.length; bi++) {
    const beatTime = beats[bi];
    // Average energy in a small window around the beat
    const windowSec = 0.05; // 50ms window
    const startFrame = Math.max(0, Math.floor((beatTime - windowSec) * frameRate));
    const endFrame = Math.min(frames.length - 1, Math.ceil((beatTime + windowSec) * frameRate));

    let sum = 0;
    let count = 0;
    for (let f = startFrame; f <= endFrame; f++) {
      sum += frames[f].energy;
      count++;
    }
    beatEnergies[bi] = count > 0 ? sum / count : 0;
  }

  return beatEnergies;
}

// ──────────────────────────────────────────────────────────────
// Utility: mono downmix
// ──────────────────────────────────────────────────────────────

function getMonoChannel(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mono;
}

// ──────────────────────────────────────────────────────────────
// In-place FFT (Cooley-Tukey radix-2 DIT)
// ──────────────────────────────────────────────────────────────

function fftInPlace(real: Float32Array, imag: Float32Array, n: number): void {
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
    let k = n >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }

  // Butterfly stages
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size >> 1;
    const step = (2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = -step * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;
        const tReal = cos * real[oddIdx] - sin * imag[oddIdx];
        const tImag = sin * real[oddIdx] + cos * imag[oddIdx];
        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Quick energy lookup for BeatConductor
// ──────────────────────────────────────────────────────────────

// Helper functions (getEnergyAtTime, getHitStrength, getBrightnessAtTime)
// removed — BeatConductor does its own O(1) frame lookup with cursor.
