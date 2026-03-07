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
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);

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

      if (!hookRow) { setLoading(false); return; }

      const selectedHook = hookRow as unknown as (HookInfo & { battle_id?: string });
      setHook(selectedHook);

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

  // Prevent scroll bounce on iOS in battle mode
  useEffect(() => {
    if (!hook?.battle_id) return;
    const style = document.createElement("style");
    style.textContent = "html, body { overflow: hidden; height: 100%; }";
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [hook?.battle_id]);

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

  // ── Battle mode: fullscreen dual split-screen ──
  if (hook.battle_id) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
        {/* Main battle area — two canvases side by side, full height */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <InlineBattle
            battleId={hook.battle_id}
            mode={battleMode}
            activePlaying={activePlaying}
            onTileTap={handleTileTap}
            onHooksLoaded={(a, b) => { setHookA(a); setHookB(b); }}
            onHookEnd={(side) => {
              if (side === "a") { setActivePlaying("b"); setBattleMode("listen-b"); }
              else { setActivePlaying("a"); setBattleMode("listen-a"); }
            }}
          />
        </div>

        {/* Bottom bar — ShareableLyricDance style */}
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }}>
          <div className="w-full max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left overflow-hidden min-w-0 group transition-all ${
                  activePlaying === "a" ? "border-white/20 bg-white/[0.04]" : "border-white/[0.07] hover:border-white/15"
                }`}
                style={{ background: activePlaying === "a" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)" }}
                onClick={() => handleTileTap("a")}
              >
                {activePlaying === "a" && (
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                    style={{ background: hookA?.palette?.[0] ?? "#a855f7", opacity: 0.6 }} />
                )}
                <span className={`text-[11px] font-mono truncate transition-colors ${
                  activePlaying === "a" ? "text-white/65" : "text-white/30"
                }`}>
                  {hookA?.hook_label || hookA?.hook_phrase || "Hook A"}
                </span>
              </button>

              <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest shrink-0">vs</span>

              <button
                className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left overflow-hidden min-w-0 group transition-all ${
                  activePlaying === "b" ? "border-white/20 bg-white/[0.04]" : "border-white/[0.07] hover:border-white/15"
                }`}
                style={{ background: activePlaying === "b" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)" }}
                onClick={() => handleTileTap("b")}
              >
                {activePlaying === "b" && (
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                    style={{ background: hookB?.palette?.[0] ?? "#a855f7", opacity: 0.6 }} />
                )}
                <span className={`text-[11px] font-mono truncate transition-colors ${
                  activePlaying === "b" ? "text-white/65" : "text-white/30"
                }`}>
                  {hookB?.hook_label || hookB?.hook_phrase || "Hook B"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Single hook mode ──
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
