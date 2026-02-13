import { useRef, useCallback, useState } from "react";

export interface WaveformData {
  peaks: number[];
  duration: number;
}

export interface AudioMix {
  id: string;
  name: string;
  buffer: AudioBuffer;
  waveform: WaveformData;
  rank: number | null;
  comments: string;
}

const PEAK_SAMPLES = 200;

function extractPeaks(buffer: AudioBuffer, samples: number): number[] {
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
  // Normalize
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((p) => p / maxPeak);
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  const decodeFile = useCallback(
    async (file: File): Promise<{ buffer: AudioBuffer; waveform: WaveformData }> => {
      const ctx = getCtx();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      const peaks = extractPeaks(buffer, PEAK_SAMPLES);
      return { buffer, waveform: { peaks, duration: buffer.duration } };
    },
    [getCtx]
  );

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const play = useCallback(
    (id: string, buffer: AudioBuffer, startTime: number, endTime: number) => {
      stop();
      const ctx = getCtx();
      if (ctx.state === "suspended") ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const offset = Math.max(0, startTime);
      const duration = Math.max(0.1, endTime - startTime);
      source.start(0, offset, duration);
      sourceRef.current = source;
      setPlayingId(id);

      // Auto-stop when done
      stopTimerRef.current = window.setTimeout(() => {
        setPlayingId(null);
        sourceRef.current = null;
      }, duration * 1000);

      source.onended = () => {
        if (sourceRef.current === source) {
          setPlayingId(null);
          sourceRef.current = null;
        }
      };
    },
    [getCtx, stop]
  );

  return { decodeFile, play, stop, playingId };
}
