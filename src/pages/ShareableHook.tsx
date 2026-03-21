import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BattleEmbed } from "@/components/hookfit/BattleEmbed";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";
import { consumeShareableHookPrefetch } from "@/lib/prefetch";

const HOOK_COLUMNS = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_id,battle_position,artist_slug,song_slug,palette,vote_count";

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<(HookInfo & { battle_id?: string }) | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  } | null>(null);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!artistSlug || !songSlug || !hookSlug) return;
    setLoading(true);
    (async () => {
      const prefetched = consumeShareableHookPrefetch();
      const hookPromise = prefetched
        ? prefetched
        : supabase
            .from("shareable_hooks" as any)
            .select(HOOK_COLUMNS)
            .eq("artist_slug", artistSlug)
            .eq("song_slug", songSlug)
            .eq("hook_slug", hookSlug)
            .maybeSingle();
      const { data: hookRow } = await hookPromise;

      if (!hookRow) {
        setLoading(false);
        return;
      }

      const selectedHook = hookRow as unknown as (HookInfo & { battle_id?: string });
      setHook(selectedHook);
      if ((selectedHook as any).user_id) {
        supabase
          .from("profiles")
          .select("display_name, avatar_url, is_verified")
          .eq("id", (selectedHook as any).user_id)
          .maybeSingle()
          .then(({ data: pData }) => {
            if (pData) setProfile(pData as any);
          });
      }

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
    const t = setTimeout(() => setBadgeVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);

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
    return hook?.song_slug?.replace(/-/g, " ") ?? "";
  }, [hook]);

  const displayName = profile?.display_name
    ?? hook?.artist_slug?.replace(/-/g, " ")
    ?? "";

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
        {/* Matches final layout: canvas fills screen, bottom bar at 52px */}
        <div className="flex-1" />
        <div style={{ height: 52, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-stretch h-full">
            <div className="flex-1 flex items-center justify-center">
              <div className="h-3 w-20 rounded bg-white/[0.03]" />
            </div>
            <div className="w-px bg-white/[0.04] self-stretch my-2" />
            <div className="flex-1 flex items-center justify-center">
              <div className="h-3 w-20 rounded bg-white/[0.03]" />
            </div>
            <div className="w-px bg-white/[0.04] self-stretch my-2" />
            <div className="w-16 flex items-center justify-center">
              <div className="h-3 w-3 rounded bg-white/[0.03]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hook) {
    return <div className="fixed inset-0 bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  if (hook.battle_id) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>

        {/* Desktop top bar — avatar + FMLY Feud pill */}
        {!isMobile && displayName && (
          <div className="flex items-center px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-white/[0.06]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-[11px] font-mono text-white/30">
                      {displayName[0]?.toUpperCase() ?? "♪"}
                    </span>
                  </div>
                )}
                {profile?.is_verified && (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <VerifiedBadge size={10} />
                  </span>
                )}
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400">
                FMLY Feud · {displayName}
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <BattleEmbed
            battleId={hook.battle_id}
            battleUrl={`/${artistSlug}/${songSlug}/${hookSlug}`}
            songTitle={songDisplayName}
            showExpandButton={false}
            showSplitCover={false}
          />
        </div>

        {/* tools.fm floating badge */}
        <AnimatePresence>
          {badgeVisible && (
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => window.location.href = "/"}
              className="fixed bottom-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/[0.06] hover:border-white/15 hover:bg-black/80 transition-all group focus:outline-none"
            >
              <span className="text-[9px] font-mono text-white/30 group-hover:text-white/60 tracking-wider transition-colors">
                Fit by toolsFM
              </span>
            </motion.button>
          )}
        </AnimatePresence>

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
