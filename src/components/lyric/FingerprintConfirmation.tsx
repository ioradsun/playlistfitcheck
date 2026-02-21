/**
 * FingerprintConfirmation — Shows the artist their generated fingerprint
 * with a live background world rendering and their signature line.
 */

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ArtistDNA } from "./ArtistFingerprintTypes";

interface Props {
  dna: ArtistDNA;
  onLockIn: () => void;
  onStartOver: () => void;
}

export function FingerprintConfirmation({ dna, onLockIn, onStartOver }: Props) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // Render live background with fingerprint palette
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let time = 0;
    const tick = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      time += 0.016;

      // Base
      ctx.fillStyle = dna.palette.background_base;
      ctx.fillRect(0, 0, w, h);

      // Atmosphere gradient
      const grad = ctx.createRadialGradient(
        w / 2 + Math.sin(time * 0.2) * w * 0.1,
        h * 0.6 + Math.cos(time * 0.15) * h * 0.05,
        0,
        w / 2,
        h * 0.6,
        w * 0.6
      );
      grad.addColorStop(0, dna.palette.background_atmosphere);
      grad.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Primary pulse
      const pulse = Math.sin(time * 0.5) * 0.1 + 0.15;
      const pGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.3);
      pGrad.addColorStop(0, dna.palette.primary);
      pGrad.addColorStop(1, "transparent");
      ctx.globalAlpha = pulse;
      ctx.fillStyle = pGrad;
      ctx.fillRect(0, 0, w, h);

      // Particles based on behavior
      ctx.globalAlpha = 0.4;
      const particleCount = 12;
      for (let i = 0; i < particleCount; i++) {
        const seed = i * 137.5;
        let px: number, py: number;
        switch (dna.background_world.particle_behavior) {
          case "rising":
            px = (seed * 7.3 + time * 10) % w;
            py = h - ((seed * 3.7 + time * 30) % h);
            break;
          case "falling":
            px = (seed * 7.3 + time * 5) % w;
            py = (seed * 3.7 + time * 20) % h;
            break;
          case "orbiting":
            px = w / 2 + Math.cos(time * 0.3 + seed) * w * 0.3;
            py = h / 2 + Math.sin(time * 0.3 + seed) * h * 0.3;
            break;
          case "drifting":
            px = (seed * 7.3 + Math.sin(time * 0.2 + seed) * 50) % w;
            py = (seed * 3.7 + Math.cos(time * 0.15 + seed) * 30) % h;
            break;
          default:
            continue;
        }
        ctx.fillStyle = dna.palette.accent;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dna]);

  const handleLockIn = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to save your fingerprint");
      return;
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ artist_fingerprint: dna as any })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Fingerprint locked in");
      onLockIn();
    } catch (e) {
      console.error("Save fingerprint error:", e);
      toast.error("Failed to save fingerprint");
    }
  }, [user, dna, onLockIn]);

  // Load the Google Font
  useEffect(() => {
    const fontName = dna.typography.font_family;
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@${dna.typography.font_weight}&display=swap`;
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [dna.typography.font_family, dna.typography.font_weight]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Live background */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Content */}
      <div className="relative z-10 max-w-lg w-full px-6 space-y-8 text-center">
        {/* Signature line in fingerprint font */}
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-3xl sm:text-4xl text-white leading-snug"
          style={{
            fontFamily: `'${dna.typography.font_family}', sans-serif`,
            fontWeight: dna.typography.font_weight,
            fontStyle: dna.typography.font_style,
            letterSpacing: `${dna.typography.letter_spacing}px`,
            textTransform: dna.typography.text_transform,
          }}
        >
          {dna.tension_signature.signature_line}
        </motion.p>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-sm text-white/40 leading-relaxed"
        >
          This is your visual world. Every lyric video you make will live here.
        </motion.p>

        {/* Palette preview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="flex justify-center gap-2"
        >
          {[dna.palette.primary, dna.palette.accent, dna.palette.background_base, dna.palette.background_atmosphere].map((c, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full border border-white/20"
              style={{ backgroundColor: c }}
            />
          ))}
        </motion.div>

        {/* World description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="text-[11px] font-mono text-white/25 italic"
        >
          {dna.background_world.description}
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="flex gap-4 justify-center"
        >
          <button
            onClick={onStartOver}
            className="px-6 py-3 rounded-lg text-[12px] font-bold tracking-[0.15em] uppercase text-white/40 border border-white/15 hover:text-white/70 hover:border-white/30 transition-all"
          >
            Start Over
          </button>
          <button
            onClick={handleLockIn}
            className="px-8 py-3 rounded-lg text-[12px] font-bold tracking-[0.15em] uppercase bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10 transition-all"
          >
            Lock This In
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
