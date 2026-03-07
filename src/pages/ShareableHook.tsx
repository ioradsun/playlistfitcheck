import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { InlineLyricDance } from "@/components/songfit/InlineLyricDance";
import { InlineBattle, type BattleMode } from "@/components/hookfit/InlineBattle";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";
import { getSessionId } from "@/lib/sessionId";

const HOOK_COLUMNS = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_id,battle_position,artist_slug,song_slug,palette";

type BattleState = "listen-a" | "listen-b" | "vote" | "results";

const EMOJI_OPTIONS = ["🔥", "💀", "🫠", "👑", "💜", "😤"];

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<(HookInfo & { battle_id?: string }) | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);

  // Battle flow state
  const [battleState, setBattleState] = useState<BattleState>("listen-a");
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [replayingSide, setReplayingSide] = useState<"a" | "b" | null>(null);
  const userIdRef = useRef<string | null | undefined>(undefined);

  // ── Fetch hook data ────────────────────────────────────────
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

  // ── Check for existing vote ────────────────────────────────
  const handleHooksLoaded = useCallback((a: HookInfo, b: HookInfo | null) => {
    setHookA(a);
    setHookB(b);
    setVoteCountA(a.vote_count || 0);
    if (b) setVoteCountB(b.vote_count || 0);

    // Check if user already voted
    (async () => {
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;

      let query = supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", a.battle_position ? (a as any).battle_id : null);

      // We need battle_id — get it from the hook we already fetched
      if (hook?.battle_id) {
        query = supabase
          .from("hook_votes" as any)
          .select("hook_id")
          .eq("battle_id", hook.battle_id);

        if (u?.id) {
          query = query.eq("user_id", u.id);
        } else {
          query = query.eq("session_id", sessionId);
        }

        const { data: vote } = await query.maybeSingle();
        if (vote) {
          const existingVotedSide = (vote as any).hook_id === a.id ? "a" : "b";
          setVotedSide(existingVotedSide);
          setBattleState("results");
        }
      }
    })();
  }, [hook?.battle_id]);

  // ── Vote handler ───────────────────────────────────────────
  const handleVote = useCallback(async (side: "a" | "b") => {
    if (!hookA || !hook?.battle_id || battleState !== "vote") return;
    const hookId = side === "a" ? hookA.id : hookB?.id;
    if (!hookId) return;

    // Optimistic update
    setVotedSide(side);
    if (side === "a") setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setBattleState("results");

    const sessionId = getSessionId();
    if (userIdRef.current === undefined) {
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;
    }

    await supabase
      .from("hook_votes" as any)
      .insert({
        battle_id: hook.battle_id,
        hook_id: hookId,
        user_id: userIdRef.current || null,
        session_id: sessionId,
      });
  }, [hookA, hookB, hook?.battle_id, battleState]);

  // ── Poll vote counts after voting ─────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !hookA || !hook?.battle_id) return;

    const poll = async () => {
      const { data } = await supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", hook.battle_id);
      if (!data) return;
      const votes = data as any[];
      setVoteCountA(votes.filter(v => v.hook_id === hookA.id).length);
      setVoteCountB(votes.filter(v => v.hook_id === hookB?.id).length);
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [battleState, hookA, hookB, hook?.battle_id]);

  // ── iOS scroll prevention ──────────────────────────────────
  useEffect(() => {
    if (!hook?.battle_id) return;
    const style = document.createElement("style");
    style.textContent = "html, body { overflow: hidden; height: 100%; }";
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [hook?.battle_id]);

  // ── Hook end callback — drives auto-advance ───────────────
  const handleHookEnd = useCallback((side: "a" | "b") => {
    if (battleState === "listen-a" && side === "a") {
      setBattleState("listen-b");
    } else if (battleState === "listen-b" && side === "b") {
      setBattleState("vote");
    }
    // In results state, hooks loop freely — no state change
  }, [battleState]);

  // ── Derived values ─────────────────────────────────────────
  const totalVotes = voteCountA + voteCountB;
  const pctA = totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const pctB = totalVotes > 0 ? Math.round((voteCountB / totalVotes) * 100) : 50;

  // Map battleState to InlineBattle's BattleMode
  const battleMode: BattleMode = useMemo(() => {
    switch (battleState) {
      case "listen-a": return "listen-a";
      case "listen-b": return "listen-b";
      case "vote": return "judgment";
      case "results": return votedSide === "a" ? "scorecard" : votedSide === "b" ? "scorecard" : "judgment";
    }
  }, [battleState, votedSide]);

  // Active audio — which side plays
  const activePlaying: "a" | "b" | null = useMemo(() => {
    switch (battleState) {
      case "listen-a": return "a";
      case "listen-b": return "b";
      case "vote": return null; // Silence during vote
      case "results": return replayingSide ?? votedSide; // Winner plays, or whichever side user tapped
    }
  }, [battleState, votedSide, replayingSide]);

  // Tile tap — disabled during listen/vote phase, switches audio in results
  const handleTileTap = useCallback((side: "a" | "b") => {
    if (battleState !== "results") return; // No interaction during listen/vote
    // In results: tap either side to replay it
    setReplayingSide(prev => prev === side ? null : side);
  }, [battleState]);

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  if (loading) {
    return <div className="min-h-screen bg-black animate-pulse" />;
  }

  if (!hook) {
    return <div className="min-h-screen bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  // ── Battle mode: fullscreen with voting flow ──
  if (hook.battle_id) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>

        {/* Canvas area */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <InlineBattle
            battleId={hook.battle_id}
            mode={battleMode}
            activePlaying={activePlaying}
            votedSide={votedSide}
            onTileTap={handleTileTap}
            onHooksLoaded={handleHooksLoaded}
            onHookEnd={handleHookEnd}
          />

          {/* Vote overlay — appears centered over the seam during vote state */}
          <AnimatePresence>
            {battleState === "vote" && (
              <motion.div
                key="vote-prompt"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-0 top-4 flex justify-center z-20 pointer-events-none"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
                  Your verdict
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom bar — transforms through states */}
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }}>
          <div className="w-full max-w-2xl mx-auto px-4 py-3">
            <AnimatePresence mode="wait">

              {/* ── LISTEN states: show which hook is playing ── */}
              {(battleState === "listen-a" || battleState === "listen-b") && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <div className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                    battleState === "listen-a" ? "border-white/20 bg-white/[0.04]" : "border-white/[0.07]"
                  }`}>
                    {battleState === "listen-a" && (
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                        style={{ background: hookA?.palette?.[0] ?? "#a855f7", opacity: 0.8 }} />
                    )}
                    <span className={`text-[11px] font-mono uppercase tracking-wider transition-colors ${
                      battleState === "listen-a" ? "text-white/70" : "text-white/25"
                    }`}>
                      Left Hook
                    </span>
                  </div>

                  <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest shrink-0">vs</span>

                  <div className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
                    battleState === "listen-b" ? "border-white/20 bg-white/[0.04]" : "border-white/[0.07]"
                  }`}>
                    {battleState === "listen-b" && (
                      <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                        style={{ background: hookB?.palette?.[0] ?? "#a855f7", opacity: 0.8 }} />
                    )}
                    <span className={`text-[11px] font-mono uppercase tracking-wider transition-colors ${
                      battleState === "listen-b" ? "text-white/70" : "text-white/25"
                    }`}>
                      Right Hook
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ── VOTE state: two tappable vote buttons ── */}
              {battleState === "vote" && (
                <motion.div
                  key="vote"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={() => handleVote("a")}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all"
                  >
                    <span className="text-sm">👊</span>
                    <span className="text-[12px] font-mono uppercase tracking-[0.15em] text-white/80 font-semibold">
                      Left Hook
                    </span>
                  </button>

                  <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest shrink-0">vs</span>

                  <button
                    onClick={() => handleVote("b")}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all"
                  >
                    <span className="text-[12px] font-mono uppercase tracking-[0.15em] text-white/80 font-semibold">
                      Right Hook
                    </span>
                    <span className="text-sm">👊</span>
                  </button>
                </motion.div>
              )}

              {/* ── RESULTS state: percentage bars + emoji row ── */}
              {battleState === "results" && votedSide && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {/* Score bars */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[10px] uppercase tracking-wider w-20 truncate ${
                        votedSide === "a" ? "text-white/70 font-semibold" : "text-white/40"
                      }`}>
                        Left Hook
                      </span>
                      <div className="flex-1 h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: hookA?.palette?.[0] || "#a855f7" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pctA}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-white/60 w-10 text-right">{pctA}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[10px] uppercase tracking-wider w-20 truncate ${
                        votedSide === "b" ? "text-white/70 font-semibold" : "text-white/40"
                      }`}>
                        Right Hook
                      </span>
                      <div className="flex-1 h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: hookB?.palette?.[0] || "#a855f7" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pctB}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-white/60 w-10 text-right">{pctB}%</span>
                    </div>
                    <p className="text-center font-mono text-[9px] text-white/25 uppercase tracking-wider">
                      {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Emoji reaction row */}
                  <div className="flex items-center justify-center gap-2">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setSelectedEmoji(prev => prev === emoji ? null : emoji)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all ${
                          selectedEmoji === emoji
                            ? "bg-white/10 scale-110 ring-1 ring-white/20"
                            : "bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
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
