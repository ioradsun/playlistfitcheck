export const WAVEFORM_PEAK_COUNT = 200;

export interface WaveformPeaks {
  peaks: number[];
  duration: number;
}

/**
 * Extract normalized peak amplitudes from an AudioBuffer.
 * Used by pipeline, FitTab, and audio engine for waveform display.
 */
export function extractPeaks(
  buffer: AudioBuffer,
  samples: number = WAVEFORM_PEAK_COUNT,
): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.floor(channel.length / samples);
  const peaks: number[] = [];
  for (let i = 0; i < samples; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channel[start + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((p) => p / maxPeak);
}
