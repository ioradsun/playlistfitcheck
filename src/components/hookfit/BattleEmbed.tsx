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
import { Loader2, Maximize2, Volume2, VolumeX, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { InlineBattle, type BattleMode, type HookInfo } from "@/components/hookfit/InlineBattle";
import { preloadImage } from "@/lib/imagePreloadCache";
import { CardBottomBar } from "@/components/songfit/CardBottomBar";
import { getSessionId } from "@/lib/sessionId";
import type { CardState } from "@/components/songfit/useCardLifecycle";

type BattleState = "cover" | "round-1" | "round-2" | "vote" | "results";
const EMOJI_OPTIONS = ["🔥", "💀", "🫠", "👑", "💜", "😤"];

interface BattleEmbedProps {
  // Data — pass battleId directly OR battleUrl for internal resolution
  battleId?: string | null;
  battleUrl: string;

  // Display
  songTitle: string;
  showSplitCover?: boolean;   // true = feed split-screen labels; false = fullscreen dark overlay
  showExpandButton?: boolean;

  // Feed lifecycle — omit for fullscreen/shareable usage
  cardState?: CardState;
  onPlay?: () => void;
  onDeactivate?: () => void;

  // Pre-existing vote state (from feed post data)
  initialVotedSide?: "a" | "b" | null;
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
}: BattleEmbedProps) {
  const isFeedEmbed = cardState !== undefined;
  const onDeactivateRef = useRef(onDeactivate);
  onDeactivateRef.current = onDeactivate;

  // ── Resolved IDs ───────────────────────────────────────────
  const [resolvedBattleId, setResolvedBattleId] = useState<string | null>(propBattleId ?? null);
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
    if (segments.length < 3) { setError(true); setLoading(false); return; }
    const [artistSlug, songSlug, hookSlug] = segments;
    supabase
      .from("shareable_hooks" as any)
      .select("battle_id, hook_phrase")
      .eq("artist_slug", artistSlug)
      .eq("song_slug", songSlug)
      .eq("hook_slug", hookSlug)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data || !(data as any).battle_id) { setError(true); setLoading(false); return; }
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
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(initialVotedSide ?? null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [replayingSide, setReplayingSide] = useState<"a" | "b" | null>(null);
  const [roundProgress, setRoundProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resultsTab, setResultsTab] = useState<"a" | "b">("a");
  const [lineReactions, setLineReactions] = useState<Record<string, string>>({});
  const [activeEmojiLine, setActiveEmojiLine] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; text: string; voted_side: string; created_at: string }>>([]);
  const [hookALines, setHookALines] = useState<any[]>([]);
  const [hookBLines, setHookBLines] = useState<any[]>([]);

  const progressTimerRef = useRef<number>(0);
  const roundStartRef = useRef<number>(0);
  const hookEndFiredA = useRef(false);
  const hookEndFiredB = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset to cover when feed card is deactivated (matches In Studio behavior)
  useEffect(() => {
    if (isFeedEmbed && cardState !== "active") {
      setBattleState("cover");
      setReplayingSide(null);
      setPanelOpen(false);
      setMuted(true);
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
      const a = rawHooks.find((h: any) => h.battle_position === 1) || rawHooks[0];
      const b = rawHooks.find((h: any) => h.id !== a.id) || null;

      // 2. Check for existing vote
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
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

    return () => { cancelled = true; };
  }, [resolvedBattleId]);

  // ── Hooks loaded ────────────────────────────────────────────
  const handleHooksLoaded = useCallback((a: HookInfo, b: HookInfo | null) => {
    setHookA(a);
    setHookB(b);
    setVoteCountA(a.vote_count || 0);
    if (b) setVoteCountB(b.vote_count || 0);
    if (!hookPhrase) setHookPhrase(a.hook_phrase || b?.hook_phrase || null);

    // Fetch lyrics for results panel
    supabase
      .from("shareable_lyric_dances" as any)
      .select("lyrics")
      .eq("artist_slug", a.artist_slug)
      .eq("song_slug", a.song_slug)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (!data?.lyrics) return;
        const lyrics = data.lyrics as any[];
        setHookALines(lyrics.filter((l: any) => l.start >= a.hook_start - 0.3 && l.end <= a.hook_end + 0.3));
        if (b) setHookBLines(lyrics.filter((l: any) => l.start >= b.hook_start - 0.3 && l.end <= b.hook_end + 0.3));
      });

    if (!resolvedBattleId || votedSide) return;
    (async () => {
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;
      let query = supabase.from("hook_votes" as any).select("hook_id").eq("battle_id", resolvedBattleId);
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
  }, [resolvedBattleId, hookPhrase, votedSide]);

  // ── Auto-advance after hook ends ────────────────────────────
  useEffect(() => {
    if (battleState !== "round-1" || !hookA || hookEndFiredA.current) return;
    const timer = setTimeout(() => { hookEndFiredA.current = true; setBattleState("round-2"); },
      (hookA.hook_end - hookA.hook_start) * 1000 + 300);
    return () => clearTimeout(timer);
  }, [battleState, hookA]);

  useEffect(() => {
    if (battleState !== "round-2" || !hookB || hookEndFiredB.current) return;
    const timer = setTimeout(() => { hookEndFiredB.current = true; setBattleState("vote"); },
      (hookB.hook_end - hookB.hook_start) * 1000 + 300);
    return () => clearTimeout(timer);
  }, [battleState, hookB]);

  // ── Vote ────────────────────────────────────────────────────
  const handleVote = useCallback(async (side: "a" | "b") => {
    if (!hookA || !resolvedBattleId || battleState !== "vote") return;
    const hookId = side === "a" ? hookA.id : hookB?.id;
    if (!hookId) return;
    setVotedSide(side);
    if (side === "a") setVoteCountA(v => v + 1); else setVoteCountB(v => v + 1);
    setBattleState("results");
    setMuted(true);
    const sessionId = getSessionId();
    if (userIdRef.current === undefined) {
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;
    }
    await supabase.from("hook_votes" as any).insert({
      battle_id: resolvedBattleId, hook_id: hookId,
      user_id: userIdRef.current || null, session_id: sessionId,
    });
  }, [hookA, hookB, resolvedBattleId, battleState]);

  // ── Poll vote counts on results ─────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !hookA || !resolvedBattleId) return;
    const poll = async () => {
      const { data } = await supabase.from("hook_votes" as any).select("hook_id").eq("battle_id", resolvedBattleId);
      if (!data) return;
      const votes = data as any[];
      setVoteCountA(votes.filter(v => v.hook_id === hookA.id).length);
      setVoteCountB(votes.filter(v => v.hook_id === hookB?.id).length);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [battleState, hookA, hookB, resolvedBattleId]);

  // ── Comments on results ─────────────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !resolvedBattleId) return;
    const fetch = async () => {
      const { data } = await supabase.from("battle_comments" as any)
        .select("id, text, voted_side, created_at")
        .eq("battle_id", resolvedBattleId)
        .order("created_at", { ascending: false }).limit(50);
      if (data) setComments(data as any[]);
    };
    fetch();
    const interval = setInterval(fetch, 8000);
    return () => clearInterval(interval);
  }, [battleState, resolvedBattleId]);

  const submitComment = useCallback(async () => {
    if (!commentInput.trim() || !resolvedBattleId || !votedSide) return;
    setSubmittingComment(true);
    const sessionId = getSessionId();
    const newComment = { battle_id: resolvedBattleId, user_id: userIdRef.current || null, session_id: sessionId, voted_side: votedSide, text: commentInput.trim() };
    setComments(prev => [{ ...newComment, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...prev]);
    setCommentInput("");
    await supabase.from("battle_comments" as any).insert(newComment);
    setSubmittingComment(false);
  }, [commentInput, resolvedBattleId, votedSide]);

  // ── Line reactions ──────────────────────────────────────────
  const toggleLineReaction = useCallback((side: "a" | "b", lineIndex: number, emoji: string) => {
    const key = `${side}-${lineIndex}`;
    setLineReactions(prev => { const next = { ...prev }; if (next[key] === emoji) delete next[key]; else next[key] = emoji; return next; });
    setActiveEmojiLine(null);
  }, []);

  // ── Derived values ──────────────────────────────────────────
  const totalVotes = voteCountA + voteCountB;
  const pctA = totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const pctB = totalVotes > 0 ? Math.round((voteCountB / totalVotes) * 100) : 50;
  const canVote = battleState === "vote";

  const battleMode: BattleMode = useMemo(() => {
    switch (battleState) {
      case "cover": return "dark";
      case "round-1": return "listen-a";
      case "round-2": return "listen-b";
      case "vote": return "judgment";
      case "results": return "scorecard";
    }
  }, [battleState]);

  const activePlaying: "a" | "b" | null = useMemo(() => {
    if (isFeedEmbed && cardState !== "active") return null;
    switch (battleState) {
      case "cover": return null;
      case "round-1": return "a";
      case "round-2": return "b";
      case "vote": return null;
      case "results": return replayingSide ?? votedSide ?? "a";
    }
  }, [isFeedEmbed, cardState, battleState, replayingSide, votedSide]);

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
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current);
      return;
    }
    const hook = progressSide === "a" ? hookA : hookB;
    const hookDuration = hook ? hook.hook_end - hook.hook_start : 10;
    roundStartRef.current = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - roundStartRef.current) / 1000;
      // In results, loop the progress bar; in rounds, clamp at 1
      const p = battleState === "results"
        ? (elapsed % hookDuration) / hookDuration
        : Math.min(1, elapsed / hookDuration);
      setRoundProgress(p);
      progressTimerRef.current = requestAnimationFrame(tick);
    };
    progressTimerRef.current = requestAnimationFrame(tick);
    return () => { if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current); };
  }, [progressSide, hookA, hookB, battleState]);

  const handleTileTap = useCallback((side: "a" | "b") => {
    if (battleState !== "results") return;
    setReplayingSide(side);
    setMuted(false);
  }, [battleState]);

  // ── Error fallback ──────────────────────────────────────────
  if (error) {
    return (
      <a href={battleUrl} target="_blank" rel="noopener noreferrer"
        className="block mx-3 my-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4 text-center">
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
      {showSplitCover && battleState === "cover" && (
        <div className="absolute inset-0 flex pointer-events-none">
          <div className="relative flex-1 overflow-hidden">
            {hookA && (
              <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">Left Hook</span>
              </div>
            )}
          </div>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/15 z-10" />
          <div className="relative flex-1 overflow-hidden">
            {hookB && (
              <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">Right Hook</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ── Results panel ───────────────────────────────────────────
  const ResultsPanel = () => (
    <AnimatePresence>
      {panelOpen && !!votedSide && battleState !== "vote" && (
        <>
          <motion.div
            key="take-panel"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`${isFeedEmbed ? "absolute" : "fixed"} inset-x-0 bottom-0 z-[60] rounded-t-2xl overflow-hidden`}
            style={{ background: "#111", maxHeight: isFeedEmbed ? "85%" : "75vh" }}
          >
            <button onClick={() => setPanelOpen(false)} className="w-full flex justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </button>
            <div className="px-4 pb-6 space-y-5 overflow-y-auto" style={{ maxHeight: isFeedEmbed ? "calc(85% - 40px)" : "calc(75vh - 40px)" }}>
              {/* Vote confirmation */}
              <div className="flex items-center justify-center gap-2 pb-2">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.5L4.5 9L10 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[11px] font-mono text-green-400/70 uppercase tracking-wider">
                  You picked {votedSide === "a" ? "Left" : "Right"} Hook · {votedSide === "a" ? voteCountA : voteCountB} FMLY ({votedSide === "a" ? pctA : pctB}%)
                </span>
              </div>

              {/* Hook lines for active tab */}
              {(resultsTab === "a" ? hookALines : hookBLines).length > 0 && (
                <div className="space-y-0.5">
                  {(resultsTab === "a" ? hookALines : hookBLines).map((line: any, i: number) => {
                    const key = `${resultsTab}-${i}`;
                    const reaction = lineReactions[key];
                    const isActive = activeEmojiLine === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setActiveEmojiLine(isActive ? null : key)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${isActive ? "bg-white/[0.06] border border-white/[0.1]" : reaction ? "bg-white/[0.03]" : "hover:bg-white/[0.03]"}`}
                        >
                          <span className="text-[11px] text-white/50 leading-relaxed flex-1 min-w-0">{line.text}</span>
                          {reaction && <span className="text-sm ml-2 shrink-0">{reaction}</span>}
                        </button>
                        <AnimatePresence>
                          {isActive && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="flex items-center justify-center gap-2 py-2">
                                {EMOJI_OPTIONS.map(emoji => (
                                  <button key={emoji} onClick={() => toggleLineReaction(resultsTab, i, emoji)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all ${reaction === emoji ? "bg-white/15 ring-1 ring-white/25 scale-110" : "bg-white/[0.04] hover:bg-white/[0.08]"}`}>
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comments — filtered to active tab's voters */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/25">
                    Takes · {resultsTab === "a" ? "Left Hook" : "Right Hook"}
                  </span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                {comments.filter(c => c.voted_side === resultsTab).length === 0 ? (
                  <p className="text-[10px] font-mono text-white/15 text-center py-3">No takes yet — be first</p>
                ) : (
                  <div className="space-y-2">
                    {comments.filter(c => c.voted_side === resultsTab).map(c => (
                      <div key={c.id} className="flex items-start gap-2 px-2">
                        <p className="text-[11px] text-white/45 leading-relaxed flex-1">{c.text}</p>
                        <span className="text-[9px] font-mono text-white/15 shrink-0">
                          {(() => { const m = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000); if (m < 1) return "now"; if (m < 60) return `${m}m`; return `${Math.floor(m / 60)}h`; })()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${isFeedEmbed ? "absolute" : "fixed"} inset-0 z-[55] bg-black/50`}
            onClick={() => setPanelOpen(false)} />
        </>
      )}
    </AnimatePresence>
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">

      {/* Canvas area */}
      <div
        className="absolute inset-0 overflow-hidden"
        onClick={() => {
          if (battleState === "round-1" || battleState === "round-2") {
            setMuted(prev => !prev);
          }
        }}
      >
        <CoverBackground />

        {/* Loading spinner */}
        {(loading || !resolvedBattleId) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center space-y-2">
              <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
              <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Loading battle…</p>
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
              battleId={resolvedBattleId}
              mode={battleMode}
              activePlaying={activePlaying}
              votedSide={votedSide}
              voteCount={votedSide === "a" ? voteCountA : votedSide === "b" ? voteCountB : undefined}
              votePct={votedSide === "a" ? pctA : votedSide === "b" ? pctB : undefined}
              onTileTap={handleTileTap}
              onHooksLoaded={handleHooksLoaded}
              onCoverImage={(url) => {
                if (!coverImageUrl) setCoverImageUrl(url);
              }}
              forceMuted={muted}
              onEngineReady={() => setEngineReady(true)}
              cardState={isFeedEmbed ? cardState : "active"}
            />
          </div>
        )}


        {/* Cover overlay — matches In Studio layered style */}
        <AnimatePresence>
          {battleState === "cover" && !error && (
            <motion.div
              key="battle-cover"
              initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
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
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%)",
                }}
              />

              {showExpandButton && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(battleUrl, "_blank"); }}
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
                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">{songTitle}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay?.();
                        setBattleState("results");
                        setMuted(true);
                      }}
                      className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Replay Battle
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">Which {songTitle} hook hits harder?</p>
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
            <motion.div key="r2-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 right-[12.5%] z-10 pointer-events-none">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">Round 2</span>
            </motion.div>
          )}
          {battleState === "round-2" && (
            <motion.div key="r1-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 left-[12.5%] z-10 pointer-events-none">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">✓</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Vote prompt */}
        <AnimatePresence>
          {battleState === "vote" && (
            <motion.div key="vote-prompt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-12 flex justify-center z-20 pointer-events-none">
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
                onClick={() => setMuted(prev => !prev)}
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
                  onClick={(e) => { e.stopPropagation(); window.open(battleUrl, "_blank"); }}
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

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{
          background: "#0a0a0a",
          ...(!isFeedEmbed ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : {}),
        }}
      >
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
                  background: (progressSide === "a" ? hookA?.palette?.[0] : hookB?.palette?.[0]) ?? "#22c55e",
                  width: `${roundProgress * 100}%`,
                }}
              />
            </motion.div>
          </div>
        )}
        <div className={isFeedEmbed ? undefined : "w-full max-w-2xl mx-auto"}>

        {/* Pre-vote: Left Hook / Right Hook disabled + 🔥 disabled */}
        {!votedSide && (battleState === "round-1" || battleState === "round-2" || battleState === "cover") && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"} opacity-30 pointer-events-none`}>
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white">Left Hook</span>
            </div>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white">Right Hook</span>
            </div>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <div className="flex items-center justify-center px-4 min-w-[64px]">
              <span className="text-[13px]" style={{ opacity: 0.4 }}>🔥</span>
            </div>
          </div>
        )}

        {/* Vote: Left Hook / Right Hook active, 🔥 disabled */}
        {battleState === "vote" && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleVote("a")}
              className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
            >
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white">
                Left Hook
              </span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <button
              onClick={() => handleVote("b")}
              className="flex-1 flex items-center justify-center py-3 hover:bg-white/[0.04] transition-colors group"
            >
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase text-white group-hover:text-white">
                Right Hook
              </span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <div className="flex items-center justify-center px-4 min-w-[64px] opacity-25 pointer-events-none">
              <span className="text-[13px]">🔥</span>
            </div>
          </div>
        )}

        {/* Results panel closed: social proof + 🔥 */}
        {!!votedSide && battleState !== "vote" && !panelOpen && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 flex items-center px-3 overflow-hidden min-w-0">
              <span className="text-[9px] font-mono tracking-[0.08em] text-white/60 truncate">
                {(() => {
                  const total = totalVotes;
                  const userPick = votedSide === "a" ? "LEFT HOOK" : "RIGHT HOOK";
                  const winnerCount = votedSide === "a" ? voteCountA : voteCountB;
                  const loserCount = total - winnerCount;
                  const majorityAgrees = (votedSide === "a" && pctA >= 50) || (votedSide === "b" && pctB >= 50);
                  const isSplit = pctA === 50 && pctB === 50;
                  if (total < 20) return `FMLY STILL VOTING · ${winnerCount} / ${total} ${userPick}`;
                  if (isSplit) return `FMLY IS SPLIT · ${voteCountA} / ${voteCountB}`;
                  return majorityAgrees
                    ? `FMLY AGREES · ${winnerCount} / ${total} ${userPick}`
                    : `FMLY DISAGREES · ${loserCount} / ${total} NOT ${userPick}`;
                })()}
              </span>
            </div>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <button
              onClick={() => setPanelOpen(true)}
              className="flex items-center justify-center gap-1 px-4 min-w-[64px] py-3 hover:bg-white/[0.04] transition-colors group shrink-0 focus:outline-none"
            >
              <span className="text-[13px] leading-none" style={{ opacity: 0.7 }}>🔥</span>
              {(voteCountA + voteCountB) > 0 && (
                <span className="text-[9px] font-mono text-white/15 group-hover:text-white/40 transition-colors">
                  {voteCountA + voteCountB}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Results panel open: Left Hook / Right Hook as tab switchers + ✕ */}
        {!!votedSide && battleState !== "vote" && panelOpen && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md overflow-hidden h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setResultsTab("a")}
              className={`flex-1 flex items-center justify-center py-3 transition-colors ${
                resultsTab === "a"
                  ? "text-white border-b-2 border-white/40"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase">Left Hook</span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <button
              onClick={() => setResultsTab("b")}
              className={`flex-1 flex items-center justify-center py-3 transition-colors ${
                resultsTab === "b"
                  ? "text-white border-b-2 border-white/40"
                  : "text-white/30 hover:text-white/60"
              }`}
            >
              <span className="text-[11px] font-mono tracking-[0.15em] uppercase">Right Hook</span>
            </button>
            <div style={{ width: "0.5px" }} className="bg-white/[0.06] self-stretch my-2" />
            <button
              onClick={() => setPanelOpen(false)}
              className="flex items-center justify-center px-4 min-w-[64px] py-3 hover:bg-white/[0.04] transition-colors group shrink-0 focus:outline-none"
            >
              <X size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
            </button>
          </div>
        )}
        </div>
      </div>

      <ResultsPanel />
    </div>
  );
}

export const BattleEmbed = memo(BattleEmbedInner);
