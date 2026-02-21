/**
 * ArtistFingerprintButton — Discovery button that fades in after 3 seconds
 * of Hook Dance playback. Shows "Make this yours forever →" or fingerprint
 * summary if already active.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface Props {
  /** How many seconds the Hook Dance has been playing */
  elapsedSeconds: number;
  /** The artist's existing fingerprint, if any */
  fingerprint: ArtistDNA | null;
  /** Called when the artist clicks the CTA to start onboarding */
  onStartOnboarding: () => void;
  /** Called when an artist with fingerprint taps the summary */
  onViewSummary: () => void;
}

export function ArtistFingerprintButton({
  elapsedSeconds,
  fingerprint,
  onStartOnboarding,
  onViewSummary,
}: Props) {
  const visible = elapsedSeconds >= 3;

  if (!visible) return null;

  if (fingerprint) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        onClick={onViewSummary}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-white/50 hover:text-white/80 transition-colors"
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: fingerprint.palette.primary }}
        />
        <span className="text-[11px] font-mono tracking-wider">Your fingerprint is active</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
      onClick={onStartOnboarding}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-white/40 hover:text-white/70 hover:border-white/30 transition-all text-[12px] tracking-wide"
    >
      Make this yours forever →
    </motion.button>
  );
}
