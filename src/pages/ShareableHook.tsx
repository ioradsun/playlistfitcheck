import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { InlineLyricDance } from "@/components/songfit/InlineLyricDance";
import { InlineBattle, type BattleMode } from "@/components/hookfit/InlineBattle";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";

const HOOK_COLUMNS = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_id,battle_position,artist_slug,song_slug,palette";

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<(HookInfo & { battle_id?: string }) | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Battle state
  const [battleMode, setBattleMode] = useState<BattleMode>("listen-a");
  const [activePlaying, setActivePlaying] = useState<"a" | "b" | null>("a");

  useEffect(() => {
    if (!artistSlug || !songSlug || !hookSlug) return;
    setLoading(true);
    (async () => {
      const { data: hookRow } = await supabase
        .from("shareable_hooks" as any)
        .select(HOOK_COLUMNS)
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .eq("hook_slug", hookSlug)
        .maybeSingle();

      if (!hookRow) {
        setLoading(false);
        return;
      }

      const selectedHook = hookRow as unknown as (HookInfo & { battle_id?: string });
      setHook(selectedHook);

      // Fetch lyric dance for single-hook view (non-battle fallback)
      if (!selectedHook.battle_id) {
        const { data: dances } = await supabase
          .from("shareable_lyric_dances" as any)
          .select(LYRIC_DANCE_COLUMNS)
          .eq("artist_slug", artistSlug)
          .eq("song_slug", songSlug)
          .limit(1);

        if (dances && dances.length > 0) {
          setDanceData(dances[0] as unknown as LyricDanceData);
        }
      }
      setLoading(false);
    })();
  }, [artistSlug, songSlug, hookSlug]);

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  const handleTileTap = useCallback((side: "a" | "b") => {
    setActivePlaying(prev => prev === side ? null : side);
    setBattleMode(side === "a" ? "listen-a" : "listen-b");
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black animate-pulse" />;
  }

  if (!hook) {
    return <div className="min-h-screen bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  // ── Battle mode: render dual split-screen ──
  if (hook.battle_id) {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        {/* Song title */}
        <div className="px-4 py-3 text-center">
          <p className="text-xs font-mono text-white/40 uppercase tracking-[0.15em]">Hook Battle</p>
          <p className="text-sm font-semibold text-white/80 mt-0.5">
            {hook.artist_slug?.replace(/-/g, " ")} — {hook.song_slug?.replace(/-/g, " ")}
          </p>
        </div>

        {/* Battle area — full width, 60vh height */}
        <div className="flex-1 min-h-0" style={{ maxHeight: "70vh" }}>
          <InlineBattle
            battleId={hook.battle_id}
            mode={battleMode}
            activePlaying={activePlaying}
            onTileTap={handleTileTap}
            onHookEnd={(side) => {
              // Auto-advance: A ends → play B, B ends → loop back to A
              if (side === "a") {
                setActivePlaying("b");
                setBattleMode("listen-b");
              } else {
                setActivePlaying("a");
                setBattleMode("listen-a");
              }
            }}
          />
        </div>

        {/* Hook labels */}
        <div className="flex px-4 py-3 gap-2">
          <button
            onClick={() => handleTileTap("a")}
            className={`flex-1 text-center py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${
              activePlaying === "a"
                ? "border-primary/60 text-primary bg-primary/5"
                : "border-white/10 text-white/40"
            }`}
          >
            Hook A
          </button>
          <button
            onClick={() => handleTileTap("b")}
            className={`flex-1 text-center py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-colors ${
              activePlaying === "b"
                ? "border-primary/60 text-primary bg-primary/5"
                : "border-white/10 text-white/40"
            }`}
          >
            Hook B
          </button>
        </div>
      </div>
    );
  }

  // ── Single hook mode: render one player ──
  if (!danceData) {
    return <div className="min-h-screen bg-black text-white grid place-items-center">No lyric dance found.</div>;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto py-6 px-4" style={{ height: "80vh" }}>
        <InlineLyricDance
          lyricDanceId={danceData.id}
          lyricDanceUrl={danceUrl}
          songTitle={danceData.song_name}
          artistName={danceData.artist_name}
          prefetchedData={danceData}
          bootMode="full"
          isActive
          regionStart={hook.hook_start}
          regionEnd={hook.hook_end}
        />
      </div>
    </div>
  );
}
