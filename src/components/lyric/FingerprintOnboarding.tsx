/**
 * FingerprintOnboarding — Full-screen takeover with blurred Hook Dance behind.
 * Single question: "My music sounds like _____ but feels like _____."
 */

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArtistDNA, FingerprintSongContext } from "./ArtistFingerprintTypes";

interface Props {
  songContext: FingerprintSongContext;
  onGenerated: (dna: ArtistDNA) => void;
  onClose: () => void;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function FingerprintOnboarding({ songContext, onGenerated, onClose }: Props) {
  const [soundsLike, setSoundsLike] = useState("");
  const [feelsLike, setFeelsLike] = useState("");
  const [generating, setGenerating] = useState(false);

  const canGenerate = wordCount(soundsLike) >= 2 && wordCount(feelsLike) >= 2;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("artist-fingerprint", {
        body: {
          sounds_like: soundsLike.trim(),
          feels_like: feelsLike.trim(),
          song_context: songContext,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.artist_dna) throw new Error("No fingerprint returned");
      onGenerated(data.artist_dna as ArtistDNA);
    } catch (e) {
      console.error("Fingerprint generation error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to generate fingerprint");
    } finally {
      setGenerating(false);
    }
  }, [soundsLike, feelsLike, canGenerate, generating, songContext, onGenerated]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Blurred backdrop — the Hook Dance canvas shows through */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" />

      {/* Close via Escape */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/20 hover:text-white/50 text-xs font-mono uppercase tracking-wider transition-colors"
      >
        ✕
      </button>

      <div className="relative z-10 max-w-lg w-full px-6 space-y-10">
        {/* Header */}
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.3em] text-center">
          Your Permanent Artist Fingerprint
        </p>

        {/* Explanation */}
        <p className="text-sm text-white/50 text-center leading-relaxed max-w-md mx-auto">
          This defines how every lyric video you ever make will look and feel. 
          It cannot be bought or copied. It is derived entirely from how you 
          describe your own music.
        </p>

        {/* The Question */}
        <div className="space-y-6">
          <p className="text-2xl sm:text-3xl text-center text-white/90 leading-snug" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            "My music sounds like{" "}
            <span className="text-white/40">_______</span>
            {" "}but feels like{" "}
            <span className="text-white/40">_______</span>."
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={soundsLike}
                onChange={(e) => setSoundsLike(e.target.value)}
                placeholder="what the ear hears"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                disabled={generating}
                autoFocus
              />
              <p className="text-[10px] font-mono text-white/20 text-center">
                {wordCount(soundsLike)}/2+ words
              </p>
            </div>

            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={feelsLike}
                onChange={(e) => setFeelsLike(e.target.value)}
                placeholder="what the body feels"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                disabled={generating}
                onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
              />
              <p className="text-[10px] font-mono text-white/20 text-center">
                {wordCount(feelsLike)}/2+ words
              </p>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <div className="flex justify-center">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className={`px-8 py-3 rounded-lg text-[13px] font-bold tracking-[0.2em] uppercase transition-all ${
              canGenerate && !generating
                ? "bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Generating…
              </span>
            ) : (
              "Generate My Fingerprint"
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
