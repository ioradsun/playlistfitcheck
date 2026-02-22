import { useEffect, useRef, useState } from "react";

export function useBeatIntensity(analyserNode: AnalyserNode | null, isPlaying: boolean): number {
  const [intensity, setIntensity] = useState(0);
  const frameRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

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
      analyserNode.getByteFrequencyData(dataRef.current);
      const bassSum = dataRef.current.slice(1, 5).reduce((acc, val) => acc + val, 0);
      const bassAvg = bassSum / 4 / 255;
      setIntensity((prev) => prev * 0.7 + bassAvg * 0.3);
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
