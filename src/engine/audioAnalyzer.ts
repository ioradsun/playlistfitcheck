/**
 * AudioAnalyzer — frame-level audio feature extraction.
 */

export interface AudioFrame {
  time: number;
  energy: number;
  brightness: number;
  lowRatio: number;
}

export interface AudioHit {
  time: number;
  strength: number;
  type: 'transient' | 'bass' | 'tonal';
}

export interface AudioAnalysis {
  frames: AudioFrame[];
  frameRate: number;
  hits: AudioHit[];
  beatEnergies?: number[];
}

/**
 * Analyze an AudioBuffer and return frame-level features + onset hits.
 * Optionally align beat energies to provided beat positions.
 */
export function analyzeAudio(
  buffer: AudioBuffer,
  beats?: number[],
): AudioAnalysis {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
  const hopSize = Math.floor(frameSize / 2);
  const frameRate = sampleRate / hopSize;
  const frames: AudioFrame[] = [];
  const hits: AudioHit[] = [];

  for (let offset = 0; offset + frameSize <= channelData.length; offset += hopSize) {
    let energy = 0;
    let lowEnergy = 0;
    let highEnergy = 0;
    const cutoff = Math.floor(frameSize * 0.15);

    for (let i = 0; i < frameSize; i++) {
      const sample = channelData[offset + i];
      const sq = sample * sample;
      energy += sq;
      if (i < cutoff) lowEnergy += sq;
      else highEnergy += sq;
    }

    energy /= frameSize;
    const totalBand = lowEnergy + highEnergy || 1;
    const lowRatio = lowEnergy / totalBand;
    const brightness = highEnergy / totalBand;
    const time = offset / sampleRate;

    frames.push({ time, energy, brightness, lowRatio });
  }

  // Simple onset detection via energy delta
  for (let i = 2; i < frames.length; i++) {
    const delta = frames[i].energy - frames[i - 2].energy;
    if (delta > 0.01) {
      const strength = Math.min(1, delta * 10);
      const type: AudioHit['type'] =
        frames[i].lowRatio > 0.6 ? 'bass' :
        frames[i].brightness > 0.6 ? 'transient' : 'tonal';
      hits.push({ time: frames[i].time, strength, type });
    }
  }

  // Align beat energies
  let beatEnergies: number[] | undefined;
  if (beats && beats.length > 0 && frames.length > 0) {
    beatEnergies = beats.map((beatTime) => {
      const frameIdx = Math.min(frames.length - 1, Math.max(0, Math.round(beatTime * frameRate)));
      return frames[frameIdx].energy;
    });
  }

  return { frames, frameRate, hits, beatEnergies };
}
