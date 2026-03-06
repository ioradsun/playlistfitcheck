/**
 * AudioAnalyzerWorker — runs analyzeAudio() in a Web Worker to avoid
 * main-thread blocking during FFT analysis.
 *
 * Usage:
 *   const result = await analyzeAudioAsync(audioBuffer, beats);
 *
 * Falls back to main-thread analysis if Workers aren't available.
 */

import { analyzeAudio, type AudioAnalysis } from './audioAnalyzer';

let workerBlobUrl: string | null = null;

/**
 * Create an inline Web Worker from the audioAnalyzer module.
 * We inline the worker code to avoid separate file bundling issues.
 */
function getWorkerUrl(): string {
  if (workerBlobUrl) return workerBlobUrl;

  // The worker script: receives Float32Array + beats, runs analysis, returns result
  const workerCode = `
    // ─── Inline audioAnalyzer (self-contained, no imports) ───

    const FFT_SIZE = 2048;
    const HOP_SIZE = 1024;
    const LOW_FREQ_CUTOFF = 200;
    const ONSET_THRESHOLD = 0.35;
    const ONSET_MIN_GAP = 0.05;
    const ONSET_ADAPTIVE_WINDOW = 10;

    function fftInPlace(real, imag, n) {
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

    function analyzeInWorker(mono, sampleRate, beats) {
      const totalSamples = mono.length;
      const duration = totalSamples / sampleRate;
      const hop = Math.round(HOP_SIZE * (sampleRate / 44100));
      const fftSize = FFT_SIZE;
      const halfFFT = fftSize / 2;

      const wind = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        wind[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      }

      const binHz = sampleRate / fftSize;
      const lowBinCutoff = Math.ceil(LOW_FREQ_CUTOFF / binHz);
      const numFrames = Math.floor((totalSamples - fftSize) / hop);
      const frames = new Array(numFrames);
      let prevMagnitudes = null;
      let peakEnergy = 0;
      let peakFlux = 0;

      const realBuf = new Float32Array(fftSize);
      const imagBuf = new Float32Array(fftSize);
      const magnitudes = new Float32Array(halfFFT);

      for (let f = 0; f < numFrames; f++) {
        const offset = f * hop;
        const time = (offset + fftSize / 2) / sampleRate;

        let rmsSum = 0;
        for (let i = 0; i < fftSize && offset + i < totalSamples; i++) {
          const s = mono[offset + i] * wind[i];
          rmsSum += s * s;
        }
        const rms = Math.sqrt(rmsSum / fftSize);
        if (rms > peakEnergy) peakEnergy = rms;

        for (let i = 0; i < fftSize; i++) {
          realBuf[i] = (offset + i < totalSamples) ? mono[offset + i] * wind[i] : 0;
          imagBuf[i] = 0;
        }
        fftInPlace(realBuf, imagBuf, fftSize);

        for (let i = 0; i < halfFFT; i++) {
          magnitudes[i] = Math.sqrt(realBuf[i] * realBuf[i] + imagBuf[i] * imagBuf[i]);
        }

        let weightedSum = 0;
        let magSum = 0;
        for (let i = 1; i < halfFFT; i++) {
          const freq = i * binHz;
          weightedSum += freq * magnitudes[i];
          magSum += magnitudes[i];
        }
        const centroid = magSum > 0 ? weightedSum / magSum : 0;

        let lowEnergy = 0;
        let totalEnergy = 0;
        for (let i = 0; i < halfFFT; i++) {
          const e = magnitudes[i] * magnitudes[i];
          totalEnergy += e;
          if (i < lowBinCutoff) lowEnergy += e;
        }
        const lowRatio = totalEnergy > 0 ? lowEnergy / totalEnergy : 0;

        let flux = 0;
        if (prevMagnitudes) {
          for (let i = 0; i < halfFFT; i++) {
            const diff = magnitudes[i] - prevMagnitudes[i];
            if (diff > 0) flux += diff;
          }
        }
        if (flux > peakFlux) peakFlux = flux;

        if (!prevMagnitudes) prevMagnitudes = new Float32Array(halfFFT);
        prevMagnitudes.set(magnitudes);

        frames[f] = { time, energy: rms, centroid, brightness: 0, lowRatio, flux };
      }

      const maxCentroid = Math.max(1, ...frames.map(f => f.centroid));
      for (const frame of frames) {
        frame.energy = peakEnergy > 0 ? frame.energy / peakEnergy : 0;
        frame.brightness = maxCentroid > 0 ? Math.min(1, frame.centroid / (maxCentroid * 0.7)) : 0;
        frame.flux = peakFlux > 0 ? frame.flux / peakFlux : 0;
      }

      // Onset detection
      const hits = [];
      let lastOnsetTime = -1;
      for (let f = 1; f < frames.length; f++) {
        const frame = frames[f];
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
          let type = 'transient';
          if (frame.lowRatio > 0.5) type = 'bass';
          else if (frame.brightness > 0.6 && frame.flux < 0.6) type = 'tonal';
          hits.push({ time: frame.time, strength: Math.min(1, frame.flux), type });
          lastOnsetTime = frame.time;
        }
      }

      // Beat energy alignment
      let beatEnergies;
      if (beats && beats.length > 0) {
        const frameRate = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 43;
        beatEnergies = new Array(beats.length);
        for (let bi = 0; bi < beats.length; bi++) {
          const beatTime = beats[bi];
          const windowSec = 0.05;
          const startFrame = Math.max(0, Math.floor((beatTime - windowSec) * frameRate));
          const endFrame = Math.min(frames.length - 1, Math.ceil((beatTime + windowSec) * frameRate));
          let sum = 0;
          let cnt = 0;
          for (let ff = startFrame; ff <= endFrame; ff++) { sum += frames[ff].energy; cnt++; }
          beatEnergies[bi] = cnt > 0 ? sum / cnt : 0;
        }
      }

      return {
        hits,
        frames,
        frameRate: sampleRate / hop,
        duration,
        peakEnergy,
        beatEnergies,
      };
    }

    self.onmessage = function(e) {
      const { mono, sampleRate, beats } = e.data;
      try {
        const result = analyzeInWorker(new Float32Array(mono), sampleRate, beats);
        self.postMessage({ type: 'result', data: result });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message || 'Analysis failed' });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

/**
 * Run audio analysis in a Web Worker (non-blocking).
 * Falls back to main-thread analysis if Workers aren't available.
 */
export function analyzeAudioAsync(
  buffer: AudioBuffer,
  beats?: number[]
): Promise<AudioAnalysis> {
  // Fallback: no Worker support
  if (typeof Worker === 'undefined') {
    // No Worker support, running on main thread
    return Promise.resolve(analyzeAudio(buffer, beats));
  }

  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(getWorkerUrl());

      // Get mono channel data to transfer
      let mono: Float32Array;
      if (buffer.numberOfChannels === 1) {
        mono = buffer.getChannelData(0).slice(); // copy for transfer
      } else {
        const ch0 = buffer.getChannelData(0);
        const ch1 = buffer.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) {
          mono[i] = (ch0[i] + ch1[i]) * 0.5;
        }
      }

      const timeoutId = setTimeout(() => {
        worker.terminate();
        // Worker timed out, falling back to main thread
        resolve(analyzeAudio(buffer, beats));
      }, 30000); // 30s timeout

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        if (e.data.type === 'result') {
          resolve(e.data.data as AudioAnalysis);
        } else {
          reject(new Error(e.data.message));
        }
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        // Worker error, falling back to main thread
        resolve(analyzeAudio(buffer, beats));
      };

      // Transfer the buffer (zero-copy)
      worker.postMessage(
        { mono: mono.buffer, sampleRate: buffer.sampleRate, beats: beats ?? [] },
        [mono.buffer]
      );
    } catch (err) {
      console.warn('[audio-analyzer] Worker creation failed, falling back:', err);
      resolve(analyzeAudio(buffer, beats));
    }
  });
}

/**
 * Revoke the cached worker blob URL to prevent memory leak.
 * Call this when the player is destroyed.
 */
export function revokeAnalyzerWorker(): void {
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}
