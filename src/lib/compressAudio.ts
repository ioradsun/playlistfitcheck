/**
 * Compress audio files client-side by decoding to AudioBuffer
 * and re-encoding as mono 22050 Hz WAV.
 * This reduces 40-60 MB WAV/M4A files to ~5-15 MB.
 */

const TARGET_SAMPLE_RATE = 22050;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Compress an audio File to a smaller mono WAV.
 * Returns the original file if it's already small enough or compression fails.
 */
export async function compressAudioFile(
  file: File,
  thresholdBytes = 20 * 1024 * 1024
): Promise<File> {
  // Skip compression for small files
  if (file.size <= thresholdBytes) return file;

  try {
    const ctx = new OfflineAudioContext(1, 1, TARGET_SAMPLE_RATE);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Mix down to mono
    const numChannels = audioBuffer.numberOfChannels;
    const length = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
    const offlineCtx = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const monoSamples = rendered.getChannelData(0);

    const wavBlob = encodeWav(monoSamples, TARGET_SAMPLE_RATE);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([wavBlob], `${baseName}_compressed.wav`, { type: "audio/wav" });
  } catch (e) {
    console.warn("Audio compression failed, using original file:", e);
    return file;
  }
}
