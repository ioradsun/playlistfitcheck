import { useRef, useCallback } from "react";

interface Props {
  onSeekBack: () => void;
  onSeekForward: () => void;
  onTogglePlayPause: () => void;
  children?: React.ReactNode;
}

/**
 * Instagram-style tap zones. Active only AFTER the cover dismisses.
 * touch-action: pan-y so vertical swipes pass through to CSS snap scroll.
 */
export function ReelsGestureLayer({ onSeekBack, onSeekForward, onTogglePlayPause, children }: Props) {
  const touchRef = useRef<{ x: number; moved: boolean } | null>(null);
  const startYRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startYRef.current = t.clientY;
    touchRef.current = { x: t.clientX, moved: false };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!touchRef.current || !t) return;
    const dx = Math.abs(t.clientX - touchRef.current.x);
    const dy = Math.abs(t.clientY - startYRef.current);
    if (dx > 12 || dy > 12) touchRef.current.moved = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const { x, moved } = touchRef.current;
    touchRef.current = null;
    if (moved) return; // Was a scroll

    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = (x - rect.left) / rect.width;
    if (relX < 0.30) onSeekBack();
    else if (relX > 0.70) onSeekForward();
    else onTogglePlayPause();
  }, [onSeekBack, onSeekForward, onTogglePlayPause]);

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 25, touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        if (relX < 0.30) onSeekBack();
        else if (relX > 0.70) onSeekForward();
        else onTogglePlayPause();
      }}
    >
      {children}
    </div>
  );
}
