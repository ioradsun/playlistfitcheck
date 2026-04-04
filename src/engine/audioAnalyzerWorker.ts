/**
 * audioAnalyzerWorker — async wrapper around analyzeAudio.
 * Runs analysis off the main thread via a simple async boundary.
 */

import { analyzeAudio, type AudioAnalysis } from "@/engine/audioAnalyzer";

export async function analyzeAudioAsync(
  buffer: AudioBuffer,
  beats?: number[],
): Promise<AudioAnalysis> {
  // Yield to the event loop before heavy computation
  await new Promise((r) => setTimeout(r, 0));
  return analyzeAudio(buffer, beats);
}
