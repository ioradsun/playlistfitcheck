/**
 * InlineBattle — Dual lyric-dance renderer for hook battles.
 * Uses two InlineLyricDance instances constrained to hook regions.
 * Same cinematic engine, just windowed to 10-second hook timestamps.
 */

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { InlineLyricDance } from "@/components/songfit/InlineLyricDance";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";

export type BattleMode =
  | "dark"
  | "listen-a"
  | "listen-b"
  | "judgment"
  | "scorecard"
  | "results";

export interface HookInfo {
  id: string;
  hook_start: number;
  hook_end: number;
  hook_label: string | null;
  hook_phrase: string | null;
  hook_slug?: string;
  vote_count?: number;
  battle_position: number;
  artist_slug: string;
  song_slug: string;
  palette?: string[];
}

export interface InlineBattleHandle {
  // Simplified — no more constellation/river refs
}

interface Props {
  battleId: string;
  mode: BattleMode;
  votedSide?: "a" | "b" | null;
  onHookEnd?: (side: "a" | "b") => void;
  onHooksLoaded?: (hookA: HookInfo, hookB: HookInfo | null) => void;
  onTileTap?: (side: "a" | "b") => void;
  activePlaying: "a" | "b" | null;
}

const HOOK_COLUMNS = "id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,vote_count,battle_position,artist_slug,song_slug,palette";

export const InlineBattle = forwardRef<InlineBattleHandle, Props>(function InlineBattle({
  battleId, mode, votedSide, onHooksLoaded,
  onTileTap, activePlaying,
}, ref) {
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useImperativeHandle(ref, () => ({}), []);

  useEffect(() => {
    if (!battleId) return;
    setLoading(true);

    (async () => {
      const { data: hooks } = await supabase
        .from("shareable_hooks" as any)
        .select(HOOK_COLUMNS)
        .eq("battle_id", battleId)
        .order("battle_position", { ascending: true });

      if (!hooks || hooks.length === 0) { setLoading(false); return; }

      const a = (hooks as any[]).find(h => h.battle_position === 1) || hooks[0];
      const b = (hooks as any[]).find(h => h.id !== a.id) || null;
      setHookA(a as HookInfo);
      setHookB((b as HookInfo | null) ?? null);
      onHooksLoaded?.(a as HookInfo, (b as HookInfo | null) ?? null);

      const { data: dances } = await supabase
        .from("shareable_lyric_dances" as any)
        .select(LYRIC_DANCE_COLUMNS)
        .eq("artist_slug", (a as HookInfo).artist_slug)
        .eq("song_slug", (a as HookInfo).song_slug)
        .limit(1);

      if (dances && dances.length > 0) {
        setDanceData(dances[0] as unknown as LyricDanceData);
      }

      setLoading(false);
    })();
  }, [battleId, onHooksLoaded]);

  const isActive = mode !== "dark";

  const getOpacity = (side: "a" | "b") => {
    switch (mode) {
      case "dark": return 0.2;
      case "listen-a": return side === "a" ? 1 : 0.4;
      case "listen-b": return side === "b" ? 1 : 0.4;
      case "judgment": return 0.7;
      case "scorecard":
      case "results":
        if (!votedSide) return 0.7;
        return side === votedSide ? 1 : 0.4;
      default: return 1;
    }
  };

  const getBorderStyle = (side: "a" | "b"): React.CSSProperties => {
    if (votedSide === side) {
      return { boxShadow: "inset 0 0 0 3px rgba(34,197,94,0.8)" };
    }
    return {};
  };

  const getSeamColor = () => {
    switch (mode) {
      case "listen-a": return hookA?.palette?.[0] || "#ffffff";
      case "listen-b": return hookB?.palette?.[0] || "#ffffff";
      default: return "rgba(255,255,255,0.1)";
    }
  };

  if (loading || !hookA || !danceData) {
    return (
      <div className="w-full bg-black/30 animate-pulse" style={{ height: "320px" }}>
        <div className="flex h-full gap-1 p-1">
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  const danceUrl = `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  const seamPulse = mode === "listen-a" || mode === "listen-b";

  return (
    <div className="w-full bg-black">
      <div className="relative flex flex-row" style={{ height: "320px" }}>
        <motion.div
          className="relative flex-1 overflow-hidden cursor-pointer"
          animate={{ opacity: getOpacity("a") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("a")}
        >
          <InlineLyricDance
            lyricDanceId={danceData.id}
            lyricDanceUrl={danceUrl}
            songTitle={danceData.song_name}
            artistName={danceData.artist_name}
            prefetchedData={danceData}
            bootMode="full"
            isActive={isActive && activePlaying !== "b"}
            regionStart={hookA.hook_start}
            regionEnd={hookA.hook_end}
          />
          {getBorderStyle("a").boxShadow && (
            <div className="absolute inset-0 z-10 pointer-events-none rounded-sm" style={getBorderStyle("a")} />
          )}
        </motion.div>

        <motion.div
          className="w-px shrink-0"
          animate={{
            backgroundColor: getSeamColor(),
            opacity: seamPulse ? [0.4, 1, 0.4] : 1,
          }}
          transition={seamPulse ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        />

        {hookB ? (
          <motion.div
            className="relative flex-1 overflow-hidden cursor-pointer"
            animate={{ opacity: getOpacity("b") }}
            transition={{ duration: 0.4 }}
            onClick={() => onTileTap?.("b")}
          >
            <InlineLyricDance
              lyricDanceId={danceData.id}
              lyricDanceUrl={danceUrl}
              songTitle={danceData.song_name}
              artistName={danceData.artist_name}
              prefetchedData={danceData}
              bootMode="full"
              isActive={isActive && activePlaying !== "a"}
              regionStart={hookB.hook_start}
              regionEnd={hookB.hook_end}
            />
            {getBorderStyle("b").boxShadow && (
              <div className="absolute inset-0 z-10 pointer-events-none rounded-sm" style={getBorderStyle("b")} />
            )}
          </motion.div>
        ) : (
          <div className="flex-1 bg-black/50" />
        )}
      </div>
    </div>
  );
});
