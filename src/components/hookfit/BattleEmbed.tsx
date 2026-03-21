/**
 * BattleEmbed — Single canonical hook battle player.
 * Used by both ShareableHook (fullscreen) and CrowdFit feed (inline card).
 *
 * Feed-specific behaviour is controlled by two optional props:
 *   cardState  — warm/active/cold lifecycle from the feed window
 *   onPlay     — called when user taps "Judge Now" (feed activates the card)
 *
 * Data source: pass battleId directly if already resolved,
 * or pass battleUrl and the component fetches battleId internally.
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import {
  Loader2,
  Maximize2,
  Volume2,
  VolumeX,
  RotateCcw,
  User,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  InlineBattle,
  type BattleMode,
  type HookInfo,
  type InlineBattleHandle,
} from "@/components/hookfit/InlineBattle";
import { preloadImage } from "@/lib/imagePreloadCache";
import { getSessionId } from "@/lib/sessionId";
import type { CardState } from "@/components/songfit/useCardLifecycle";
import { ReactionPanel } from "@/components/lyric/ReactionPanel";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import type { LyricDancePlayer } from "@/engine/LyricDancePlayer";

type BattleState = "cover" | "round-1" | "round-2" | "vote" | "results";

interface BattleEmbedProps {
  // Data — pass battleId directly OR battleUrl for internal resolution
  battleId?: string | null;
  battleUrl: string;

  // Display
  songTitle: string;
  showSplitCover?: boolean; // true = feed split-screen labels; false = fullscreen dark overlay
  showExpandButton?: boolean;

  // Feed lifecycle — omit for fullscreen/shareable usage
  cardState?: CardState;
  onPlay?: () => void;
  onDeactivate?: () => void;

  // Pre-existing vote state (from feed post data)
  initialVotedSide?: "a" | "b" | null;

  // Profile header (reels mode)
  reelsMode?: boolean;
  avatarUrl?: string | null;
  displayName?: string;
  isVerified?: boolean;
  onProfileClick?: () => void;
}

function BattleEmbedInner({
  battleId: propBattleId,
  battleUrl,
  songTitle,
  showSplitCover = false,
  showExpandButton = true,
  cardState,
  onPlay,
  onDeactivate,
  initialVotedSide,
  reelsMode,
  avatarUrl,
  displayName,
  isVerified,
  onProfileClick,
}: BattleEmbedProps) {
  const isFeedEmbed = cardState !== undefined;
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;

  // ── Resolved IDs ───────────────────────────────────────────
  const [resolvedBattleId, setResolvedBattleId] = useState<string | null>(
    propBattleId ?? null,
  );
  const [hookPhrase, setHookPhrase] = useState<string | null>(null);
  const [loading, setLoading] = useState(!propBattleId);
  const [error, setError] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageReady, setCoverImageReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  // Resolve battleId from battleUrl if not passed directly
  useEffect(() => {
    if (propBattleId) return;
    const segments = battleUrl.replace(/^\//, "").split("/").filter(Boolean);
    if (segments.length < 3) {
      setError(true);
      setLoading(false);
      return;
    }
    const [artistSlug, songSlug, hookSlug] = segments;
    supabase
      .from("shareable_hooks" as any)
      .select("battle_id, hook_phrase")
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .eq("hook_slug", hookSlug)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data || !(data as any).battle_id) {
          setError(true);
          setLoading(false);
          return;
        }
        setResolvedBattleId((data as any).battle_id);
        setHookPhrase((data as any).hook_phrase || null);
        setLoading(false);
      });
  }, [propBattleId, battleUrl]);

  // ── Early cover image fetch — runs before InlineBattle mounts ──
  useEffect(() => {
    if (!resolvedBattleId) return;
    let cancelled = false;
    setCoverImageUrl(null);
    setCoverImageReady(false);

    (async () => {
      const { data: hooks } = await supabase
        .from("shareable_hooks" as any)
        .select("artist_slug, song_slug")
        .eq("battle_id", resolvedBattleId)
        .limit(1);

      if (cancelled || !hooks || hooks.length === 0) return;
      const { artist_slug, song_slug } = hooks[0] as any;

      const { data: dance } = await supabase
        .from("shareable_lyric_dances" as any)
        .select("section_images")
        .eq("artist_slug", artist_slug)
        .eq("song_slug", song_slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const firstImg = (dance as any)?.section_images?.[0];
      if (firstImg) {
        setCoverImageUrl(firstImg);
        preloadImage(firstImg).then(() => {
          if (!cancelled) setCoverImageReady(true);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedBattleId]);

  useEffect(() => {
    if (!coverImageUrl) {
      setCoverImageReady(false);
      return;
    }

    let cancelled = false;
    preloadImage(coverImageUrl).then(() => {
      if (!cancelled) setCoverImageReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [coverImageUrl]);

  // ── Battle state machine ────────────────────────────────────
  const [battleState, setBattleState] = useState<BattleState>("cover");
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(
    initialVotedSide ?? null,
  );
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [replayingSide, setReplayingSide] = useState<"a" | "b" | null>(null);
  const [roundProgress, setRoundProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPlayer, setPanelPlayer] = useState<LyricDancePlayer | null>(null);
  const [resultsTab, setResultsTab] = useState<"a" | "b">("a");
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [reactionData, setReactionData] = useState<
    Record<string, { line: Record<number, number>; total: number }>
  >({});
  const [hookALines, setHookALines] = useState<any[]>([]);
  const [hookBLines, setHookBLines] = useState<any[]>([]);
  const [danceData, setDanceData] = useState<{ id: string } | null>(null);

  const progressTimerRef = useRef<number>(0);
  const roundStartRef = useRef<number>(0);
  const hookEndFiredA = useRef(false);
  const hookEndFiredB = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inlineBattleRef = useRef<InlineBattleHandle>(null);
  const stopAtSecRef = useRef<number | null>(null);

  // Reset to cover when feed card transitions FROM active TO non-active.
  // Only fires on transition — not continuously while warm/cold.
  // Without this guard, setPanelOpen(false) runs every render and prevents
  // the 🔥 reaction panel from opening on warm cards.
  const prevCardStateRef = useRef(cardState);
  useEffect(() => {
    const prev = prevCardStateRef.current;
    prevCardStateRef.current = cardState;

    // Only reset when transitioning away from active
    if (!isFeedEmbed || cardState === "active" || prev !== "active") return;

    setBattleState("cover");
    setReplayingSide(null);
    setPanelOpen(false);
    setMuted(true);
    if (cardState === "cold") {
      setEngineReady(false);
    }
  }, [isFeedEmbed, cardState]);

  // ── Viewport detection: deactivate when scrolled out of view ──
  // Matches In Studio behavior via IntersectionObserver.
  // Without this, a battle card can play audio while off-screen.
  useEffect(() => {
    if (!isFeedEmbed) return;
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting) {
          onDeactivateRef.current?.();
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isFeedEmbed]);

  // ── Early vote check — runs before InlineBattle mounts ────
  useEffect(() => {
    if (!resolvedBattleId) return;
    let cancelled = false;

    (async () => {
      // 1. Fetch hook IDs + vote counts for this battle
      const { data: hooks } = await supabase
        .from("shareable_hooks" as any)
        .select("id, battle_position, vote_count")
        .eq("battle_id", resolvedBattleId)
        .order("battle_position", { ascending: true });

      if (cancelled || !hooks || hooks.length === 0) return;

      const rawHooks = hooks as any[];
      const a =
        rawHooks.find((h: any) => h.battle_position === 1) || rawHooks[0];
      const b = rawHooks.find((h: any) => h.id !== a.id) || null;

      // 2. Check for existing vote
      const sessionId = getSessionId();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      userIdRef.current = u?.id ?? null;

      let query = supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", resolvedBattleId);
      if (u?.id) query = query.eq("user_id", u.id);
      else query = query.eq("session_id", sessionId);

      const { data: vote } = await query.maybeSingle();
      if (cancelled || !vote) return;

      // 3. Set voted state + counts
      const side: "a" | "b" = (vote as any).hook_id === a.id ? "a" : "b";
      setVotedSide(side);
      setVoteCountA(a.vote_count || 0);
      if (b) setVoteCountB(b.vote_count || 0);
      // For feed embeds, keep cover visible — InlineBattle isn't mounted yet
      // (it needs cardState === "active" which only happens on user tap).
      // For fullscreen/shareable, skip cover since InlineBattle is always mounted.
      if (!isFeedEmbed) {
        setBattleState("results");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedBattleId]);

  // ── Hooks loaded ────────────────────────────────────────────
  const handleHooksLoaded = useCallback(
    (a: HookInfo, b: HookInfo | null) => {
      setHookA(a);
      setHookB(b);
      setVoteCountA(a.vote_count || 0);
      if (b) setVoteCountB(b.vote_count || 0);
      if (!hookPhrase) setHookPhrase(a.hook_phrase || b?.hook_phrase || null);

      // Fetch lyrics for results panel
      supabase
        .from("shareable_lyric_dances" as any)
        .select("id, lyrics")
        .eq("artist_slug", a.artist_slug)
        .eq("song_slug", a.song_slug)
        .maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data?.id) setDanceData({ id: data.id });
          if (!data?.lyrics) return;
          const lyrics = data.lyrics as any[];
          const indexed = lyrics.map((l: any, i: number) => ({
            ...l,
            lineIndex: i,
          }));
          setHookALines(
            indexed.filter(
              (l: any) =>
                l.start < a.hook_end + 0.3 && l.end > a.hook_start - 0.3,
            ),
          );
          if (b)
            setHookBLines(
              indexed.filter(
                (l: any) =>
                  l.start < b.hook_end + 0.3 && l.end > b.hook_start - 0.3,
              ),
            );
        });

      if (!resolvedBattleId || votedSide) return;
      (async () => {
        const sessionId = getSessionId();
        const {
          data: { user: u },
        } = await supabase.auth.getUser();
        userIdRef.current = u?.id ?? null;
        let query = supabase
          .from("hook_votes" as any)
          .select("hook_id")
          .eq("battle_id", resolvedBattleId);
        if (u?.id) query = query.eq("user_id", u.id);
        else query = query.eq("session_id", sessionId);
        const { data: vote } = await query.maybeSingle();
        if (vote) {
          setVotedSide((vote as any).hook_id === a.id ? "a" : "b");
          if (!isFeedEmbed) {
            setBattleState("results");
          }
        }
      })();
    },
    [resolvedBattleId, hookPhrase, votedSide],
  );

  // ── Auto-advance after hook ends ────────────────────────────
  useEffect(() => {
    if (battleState !== "round-1" || !hookA || hookEndFiredA.current) return;
    const timer = setTimeout(
      () => {
        hookEndFiredA.current = true;
        setBattleState("round-2");
      },
      (hookA.hook_end - hookA.hook_start) * 1000 + 300,
    );
    return () => clearTimeout(timer);
  }, [battleState, hookA]);

  useEffect(() => {
    if (battleState !== "round-2" || !hookB || hookEndFiredB.current) return;
    const timer = setTimeout(
      () => {
        hookEndFiredB.current = true;
        // Already voted → return to cover. Not voted → show vote screen.
        setBattleState(votedSide ? "cover" : "vote");
        if (votedSide) setMuted(true);
      },
      (hookB.hook_end - hookB.hook_start) * 1000 + 300,
    );
    return () => clearTimeout(timer);
  }, [battleState, hookB, votedSide]);

  // ── Vote ────────────────────────────────────────────────────
  const handleVote = useCallback(
    async (side: "a" | "b") => {
      if (!hookA || !resolvedBattleId || battleState !== "vote") return;
      const hookId = side === "a" ? hookA.id : hookB?.id;
      if (!hookId) return;
      setVotedSide(side);
      if (side === "a") setVoteCountA((v) => v + 1);
      else setVoteCountB((v) => v + 1);
      setBattleState("results");
      setReplayingSide(side);
      setMuted(false);
      const sessionId = getSessionId();
      if (userIdRef.current === undefined) {
        const {
          data: { user: u },
        } = await supabase.auth.getUser();
        userIdRef.current = u?.id ?? null;
      }
      await supabase.from("hook_votes" as any).insert({
        battle_id: resolvedBattleId,
        hook_id: hookId,
        user_id: userIdRef.current || null,
        session_id: sessionId,
      });
    },
    [hookA, hookB, resolvedBattleId, battleState],
  );

  // ── Poll vote counts on results ─────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !hookA || !resolvedBattleId) return;
    const poll = async () => {
      const { data } = await supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", resolvedBattleId);
      if (!data) return;
      const votes = data as any[];
      setVoteCountA(votes.filter((v) => v.hook_id === hookA.id).length);
      setVoteCountB(votes.filter((v) => v.hook_id === hookB?.id).length);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [battleState, hookA, hookB, resolvedBattleId]);

  // ── Derived values ──────────────────────────────────────────
  const totalVotes = voteCountA + voteCountB;
  const pctA =
    totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const pctB =
    totalVotes > 0 ? Math.round((voteCountB / totalVotes) * 100) : 50;
  const battleMode: BattleMode = useMemo(() => {
    switch (battleState) {
      case "cover":
        return "dark";
      case "round-1":
        return "listen-a";
      case "round-2":
        return "listen-b";
      case "vote":
        return "judgment";
      case "results":
        return "scorecard";
    }
  }, [battleState]);

  const activePlaying: "a" | "b" | null = useMemo(() => {
    if (isFeedEmbed && cardState !== "active") return null;
    switch (battleState) {
      case "cover":
        return null;
      case "round-1":
        return "a";
      case "round-2":
        return "b";
      case "vote":
        return null;
      case "results":
        return replayingSide ?? votedSide ?? "a";
    }
  }, [isFeedEmbed, cardState, battleState, replayingSide, votedSide]);

  const panelActiveLine = useMemo(() => {
    const lines = resultsTab === "a" ? hookALines : hookBLines;
    const line =
      lines.find(
        (l: any) => currentTimeSec >= l.start && currentTimeSec < l.end + 0.1,
      ) ?? null;
    if (!line) return null;
    return { text: line.text, lineIndex: line.lineIndex, sectionLabel: null };
  }, [currentTimeSec, resultsTab, hookALines, hookBLines]);

  // ── Progress bar timer ──────────────────────────────────────
  // Determine which side is actively playing audio (rounds or results focus)
  const progressSide: "a" | "b" | null = useMemo(() => {
    if (battleState === "round-1") return "a";
    if (battleState === "round-2") return "b";
    if (battleState === "results" && activePlaying) return activePlaying;
    return null;
  }, [battleState, activePlaying]);

  useEffect(() => {
    if (!progressSide) {
      setRoundProgress(0);
      if (progressTimerRef.current)
        cancelAnimationFrame(progressTimerRef.current);
      return;
    }
    const hook = progressSide === "a" ? hookA : hookB;
    const hookDuration = hook ? hook.hook_end - hook.hook_start : 10;
    roundStartRef.current = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - roundStartRef.current) / 1000;
      // In results, loop the progress bar; in rounds, clamp at 1
      const p =
        battleState === "results"
          ? (elapsed % hookDuration) / hookDuration
          : Math.min(1, elapsed / hookDuration);
      setRoundProgress(p);
      progressTimerRef.current = requestAnimationFrame(tick);
    };
    progressTimerRef.current = requestAnimationFrame(tick);
    return () => {
      if (progressTimerRef.current)
        cancelAnimationFrame(progressTimerRef.current);
    };
  }, [progressSide, hookA, hookB, battleState]);

  // ── Track audio time for reaction panel ──
  useEffect(() => {
    if (!panelOpen || !panelPlayer) return;
    const audio = panelPlayer.audio;
    let rafId = 0;
    const lastRef = { t: 0 };
    const tick = () => {
      const t = audio.currentTime;
      if (Math.abs(t - lastRef.t) > 0.05) {
        lastRef.t = t;
        setCurrentTimeSec(t);
      }
      // Single-line playback: pause when we reach the stop point
      if (stopAtSecRef.current !== null && t >= stopAtSecRef.current) {
        stopAtSecRef.current = null;
        audio.pause();
        panelPlayer?.pause?.();
        return; // don't schedule next tick — audio is paused
      }
      if (!audio.paused && !document.hidden)
        rafId = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(rafId);
      rafId = 0;
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    setCurrentTimeSec(audio.currentTime);
    if (!audio.paused) rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [panelOpen, panelPlayer]);

  const handleTileTap = useCallback(
    (side: "a" | "b") => {
      if (battleState !== "results") return;
      stopAtSecRef.current = null; // clear single-line stop
      const currentSide = replayingSide ?? votedSide ?? "a";
      if (side === currentSide) {
        setMuted((prev) => !prev);
      } else {
        setReplayingSide(side);
        setMuted(false);
      }
    },
    [battleState, replayingSide, votedSide],
  );

  // ── Error fallback ──────────────────────────────────────────
  if (error) {
    return (
      <a
        href={battleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block mx-3 my-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 text-center"
      >
        <p className="text-sm font-semibold text-white/80">{songTitle}</p>
        <p className="text-xs text-white/40 mt-1">Tap to watch hook battle →</p>
      </a>
    );
  }

  // ── Cover area background ───────────────────────────────────
  // No static images — canvas is the background.
  // Split-screen labels still shown over canvas during cover state.
  const CoverBackground = () => (
    <>
      {showSplitCover && battleState === "cover" && !votedSide && (
        <div className="absolute inset-0 flex pointer-events-none">
          <div className="relative flex-1 overflow-hidden">
            {hookA && (
              <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">
                  Left Hook
                </span>
              </div>
            )}
          </div>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/15 z-10" />
          <div className="relative flex-1 overflow-hidden">
            {hookB && (
              <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">
                  Right Hook
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {/* Canvas area */}
      <div
        className="absolute inset-0 overflow-hidden"
        onClick={() => {
          if (battleState === "round-1" || battleState === "round-2") {
            setMuted((prev) => !prev);
          }
        }}
      >
        <CoverBackground />

        {/* Loading spinner */}
        {(loading || !resolvedBattleId) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center space-y-2">
              <Loader2
                size={20}
                className="animate-spin text-muted-foreground mx-auto"
              />
              <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                Loading battle…
              </p>
            </div>
          </div>
        )}

        {/* InlineBattle canvas — always mounted when data ready, pauses when inactive */}
        {resolvedBattleId && (
          <div
            className="absolute inset-0"
            style={{ transition: "opacity 0.4s ease" }}
          >
            <InlineBattle
              ref={inlineBattleRef}
              battleId={resolvedBattleId}
              mode={battleMode}
              activePlaying={activePlaying}
              votedSide={votedSide}
              voteCount={
                votedSide === "a"
                  ? voteCountA
                  : votedSide === "b"
                    ? voteCountB
                    : undefined
              }
              votePct={
                votedSide === "a" ? pctA : votedSide === "b" ? pctB : undefined
              }
              onTileTap={handleTileTap}
              onHooksLoaded={handleHooksLoaded}
              onCoverImage={(url) => {
                if (!coverImageUrl) setCoverImageUrl(url);
              }}
              forceMuted={muted}
              onEngineReady={() => {
                setEngineReady(true);
                setPanelPlayer(inlineBattleRef.current?.getPlayer() ?? null);
              }}
              cardState={isFeedEmbed ? cardState : "active"}
            />
          </div>
        )}

        {/* Cover overlay — matches In Studio layered style */}
        <AnimatePresence>
          {battleState === "cover" && !error && (
            <motion.div
              key="battle-cover"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 top-0 z-20 flex flex-col items-center justify-center overflow-hidden"
              style={{ bottom: isFeedEmbed ? 48 : 52 }}
            >
              {coverImageUrl && (
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(${coverImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(8px) saturate(0.5)",
                    transform: "scale(1.08)",
                    opacity: engineReady ? 0 : coverImageReady ? 1 : 0,
                  }}
                />
              )}

              <div
                className="absolute inset-0 transition-opacity duration-700"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%)",
                  opacity: engineReady ? 0.7 : 1,
                }}
              />

              {showExpandButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(battleUrl, "_blank");
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white/30 hover:text-white/60 transition-colors z-10"
                >
                  <Maximize2 size={12} />
                </button>
              )}
              <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-2 w-32 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-10 w-36 rounded-lg bg-white/[0.04] animate-pulse" />
                  </div>
                ) : votedSide ? (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">
                      {songTitle}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay?.();
                        setBattleState("round-1");
                        setMuted(false);
                        hookEndFiredA.current = false;
                        hookEndFiredB.current = false;
                      }}
                      className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Replay Feud
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">
                      Which {songTitle} hook hits harder?
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay?.();
                        setBattleState("round-1");
                        setMuted(false);
                        hookEndFiredA.current = false;
                        hookEndFiredB.current = false;
                      }}
                      className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Settle Feud
                    </button>
                    <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mt-3">
                      2 rounds · 10 seconds each
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Round 2 preview label */}
        <AnimatePresence>
          {battleState === "round-1" && (
            <motion.div
              key="r2-preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 right-[12.5%] z-10 pointer-events-none"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">
                Round 2
              </span>
            </motion.div>
          )}
          {battleState === "round-2" && (
            <motion.div
              key="r1-done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 left-[12.5%] z-10 pointer-events-none"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">
                ✓
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Vote prompt */}
        <AnimatePresence>
          {battleState === "vote" && (
            <motion.div
              key="vote-prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-12 flex justify-center z-20 pointer-events-none"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
                Your Verdict
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {battleState !== "cover" && hookA && (
          <div
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-2 pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            <span />
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded px-1 py-0.5 pointer-events-auto">
              <button
                onClick={() => {
                  stopAtSecRef.current = null;
                  setMuted((prev) => !prev);
                }}
                className="p-1 text-white/40 hover:text-white/70 transition-colors"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBattleState("cover");
                  setMuted(true);
                  hookEndFiredA.current = false;
                  hookEndFiredB.current = false;
                }}
                className="p-1 text-white/40 hover:text-white/70 transition-colors"
                aria-label="Restart"
              >
                <RotateCcw size={14} />
              </button>
              {showExpandButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(battleUrl, "_blank");
                  }}
                  className="p-1 text-white/40 hover:text-white/70 transition-colors"
                  aria-label="Expand"
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar — always rendered for opaque background fill. z-20 sits behind panel's z-400. */}
      <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{
            background: "#0a0a0a",
            ...(!isFeedEmbed
              ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" }
              : {}),
          }}
        >
          {/* Profile header — reels mode, matches In Studio position */}
          {reelsMode && displayName && battleState === "cover" && !panelOpen && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div
                className="relative shrink-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick?.();
                }}
              >
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={13} className="text-white/40" />
                  )}
                </div>
                {isVerified && (
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <VerifiedBadge size={11} />
                  </span>
                )}
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-green-400 min-w-0 truncate max-w-[60vw]">
                {`FMLY Feud · ${displayName}`}
              </span>
            </div>
          )}

          {/* Progress bar — half-width, aligned to the active tile's side */}
          {progressSide && (
            <div className="relative w-full h-[2px] bg-white/[0.06]">
              <motion.div
                className="absolute top-0 h-full"
                style={{
                  left: progressSide === "a" ? 0 : "50%",
                  width: "50%",
                }}
                transition={{ duration: 0 }}
              >
                <div
                  className="h-full"
                  style={{
                    background:
                      (progressSide === "a"
                        ? hookA?.palette?.[0]
                        : hookB?.palette?.[0]) ?? "#22c55e",
                    width: `${roundProgress * 100}%`,
                  }}
                />
              </motion.div>
            </div>
          )}
          <div className={isFeedEmbed ? undefined : "w-full max-w-2xl mx-auto"}>
            {/* Pre-vote: Left Hook / Right Hook disabled + 🔥 disabled */}
            {!votedSide &&
              (battleState === "round-1" ||
                battleState === "round-2" ||
                battleState === "cover") && (
                <div
                  className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"} opacity-30 pointer-events-none`}
                >
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white">
                      Left Hook
                    </span>
                  </div>
                  <div
                    style={{ width: "0.5px" }}
                    className="bg-white/[0.06] self-stretch my-2"
                  />
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white">
                      Right Hook
                    </span>
                  </div>
                  <div
                    style={{ width: "0.5px" }}
                    className="bg-white/[0.06] self-stretch my-2"
                  />
                  <div className="flex items-center justify-center px-4 min-w-[64px]">
                    <span className="text-[13px]" style={{ opacity: 0.4 }}>
                      🔥
                    </span>
                  </div>
                </div>
              )}

            {/* Vote: Left Hook / Right Hook active, 🔥 disabled */}
            {battleState === "vote" && (
              <div
                className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handleVote("a")}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white">
                    Left Hook
                  </span>
                </button>
                <div
                  style={{ width: "0.5px" }}
                  className="bg-white/[0.06] self-stretch my-2"
                />
                <button
                  onClick={() => handleVote("b")}
                  className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white">
                    Right Hook
                  </span>
                </button>
                <div
                  style={{ width: "0.5px" }}
                  className="bg-white/[0.06] self-stretch my-2"
                />
                <div className="flex items-center justify-center px-4 min-w-[64px] opacity-25 pointer-events-none">
                  <span className="text-[13px]">🔥</span>
                </div>
              </div>
            )}

            {/* Results panel closed: social proof + 🔥 */}
            {!!votedSide && battleState !== "vote" && !panelOpen && (
              <div
                className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex-1 flex items-center px-3 overflow-hidden min-w-0">
                  <span className="text-[9px] font-mono tracking-[0.08em] text-white/60 truncate">
                    {(() => {
                      const total = totalVotes;
                      const userPick =
                        votedSide === "a" ? "LEFT HOOK" : "RIGHT HOOK";
                      const winnerCount =
                        votedSide === "a" ? voteCountA : voteCountB;
                      const loserCount = total - winnerCount;
                      const majorityAgrees =
                        (votedSide === "a" && pctA >= 50) ||
                        (votedSide === "b" && pctB >= 50);
                      const isSplit = pctA === 50 && pctB === 50;
                      if (total < 20)
                        return `FMLY STILL VOTING · ${winnerCount} / ${total} ${userPick}`;
                      if (isSplit)
                        return `FMLY IS SPLIT · ${voteCountA} / ${voteCountB}`;
                      return majorityAgrees
                        ? `FMLY AGREES · ${winnerCount} / ${total} ${userPick}`
                        : `FMLY DISAGREES · ${loserCount} / ${total} NOT ${userPick}`;
                    })()}
                  </span>
                </div>
                <div
                  style={{ width: "0.5px" }}
                  className="bg-white/[0.06] self-stretch my-2"
                />
                <button
                  onClick={() => {
                    const opening = !panelOpen;
                    setPanelOpen(opening);
                    if (opening) {
                      onPlay?.();
                      // Unmute so handleLineTap's player.audio.play() produces sound
                      const p = inlineBattleRef.current?.getPlayer();
                      if (p) p.audio.muted = false;
                      setMuted(false);
                    }
                  }}
                  className="flex items-center justify-center gap-1 px-4 min-w-[64px] py-3 hover:bg-white/[0.04] transition-colors group shrink-0 focus:outline-none"
                >
                  {panelOpen ? (
                    <X
                      size={14}
                      className="text-white/30 group-hover:text-white/60 transition-colors"
                    />
                  ) : (
                    <>
                      <span
                        className="text-[13px] leading-none"
                        style={{ opacity: 0.7 }}
                      >
                        🔥
                      </span>
                      {voteCountA + voteCountB > 0 && (
                        <span className="text-[9px] font-mono text-white/15 group-hover:text-white/40 transition-colors">
                          {voteCountA + voteCountB}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

      <ReactionPanel
        displayMode={reelsMode ? "fullscreen" : isFeedEmbed ? "embedded" : "fullscreen"}
        maxHeight={isFeedEmbed && !reelsMode ? "calc(100% - 44px)" : undefined}
        isOpen={panelOpen && !!votedSide && battleState !== "vote"}
        onClose={() => setPanelOpen(false)}
        danceId={danceData?.id ?? ""}
        activeLine={panelActiveLine}
        allLines={(resultsTab === "a" ? hookALines : hookBLines).map(
          (l: any) => ({
            text: l.text,
            lineIndex: l.lineIndex,
            startSec: l.start,
            endSec: l.end,
            sectionLabel: null,
          }),
        )}
        audioSections={[]}
        currentTimeSec={currentTimeSec}
        palette={
          (resultsTab === "a" ? hookA : hookB)?.palette ?? [
            "#22c55e",
            "#22c55e",
            "#ffffff",
          ]
        }
        onSeekTo={(sec) => {
          // Fallback — only called if player prop is null (shouldn't happen in practice)
          const p = inlineBattleRef.current?.getPlayer();
          if (!p) return;
          p.audio.muted = false;
          setMuted(false);
          p.seek(sec);
          if (p.audio.paused) {
            p.audio.play().catch(() => {});
            p.startRendering();
          }
          setReplayingSide(resultsTab);
        }}
        player={panelPlayer}
        durationSec={
          resultsTab === "a" && hookA
            ? hookA.hook_end - hookA.hook_start
            : hookB
              ? hookB.hook_end - hookB.hook_start
              : 10
        }
        reactionData={reactionData}
        onReactionDataChange={setReactionData}
        onReactionFired={(emoji) => panelPlayer?.fireComment?.(emoji)}
        onPause={() => panelPlayer?.pause?.()}
        onResume={() => {
          if (panelPlayer?.audio?.paused) {
            panelPlayer.audio.play().catch(() => {});
            panelPlayer.startRendering();
          }
        }}
        renderBottomBar={(onClose) => (
          <div
            className="shrink-0 flex"
            style={{
              background: "#0a0a0a",
              borderTop: "0.5px solid rgba(255,255,255,0.06)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div
              className={`w-full ${isFeedEmbed ? "" : "max-w-2xl mx-auto"} flex items-stretch`}
              style={{ height: isFeedEmbed ? 48 : 52 }}
            >
              <button
                onClick={() => {
                  stopAtSecRef.current = null;
                  setResultsTab("a");
                  setReplayingSide("a");
                  setMuted(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors ${resultsTab === "a" ? "text-white" : "text-white/30 hover:text-white/60"}`}
              >
                {votedSide === "a" && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6.5L4.5 9L10 3"
                      stroke="#22c55e"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span className="text-[11px] font-mono tracking-[0.15em] uppercase">
                  Left Hook
                </span>
                {voteCountA > 0 && (
                  <span className="text-[9px] font-mono text-white/25">
                    {voteCountA}
                  </span>
                )}
              </button>
              <div
                style={{ width: "0.5px" }}
                className="bg-white/[0.06] self-stretch my-2"
              />
              <button
                onClick={() => {
                  stopAtSecRef.current = null;
                  setResultsTab("b");
                  setReplayingSide("b");
                  setMuted(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors ${resultsTab === "b" ? "text-white" : "text-white/30 hover:text-white/60"}`}
              >
                {votedSide === "b" && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6.5L4.5 9L10 3"
                      stroke="#22c55e"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span className="text-[11px] font-mono tracking-[0.15em] uppercase">
                  Right Hook
                </span>
                {voteCountB > 0 && (
                  <span className="text-[9px] font-mono text-white/25">
                    {voteCountB}
                  </span>
                )}
              </button>
              <div
                style={{ width: "0.5px" }}
                className="bg-white/[0.06] self-stretch my-2"
              />
              <button
                onClick={onClose}
                className="group flex items-center justify-center min-w-[64px] px-4 py-3 hover:bg-white/[0.04] transition-colors focus:outline-none shrink-0"
              >
                <X
                  size={14}
                  className="text-white/30 group-hover:text-white/60 transition-colors"
                />
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}

export const BattleEmbed = memo(BattleEmbedInner);
