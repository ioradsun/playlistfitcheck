/**
 * Compress audio files client-side by decoding to AudioBuffer
 * and re-encoding as mono 22050 Hz WAV.
 * This reduces 40-60 MB WAV/M4A files to ~5-15 MB.
 */

const TARGET_SAMPLE_RATE = 22050;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB hard cap for edge function safety

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
 * Throws if compression fails or result is still too large.
 */
export async function compressAudioFile(
  file: File,
  thresholdBytes = MAX_UPLOAD_BYTES
): Promise<File> {
  // Skip compression for small files
  if (file.size <= thresholdBytes) return file;

  console.log(`[compressAudio] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);

  // Use standard AudioContext for decoding (OfflineAudioContext(1,1,rate) can't decode properly)
  const audioCtx = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    console.log(`[compressAudio] Decoded: ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch, ${audioBuffer.sampleRate}Hz`);

    // Render to mono at target sample rate
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
    const compressed = new File([wavBlob], `${baseName}_compressed.wav`, { type: "audio/wav" });

    console.log(`[compressAudio] Result: ${(compressed.size / 1024 / 1024).toFixed(1)} MB`);

    // Safety check: if still too large, throw
    if (compressed.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `File is too long — compressed to ${(compressed.size / 1024 / 1024).toFixed(0)} MB but max is ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB. Try a shorter clip.`
      );
    }

    return compressed;
  } finally {
    await audioCtx.close();
  }
}
