/**
 * ClipComposer — stub component for clip composition UI.
 * Will be fleshed out when clip export features are built.
 */

import React from "react";

interface ClipComposerProps {
  visible: boolean;
  player: any;
  durationSec: number;
  fires?: any[];
  lines?: Array<{ lineIndex: number; text: string; startSec: number; endSec: number }>;
  initialStart?: number;
  initialEnd?: number;
  initialCaption?: string | null;
  songTitle?: string;
  onClose: () => void;
}

export function ClipComposer({ visible, onClose }: ClipComposerProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-background rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Clip Composer</h2>
        <p className="text-sm text-muted-foreground">
          Clip export is coming soon.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
