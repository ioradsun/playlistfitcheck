import { useEffect, useRef, useState } from "react";
import { LyricDancePlayer, type LyricDanceData } from "@/engine/LyricDancePlayer";
import { withInitLimit, withPriorityInitLimit } from "@/engine/initQueue";

interface Options {
  onReady?: (player: LyricDancePlayer) => void;
  priority?: boolean;
}

export interface UseLyricDancePlayerReturn {
  player: LyricDancePlayer | null;
  playerReady: boolean;
  data: LyricDanceData | null;
  setData: React.Dispatch<React.SetStateAction<LyricDanceData | null>>;
  playerRef: React.MutableRefObject<LyricDancePlayer | null>;
  lastFrameUrl: string | null;
}

export function useLyricDancePlayer(
  initialData: LyricDanceData | null,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  textCanvasRef: React.RefObject<HTMLCanvasElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  options: Options = {},
): UseLyricDancePlayerReturn {
  const {
    onReady,
    priority = true,
  } = options;

  const [data, setData] = useState<LyricDanceData | null>(initialData);
  const [player, setPlayer] = useState<LyricDancePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef<LyricDancePlayer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const next = data;
    if (!next?.id || !next.audio_url || !canvasRef.current || !textCanvasRef.current || !containerRef.current) {
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        setPlayer(null);
      }
      return;
    }

    let cancelled = false;
    setPlayerReady(false);

    const p = new LyricDancePlayer(next, canvasRef.current, textCanvasRef.current, containerRef.current);
    playerRef.current = p;
    setPlayer(p);

    const queue = priority ? withPriorityInitLimit : withInitLimit;
    queue(() => p.init()).then(() => {
      if (cancelled) return;
      setPlayerReady(true);
      onReadyRef.current?.(p);
    }).catch(() => {
      if (cancelled) return;
      setPlayerReady(false);
    });

    return () => {
      cancelled = true;
      p.destroy();
      if (playerRef.current === p) playerRef.current = null;
      setPlayer((prev) => (prev === p ? null : prev));
      setPlayerReady(false);
    };
  }, [canvasRef, containerRef, data, priority, textCanvasRef]);

  return {
    player,
    playerReady,
    data,
    setData,
    playerRef,
    lastFrameUrl: null,
  };
}
