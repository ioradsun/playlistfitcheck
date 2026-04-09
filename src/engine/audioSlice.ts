export interface AudioSliceResult {
  samples: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  durationSec: number;
}

function applyLinearFades(samples: Float32Array[], fadeSamples: number): void {
  if (fadeSamples <= 0 || samples.length === 0) return;
  const frameCount = samples[0]?.length ?? 0;
  if (frameCount <= 1) return;
  const fadeLen = Math.min(fadeSamples, Math.floor(frameCount / 2));
  if (fadeLen <= 0) return;

  for (let i = 0; i < fadeLen; i += 1) {
    const fadeInGain = i / fadeLen;
    const fadeOutGain = (fadeLen - i) / fadeLen;
    const outIdx = frameCount - fadeLen + i;

    for (const channel of samples) {
      channel[i] *= fadeInGain;
      channel[outIdx] *= fadeOutGain;
    }
  }
}

export async function sliceAudio(
  audioUrl: string,
  startSec: number,
  endSec: number,
  fadeDurationSec = 0.05,
  signal?: AbortSignal,
): Promise<AudioSliceResult> {
  const response = await fetch(audioUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (signal?.aborted) throw new DOMException("Audio slice cancelled", "AbortError");

  // OfflineAudioContext needs a non-zero length to construct.
  // We only use it for decodeAudioData — the context's own rendering is unused.
  const decodeCtx = new OfflineAudioContext(2, 44100, 44100);
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const clampedStart = Math.max(0, Math.min(startSec, audioBuffer.duration));
  const clampedEnd = Math.max(clampedStart, Math.min(endSec, audioBuffer.duration));

  const startSample = Math.floor(clampedStart * sampleRate);
  const endSample = Math.floor(clampedEnd * sampleRate);

  const samples: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch += 1) {
    samples.push(audioBuffer.getChannelData(ch).slice(startSample, endSample));
  }

  const fadeSamples = Math.floor(fadeDurationSec * sampleRate);
  applyLinearFades(samples, fadeSamples);

  return {
    samples,
    sampleRate,
    numberOfChannels,
    durationSec: clampedEnd - clampedStart,
  };
}
