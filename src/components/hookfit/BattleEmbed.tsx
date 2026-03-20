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
  initialVotedSide,
}: BattleEmbedProps) {
  const isFeedEmbed = cardState !== undefined;

  // ── Resolved IDs ───────────────────────────────────────────
  const [resolvedBattleId, setResolvedBattleId] = useState<string | null>(propBattleId ?? null);
  const [hookPhrase, setHookPhrase] = useState<string | null>(null);
  const [loading, setLoading] = useState(!propBattleId);
  const [error, setError] = useState(false);

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

  // Reset to cover when feed card is deactivated
  useEffect(() => {
    if (isFeedEmbed && cardState !== "active") {
      setBattleState("cover");
      setReplayingSide(null);
      setPanelOpen(false);
    }
  }, [isFeedEmbed, cardState]);

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

    if (!resolvedBattleId) return;
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
        setBattleState("results");
      }
    })();
  }, [resolvedBattleId, hookPhrase]);

  // ── Progress bar timer ──────────────────────────────────────
  useEffect(() => {
    if (battleState !== "round-1" && battleState !== "round-2") {
      setRoundProgress(0);
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current);
      return;
    }
    const hookDuration = battleState === "round-1"
      ? (hookA ? hookA.hook_end - hookA.hook_start : 10)
      : (hookB ? hookB.hook_end - hookB.hook_start : 10);
    roundStartRef.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - roundStartRef.current) / 1000 / hookDuration);
      setRoundProgress(p);
      if (p < 1) progressTimerRef.current = requestAnimationFrame(tick);
    };
    progressTimerRef.current = requestAnimationFrame(tick);
    return () => { if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current); };
  }, [battleState, hookA, hookB]);

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
      case "results": return replayingSide ?? votedSide;
    }
  }, [isFeedEmbed, cardState, battleState, votedSide, replayingSide]);

  const handleTileTap = useCallback((side: "a" | "b") => {
    if (battleState !== "results") return;
    setReplayingSide(prev => prev === side ? null : side);
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
      {panelOpen && battleState === "results" && (
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
          if (battleState === "round-1" || battleState === "round-2" || battleState === "results") {
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

        {/* InlineBattle canvas — always mounted when active, hidden on cover */}
        {resolvedBattleId && (!isFeedEmbed || cardState === "active") && (
          <div
            className="absolute inset-0"
            style={{ opacity: battleState === "cover" ? 0 : 1, transition: "opacity 0.4s ease" }}
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
              forceMuted={muted}
            />
          </div>
        )}


        {/* Cover overlay */}
        <AnimatePresence>
          {battleState === "cover" && (hookA || resolvedBattleId) && (
            <motion.div
              key="battle-cover"
              initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
              className="absolute inset-x-0 top-0 z-20 flex flex-col items-center justify-center"
              style={{ bottom: 65, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
            >
              {showExpandButton && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(battleUrl, "_blank"); }}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white/30 hover:text-white/60 transition-colors"
                >
                  <Maximize2 size={12} />
                </button>
              )}
              <div className="flex flex-col items-center justify-center px-6 text-center">
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
                  Final Answer...
                </button>
                <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mt-3">
                  2 rounds · 10 seconds each
                </p>
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
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ background: "#0a0a0a" }}>

        {/* Progress bar — round states only */}
        {(battleState === "round-1" || battleState === "round-2") && (
          <div className="w-full h-[2px] bg-white/[0.06]">
            <motion.div
              className="h-full"
              style={{
                background: battleState === "round-1"
                  ? (hookA?.palette?.[0] ?? "#22c55e")
                  : (hookB?.palette?.[0] ?? "#22c55e"),
                width: `${roundProgress * 100}%`,
              }}
              transition={{ duration: 0 }}
            />
          </div>
        )}

        {/* Pre-vote: Left Hook / Right Hook disabled + 🔥 disabled */}
        {(battleState === "cover" || battleState === "round-1" || battleState === "round-2") && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md h-[52px]"} opacity-30 pointer-events-none`}>
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
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
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
        {battleState === "results" && !panelOpen && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 flex items-center px-3 overflow-hidden min-w-0">
              <span className="text-[9px] font-mono tracking-[0.08em] text-white/60 truncate">
                {(() => {
                  const total = totalVotes;
                  const userPick = votedSide === "a" ? "LEFT HOOK" : "RIGHT HOOK";
                  const winnerPct = votedSide === "a" ? pctA : pctB;
                  const majorityAgrees = (votedSide === "a" && pctA >= 50) || (votedSide === "b" && pctB >= 50);
                  const isSplit = pctA === 50 && pctB === 50;
                  if (total < 10) return `FMLY STILL JUDGING · ${voteCountA + voteCountB} VOTES`;
                  if (isSplit) return `FMLY IS SPLIT · ${voteCountA} / ${voteCountB}`;
                  return `FMLY ${majorityAgrees ? "AGREES" : "DISAGREES"} · ${userPick} ${winnerPct}%`;
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
        {battleState === "results" && panelOpen && (
          <div className={`flex items-stretch ${isFeedEmbed ? "h-[48px]" : "mx-1 mt-1 rounded-md h-[52px]"}`} onClick={(e) => e.stopPropagation()}>
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

      <ResultsPanel />
    </div>
  );
}

export const BattleEmbed = memo(BattleEmbedInner);
