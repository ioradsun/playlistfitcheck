import { useEffect, useRef, useState } from "react";

export function useBeatIntensity(analyserNode: AnalyserNode | null, isPlaying: boolean): number {
  const [intensity, setIntensity] = useState(0);
  const frameRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const debugFrameRef = useRef(0);

  useEffect(() => {
    if (!analyserNode || !isPlaying) {
      setIntensity(0);
      return;
    }

    analyserNode.fftSize = 256;
    const bufferLength = analyserNode.frequencyBinCount;
    dataRef.current = new Uint8Array(bufferLength);

    const tick = () => {
      if (!dataRef.current) return;
      analyserNode.getByteFrequencyData(dataRef.current as Uint8Array<ArrayBuffer>);
      const bassSum = dataRef.current.slice(1, 5).reduce((acc, val) => acc + val, 0);
      const bassAvg = bassSum / 4 / 255;
      const next = bassAvg;
      setIntensity((prev) => prev * 0.7 + next * 0.3);
      debugFrameRef.current += 1;
      if (debugFrameRef.current % 30 === 0) {
        console.log("[useBeatIntensity]", { bassAvg: Number(next.toFixed(3)), isPlaying });
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [analyserNode, isPlaying]);

  return intensity;
}
