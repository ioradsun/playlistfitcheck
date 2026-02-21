/**
 * FingerprintSummary — Shown when an artist with an active fingerprint
 * taps "Your fingerprint is active" on the Hook Dance canvas.
 */

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface Props {
  dna: ArtistDNA;
  onClose: () => void;
  onReset: () => void;
}

export function FingerprintSummary({ dna, onClose, onReset }: Props) {
  const { user } = useAuth();
  const [resetting, setResetting] = useState(false);

  const handleReset = useCallback(async () => {
    if (!user) return;
    setResetting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ artist_fingerprint: null } as any)
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Fingerprint cleared — you can create a new one");
      onReset();
    } catch (e) {
      toast.error("Failed to reset fingerprint");
    } finally {
      setResetting(false);
    }
  }, [user, onReset]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 max-w-sm w-full mx-4 bg-black/60 backdrop-blur-lg border border-white/10 rounded-xl p-6 space-y-5"
      >
        {/* Signature line */}
        <p
          className="text-xl text-white text-center"
          style={{
            fontFamily: `'${dna.typography.font_family}', sans-serif`,
            fontWeight: dna.typography.font_weight,
            fontStyle: dna.typography.font_style,
            letterSpacing: `${dna.typography.letter_spacing}px`,
            textTransform: dna.typography.text_transform,
          }}
        >
          {dna.tension_signature.signature_line}
        </p>

        {/* Palette */}
        <div className="flex justify-center gap-2">
          {[dna.palette.primary, dna.palette.accent, dna.palette.background_base, dna.palette.background_atmosphere].map((c, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full border border-white/20"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Details */}
        <div className="space-y-2 text-[11px] font-mono text-white/40">
          <div className="flex justify-between">
            <span>Font</span>
            <span className="text-white/60">{dna.typography.font_family}</span>
          </div>
          <div className="flex justify-between">
            <span>World</span>
            <span className="text-white/60 capitalize">{dna.background_world.type}</span>
          </div>
          <div className="flex justify-between">
            <span>Temperature</span>
            <span className="text-white/60 capitalize">{dna.palette.temperature}</span>
          </div>
          <div className="flex justify-between">
            <span>Tension Gap</span>
            <span className="text-white/60">{Math.round(dna.tension_signature.gap_score * 100)}%</span>
          </div>
        </div>

        {/* World description */}
        <p className="text-[10px] text-white/25 italic text-center">
          {dna.background_world.description}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex-1 py-2 rounded-lg text-[11px] font-mono uppercase tracking-wider text-white/30 border border-white/10 hover:text-white/60 hover:border-white/20 transition-all disabled:opacity-50"
          >
            {resetting ? "Clearing…" : "Reset"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-[11px] font-mono uppercase tracking-wider text-white bg-white/10 hover:bg-white/15 transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
