import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { InlineLyricDance } from "@/components/songfit/InlineLyricDance";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";

const HOOK_COLUMNS = "id,hook_start,hook_end,hook_label,hook_phrase,battle_position,artist_slug,song_slug,palette";

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<HookInfo | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);

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

      const selectedHook = hookRow as unknown as HookInfo;
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

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  if (loading) {
    return <div className="min-h-screen bg-black animate-pulse" />;
  }

  if (!hook || !danceData) {
    return <div className="min-h-screen bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto py-6 px-4">
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
