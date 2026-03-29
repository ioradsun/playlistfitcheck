/* Placeholder – ClipComposer is not yet implemented. */
import React from "react";

interface ClipComposerProps {
  visible: boolean;
  player: any;
  durationSec: number;
  initialStart: number;
  initialCaption: string | null;
  clipDuration: number;
  empowermentPromise: any;
  accent: string;
  danceId: string;
  onClose: () => void;
}

export function ClipComposer({ visible, onClose }: ClipComposerProps) {
  if (!visible) return null;
  return (
    <div className="p-4 text-center text-muted-foreground text-xs">
      <p>Clip composer coming soon.</p>
      <button onClick={onClose} className="mt-2 underline text-primary/60 hover:text-primary">close</button>
    </div>
  );
}
