/**
 * InlineBattle — Dual lyric-dance renderer for hook battles.
 * Uses two LyricDanceEmbed instances constrained to hook time regions.
 * Same cinematic engine as the full lyric dance, just windowed to 10-second hooks.
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
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
  user_id?: string;
  hook_start: number;
  hook_end: number;
  hook_label: string | null;
  hook_phrase: string | null;
  hook_slug: string;
  battle_position: number;
  artist_slug: string;
  song_slug: string;
  vote_count: number;
  palette?: string[];
}

export interface InlineBattleHandle {}

interface Props {
  battleId: string;
  mode: BattleMode;
  votedSide?: "a" | "b" | null;
  voteCount?: number;
  votePct?: number;
  onHookEnd?: (side: "a" | "b") => void;
  onHooksLoaded?: (hookA: HookInfo, hookB: HookInfo | null) => void;
  onTileTap?: (side: "a" | "b") => void;
  activePlaying: "a" | "b" | null;
  forceMuted?: boolean;
  onCoverImage?: (url: string) => void;
}

const HOOK_SELECT = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_position,artist_slug,song_slug,vote_count,palette";

export const InlineBattle = forwardRef<InlineBattleHandle, Props>(function InlineBattle({
  battleId, mode, votedSide, voteCount, votePct, onHookEnd, onHooksLoaded,
  onTileTap, activePlaying, forceMuted, onCoverImage,
}, ref) {
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharedImagesReady, setSharedImagesReady] = useState(false);
  const fetchRef = useRef(0);
  const hookEndFiredA = useRef(false);
  const hookEndFiredB = useRef(false);
  const sharedImagesRef = useRef<HTMLImageElement[]>([]);

  useImperativeHandle(ref, () => ({}), []);

  // ── Fetch hooks + lyric dance data (always fresh) ──────────
  useEffect(() => {
    if (!battleId) return;
    const fetchId = ++fetchRef.current;
    setHookA(null);
    setHookB(null);
    setDanceData(null);
    setLoading(true);
    setSharedImagesReady(false);
    hookEndFiredA.current = false;
    hookEndFiredB.current = false;

    (async () => {
      // 1. Fetch hook rows
      const { data: hooks, error: hookErr } = await supabase
        .from("shareable_hooks" as any)
        .select(HOOK_SELECT)
        .eq("battle_id", battleId)
        .order("battle_position", { ascending: true });

      console.log("[InlineBattle] hooks query:", { battleId, hooks: hooks?.length ?? 0, error: hookErr?.message });

      if (!hooks || hooks.length === 0) { setLoading(false); return; }
      if (fetchId !== fetchRef.current) return; // stale

      const rawHooks = hooks as unknown as (HookInfo & { user_id?: string })[];
      const a = rawHooks.find(h => h.battle_position === 1) || rawHooks[0];
      const b = rawHooks.find(h => h.id !== a.id) || null;
      setHookA(a);
      setHookB(b);
      onHooksLoaded?.(a, b);

      console.log("[InlineBattle] hookA:", { id: a.id, start: a.hook_start, end: a.hook_end, artist: a.artist_slug, song: a.song_slug });

      // 2. Fetch the lyric dance for this song (match by user + song slug)
      let query = supabase
        .from("shareable_lyric_dances" as any)
        .select(LYRIC_DANCE_COLUMNS)
        .eq("song_slug", a.song_slug)
        .limit(1);

      // Prefer matching by user_id if available
      if ((a as any).user_id) {
        query = query.eq("user_id", (a as any).user_id);
      } else {
        query = query.eq("artist_slug", a.artist_slug);
      }

      const { data: dances, error: danceErr } = await query;

      console.log("[InlineBattle] dance query:", { found: dances?.length ?? 0, error: danceErr?.message, hasCinematic: !!(dances?.[0] as any)?.cinematic_direction });

      if (fetchId !== fetchRef.current) return; // stale
      if (dances && dances.length > 0) {
        const dance = dances[0] as unknown as LyricDanceData;
        setDanceData(dance);
        const firstImage = (dance.section_images as string[] | undefined)?.find(Boolean);
        if (firstImage) onCoverImage?.(firstImage);
      }
      setLoading(false);
    })();
  }, [battleId]);

  // ── Mode-based opacity ─────────────────────────────────────
  const getOpacity = useCallback((side: "a" | "b") => {
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
  }, [mode, votedSide]);

  const getBorderStyle = useCallback((side: "a" | "b"): React.CSSProperties => {
    if (votedSide === side) {
      return { boxShadow: "inset 0 0 0 3px rgba(34,197,94,0.8)" };
    }
    return {};
  }, [votedSide]);

  // Fire onHookEnd once per side after the hook duration plays through
  useEffect(() => {
    if (!hookA || activePlaying !== "a" || hookEndFiredA.current) return;
    const duration = (hookA.hook_end - hookA.hook_start) * 1000 + 500;
    const timer = setTimeout(() => {
      hookEndFiredA.current = true;
      onHookEnd?.("a");
    }, duration);
    return () => clearTimeout(timer);
  }, [activePlaying, hookA, onHookEnd]);

  useEffect(() => {
    if (!hookB || activePlaying !== "b" || hookEndFiredB.current) return;
    const duration = (hookB.hook_end - hookB.hook_start) * 1000 + 500;
    const timer = setTimeout(() => {
      hookEndFiredB.current = true;
      onHookEnd?.("b");
    }, duration);
    return () => clearTimeout(timer);
  }, [activePlaying, hookB, onHookEnd]);

  useEffect(() => {
    if (!danceData) return;
    const urls = danceData.section_images?.filter((url): url is string => Boolean(url)) ?? [];
    if (urls.length === 0) {
      sharedImagesRef.current = [];
      setSharedImagesReady(true);
      return;
    }

    setSharedImagesReady(false);
    let cancelled = false;
    Promise.all(
      urls.map((url) => new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(new Image());
        img.src = url;
      })),
    ).then((images) => {
      if (cancelled) return;
      sharedImagesRef.current = images;
      setSharedImagesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [danceData?.id, danceData?.section_images]);

  // ── Loading / no data ──────────────────────────────────────
  if (loading || !hookA) {
    return (
      <div className="w-full h-full animate-pulse">
        <div className="flex h-full gap-1 p-1">
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  if (!danceData) {
    return (
      <div className="w-full h-full bg-black/20 flex items-center justify-center text-white/40 text-xs font-mono">
        No lyric dance found for this song
      </div>
    );
  }

  if (!sharedImagesReady) {
    return (
      <div className="w-full h-full animate-pulse">
        <div className="flex h-full gap-1 p-1">
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
          <div className="flex-1 rounded-lg bg-white/[0.03]" />
        </div>
      </div>
    );
  }

  const danceUrl = `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  const isActive = mode !== "dark";
  return (
    <div className="w-full h-full">
      <div className="relative flex flex-row h-full">
        {/* Hook A */}
        <motion.div
          className="relative flex-1 overflow-hidden cursor-pointer"
          animate={{ opacity: getOpacity("a") }}
          transition={{ duration: 0.4 }}
          onClick={() => onTileTap?.("a")}
        >
          <LyricDanceEmbed
            key={`battle-a-${hookA.id}`}
            lyricDanceId={danceData.id}
            lyricDanceUrl={danceUrl}
            songTitle={danceData.song_name}
            artistName={danceData.artist_name || ""}
            prefetchedData={danceData}
            cardState={isActive && activePlaying === "a" ? "active" : "warm"}
            regionStart={hookA.hook_start}
            regionEnd={hookA.hook_end}
          />
          {getBorderStyle("a").boxShadow && (
            <div
              className="absolute top-0 left-0 right-0 bottom-11 z-30 pointer-events-none rounded-sm"
              style={getBorderStyle("a")}
            />
          )}
          {votedSide === "a" && voteCount != null && (
            <div className="absolute bottom-14 right-2 z-10 pointer-events-none">
              <span className="text-[9px] font-mono text-green-400/90 bg-black/60 backdrop-blur-sm border border-green-500/30 rounded-full px-2 py-0.5">
                ✓ You + {Math.max(0, (voteCount ?? 1) - 1)} FMLY ({votePct ?? 0}%)
              </span>
            </div>
          )}
        </motion.div>

        {/* Hook B */}
        {hookB ? (
          <motion.div
            className="relative flex-1 overflow-hidden cursor-pointer"
            animate={{ opacity: getOpacity("b") }}
            transition={{ duration: 0.4 }}
            onClick={() => onTileTap?.("b")}
          >
            <LyricDanceEmbed
              key={`battle-b-${hookB.id}`}
              lyricDanceId={danceData.id}
              lyricDanceUrl={danceUrl}
              songTitle={danceData.song_name}
              artistName={danceData.artist_name || ""}
              prefetchedData={danceData}
              cardState={isActive && activePlaying === "b" ? "active" : "warm"}
              regionStart={hookB.hook_start}
              regionEnd={hookB.hook_end}
            />
            {getBorderStyle("b").boxShadow && (
              <div
                className="absolute top-0 left-0 right-0 bottom-11 z-30 pointer-events-none rounded-sm"
                style={getBorderStyle("b")}
              />
            )}
            {votedSide === "b" && voteCount != null && (
              <div className="absolute bottom-14 left-2 z-10 pointer-events-none">
                <span className="text-[9px] font-mono text-green-400/90 bg-black/60 backdrop-blur-sm border border-green-500/30 rounded-full px-2 py-0.5">
                  ✓ You + {Math.max(0, (voteCount ?? 1) - 1)} FMLY ({votePct ?? 0}%)
                </span>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="relative flex-1 overflow-hidden bg-black/50" />
        )}
      </div>
    </div>
  );
});
