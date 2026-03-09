import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BattleEmbed } from "@/components/hookfit/BattleEmbed";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";

const HOOK_COLUMNS = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_id,battle_position,artist_slug,song_slug,palette,vote_count";

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<(HookInfo & { battle_id?: string }) | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

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

      const { data: dances } = await supabase
        .from("shareable_lyric_dances" as any)
        .select(LYRIC_DANCE_COLUMNS)
        .eq("artist_slug", artistSlug)
        .eq("song_slug", songSlug)
        .limit(1);

      if (dances && dances.length > 0) {
        setDanceData(dances[0] as unknown as LyricDanceData);
      }

      setLoading(false);
    })();
  }, [artistSlug, songSlug, hookSlug]);

  useEffect(() => {
    if (!hook?.battle_id) return;
    const style = document.createElement("style");
    style.textContent = "html, body { overflow: hidden; height: 100%; }";
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [hook?.battle_id]);

  const songDisplayName = useMemo(() => {
    const artist = hook?.artist_slug?.replace(/-/g, " ") ?? "";
    const song = hook?.song_slug?.replace(/-/g, " ") ?? "";
    return [artist, song].filter(Boolean).join(" — ");
  }, [hook]);

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  if (loading) {
    return <div className="fixed inset-0 bg-black animate-pulse" />;
  }

  if (!hook) {
    return <div className="fixed inset-0 bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  if (hook.battle_id) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <BattleEmbed
            battleId={hook.battle_id}
            battleUrl={`/${artistSlug}/${songSlug}/${hookSlug}`}
            songTitle={songDisplayName}
            showExpandButton={false}
            showSplitCover={false}
          />
        </div>
      </div>
    );
  }

  if (!danceData) {
    return <div className="fixed inset-0 bg-black text-white grid place-items-center">No lyric dance found.</div>;
  }

  return (
    <div className="fixed inset-0 bg-black">
      <div className="max-w-4xl mx-auto py-6 px-4" style={{ height: "80vh" }}>
        <LyricDanceEmbed
          lyricDanceId={danceData.id}
          lyricDanceUrl={danceUrl}
          songTitle={danceData.song_name}
          artistName={danceData.artist_name}
          prefetchedData={danceData}
          regionStart={hook.hook_start}
          regionEnd={hook.hook_end}
          showExpandButton={false}
        />
      </div>
    </div>
  );
}
