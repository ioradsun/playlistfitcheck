/**
 * Compress audio files client-side by decoding to AudioBuffer
 * and re-encoding as mono 16 kHz WebM/Opus (with WAV fallback).
 *
 * WebM/Opus at 32 kbps produces ~720 KB for a 3-min song vs ~5.6 MB WAV.
 * Uses the native WebCodecs AudioEncoder (Chrome 94+) for non-realtime
 * encoding, falling back to WAV for unsupported browsers.
 */

import { Muxer, ArrayBufferTarget } from "webm-muxer";

const TARGET_SAMPLE_RATE = 16000;
const OPUS_BITRATE = 32_000; // 32 kbps — gold standard for voice clarity
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB hard cap

/* ------------------------------------------------------------------ */
/*  Encoders                                                          */
/* ------------------------------------------------------------------ */

/** Encode Float32 mono samples into a WebM/Opus blob via WebCodecs. */
async function encodeWebmOpus(
  samples: Float32Array,
  sampleRate: number
): Promise<Blob> {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    audio: {
      codec: "A_OPUS",
      sampleRate,
      numberOfChannels: 1,
    },
  });

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      muxer.addAudioChunk(chunk, meta);
    },
    error: (e) => {
      throw new Error(`AudioEncoder error: ${e.message}`);
    },
  });

  encoder.configure({
    codec: "opus",
    sampleRate,
    numberOfChannels: 1,
    bitrate: OPUS_BITRATE,
  });

  // Feed the entire buffer as a single AudioData frame
  const audioData = new AudioData({
    format: "f32-planar",
    sampleRate,
    numberOfFrames: samples.length,
    numberOfChannels: 1,
    timestamp: 0,
    data: samples.buffer as ArrayBuffer,
  });

  encoder.encode(audioData);
  await encoder.flush();
  encoder.close();
  audioData.close();

  muxer.finalize();
  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  return new Blob([buffer], { type: "audio/webm" });
}

/** Fallback: encode as raw 16-bit PCM WAV. */
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

/* ------------------------------------------------------------------ */
/*  Detection                                                         */
/* ------------------------------------------------------------------ */

/** Check if the browser supports WebCodecs AudioEncoder with Opus. */
function supportsWebmOpus(): boolean {
  return typeof globalThis.AudioEncoder !== "undefined" && typeof globalThis.AudioData !== "undefined";
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compress an audio File to a smaller mono file.
 * Prefers WebM/Opus when available, falls back to WAV.
 * Throws if result is still too large.
 */
export async function compressAudioFile(
  file: File,
  thresholdBytes = MAX_UPLOAD_BYTES
): Promise<File> {
  // Skip compression for small files
  if (file.size <= thresholdBytes) return file;

  const useOpus = supportsWebmOpus();
  console.log(
    `[compressAudio] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) → ${useOpus ? "WebM/Opus 32kbps" : "WAV"} @ ${TARGET_SAMPLE_RATE}Hz`
  );

  const audioCtx = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    console.log(
      `[compressAudio] Decoded: ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.numberOfChannels}ch, ${audioBuffer.sampleRate}Hz`
    );

    // Render to mono at target sample rate
    const length = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
    const offlineCtx = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const monoSamples = rendered.getChannelData(0);

    let blob: Blob;
    let ext: string;

    if (useOpus) {
      try {
        blob = await encodeWebmOpus(monoSamples, TARGET_SAMPLE_RATE);
        ext = "webm";
      } catch (e) {
        console.warn("[compressAudio] WebM/Opus failed, falling back to WAV:", e);
        blob = encodeWav(monoSamples, TARGET_SAMPLE_RATE);
        ext = "wav";
      }
    } else {
      blob = encodeWav(monoSamples, TARGET_SAMPLE_RATE);
      ext = "wav";
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const mimeType = ext === "webm" ? "audio/webm" : "audio/wav";
    const compressed = new File([blob], `${baseName}_compressed.${ext}`, { type: mimeType });

    console.log(`[compressAudio] Result: ${(compressed.size / 1024 / 1024).toFixed(2)} MB (${ext})`);

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
