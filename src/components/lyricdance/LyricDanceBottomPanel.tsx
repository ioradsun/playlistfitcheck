/**
 * LyricDanceBottomPanel — 3-state signal/comment panel for ShareableLyricDance.
 * States: pre-signal → post-signal (comment input) → post-comment (confirmation)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/sessionId";
import type { ConstellationNode } from "@/hooks/useHookCanvas";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";

const RIVER_ROW_COUNT = 4;

interface Props {
  danceId: string;
  constellationRef: React.MutableRefObject<ConstellationNode[]>;
  onCommentAdded: () => void;
}

type Phase = "pre-signal" | "post-signal" | "post-comment";

export default function LyricDanceBottomPanel({ danceId, constellationRef, onCommentAdded }: Props) {
  const [phase, setPhase] = useState<Phase>("pre-signal");
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if session already signaled
  useEffect(() => {
    const sessionId = getSessionId();
    supabase
      .from("lyric_dance_signals" as any)
      .select("would_replay")
      .eq("dance_id", danceId)
      .eq("session_id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWouldReplay((data as any).would_replay);
          setPhase("post-comment");
          // Load signal strength
          fetchSignalStrength();
        }
      });
  }, [danceId]);

  const fetchSignalStrength = useCallback(async () => {
    const { data } = await supabase
      .from("lyric_dance_signals" as any)
      .select("would_replay")
      .eq("dance_id", danceId);
    if (data && (data as any[]).length > 0) {
      const total = (data as any[]).length;
      const replays = (data as any[]).filter((s: any) => s.would_replay).length;
      setSignalStrength(Math.round((replays / total) * 100));
    }
  }, [danceId]);

  const handleSignal = useCallback((replay: boolean) => {
    setWouldReplay(replay);
    setPhase("post-signal");
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const handleCancel = useCallback(() => {
    setPhase("pre-signal");
    setWouldReplay(null);
    setCommentText("");
  }, []);

  const handleBroadcast = useCallback(async () => {
    if (submitting || wouldReplay === null) return;
    setSubmitting(true);
    const sessionId = getSessionId();
    const text = commentText.trim().slice(0, 200);

    // Get user if logged in
    const { data: { user } } = await supabase.auth.getUser();

    // Insert signal
    await supabase
      .from("lyric_dance_signals" as any)
      .upsert({
        dance_id: danceId,
        session_id: sessionId,
        user_id: user?.id || null,
        would_replay: wouldReplay,
        context_note: text || null,
      }, { onConflict: "dance_id,session_id" });

    // Insert comment if text provided
    if (text) {
      const { data: inserted } = await supabase
        .from("lyric_dance_comments" as any)
        .insert({
          dance_id: danceId,
          session_id: sessionId,
          user_id: user?.id || null,
          text,
        })
        .select("id, text, submitted_at")
        .single();

      if (inserted) {
        // Push to constellation as center phase node
        const c = inserted as any;
        const rng = mulberry32(hashSeed(c.id));
        const angle = rng() * Math.PI * 2;
        const radius = rng() * 0.2;
        const seedX = 0.5 + Math.cos(angle) * radius;
        const seedY = 0.5 + Math.sin(angle) * radius;
        constellationRef.current.push({
          id: c.id,
          text: c.text,
          submittedAt: Date.now(),
          seedX, seedY,
          x: 0.5, y: 0.5,
          driftSpeed: 0.008 + rng() * 0.012,
          driftAngle: rng() * Math.PI * 2,
          phase: "center",
          phaseStartTime: Date.now(),
          riverRowIndex: Math.floor(rng() * RIVER_ROW_COUNT),
          currentSize: 16,
          baseOpacity: 0.06,
        });
        onCommentAdded();
      }
    }

    await fetchSignalStrength();
    setPhase("post-comment");
    setSubmitting(false);
  }, [commentText, wouldReplay, danceId, constellationRef, onCommentAdded, submitting, fetchSignalStrength]);

  const handleShare = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("lyricFocus");
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className="px-5 py-4 pb-[env(safe-area-inset-bottom,16px)] shrink-0 overflow-hidden relative z-20" style={{ minHeight: "80px", background: "#0a0a0a" }}>
      <AnimatePresence mode="wait">
        {/* State 1: Pre-signal — Replay / Skip buttons */}
        {phase === "pre-signal" && (
          <motion.div
            key="pre-signal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-center gap-4"
          >
            <button
              onClick={() => handleSignal(true)}
              className="px-6 py-2.5 border border-white/20 rounded font-mono text-xs uppercase tracking-[0.15em] text-white/80 hover:bg-white/10 transition-colors min-h-[44px]"
            >
              REPLAY
            </button>
            <button
              onClick={() => handleSignal(false)}
              className="px-6 py-2.5 border border-white/20 rounded font-mono text-xs uppercase tracking-[0.15em] text-white/80 hover:bg-white/10 transition-colors min-h-[44px]"
            >
              SKIP
            </button>
          </motion.div>
        )}

        {/* State 2: Post-signal — comment input + BROADCAST */}
        {phase === "post-signal" && (
          <motion.div
            key="post-signal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={wouldReplay ? "What hit?" : "The missing piece..."}
                maxLength={200}
                rows={2}
                className="w-full bg-transparent border-0 border-b border-white/15 px-0 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors resize-none"
              />
              <button
                onClick={handleCancel}
                className="absolute top-0 right-0 text-white/30 hover:text-white/60 text-sm p-1"
              >
                ✕
              </button>
            </div>
            <button
              onClick={handleBroadcast}
              disabled={submitting}
              className="w-full py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors min-h-[44px] disabled:opacity-40"
            >
              {submitting ? "..." : "BROADCAST"}
            </button>
          </motion.div>
        )}

        {/* State 3: Post-comment — confirmation + signal strength + share */}
        {phase === "post-comment" && (
          <motion.div
            key="post-comment"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3 text-center"
          >
            <p className="text-[10px] font-mono text-white/30">
              your words are on the video
            </p>

            {signalStrength !== null && (
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">
                {signalStrength}% REPLAY FIT
              </p>
            )}

            <button
              onClick={handleShare}
              className="px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors min-h-[44px]"
            >
              {copied ? "Copied" : "SEND THIS"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
