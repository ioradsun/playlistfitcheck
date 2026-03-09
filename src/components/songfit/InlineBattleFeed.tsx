/**
 * InlineBattleFeed — Full inline hook battle player for the CrowdFit feed.
 * Replicates the ShareableHook battle flow: cover → round-1 → round-2 → vote → results
 * with bottom bar (round labels, vote buttons, comment input) and reaction panel.
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { InlineBattle, type BattleMode } from "@/components/hookfit/InlineBattle";
import type { HookInfo } from "@/components/hookfit/InlineBattle";
import { getSessionId } from "@/lib/sessionId";
import type { CardState } from "./useCardLifecycle";

type BattleState = "cover" | "round-1" | "round-2" | "vote" | "results";

const EMOJI_OPTIONS = ["🔥", "💀", "🫠", "👑", "💜", "😤"];

interface Props {
  battleUrl: string;
  songTitle: string;
  artistName: string;
  albumArtUrl?: string | null;
  votedSide?: "a" | "b" | null;
  cardState: CardState;
  onPlay?: () => void;
}

function InlineBattleFeedInner({ battleUrl, songTitle, artistName, albumArtUrl, votedSide: initialVotedSide, cardState, onPlay }: Props) {
  const [battleId, setBattleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hookPhrase, setHookPhrase] = useState<string | null>(null);

  // Battle state machine
  const [battleState, setBattleState] = useState<BattleState>("cover");
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(initialVotedSide ?? null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [replayingSide, setReplayingSide] = useState<"a" | "b" | null>(null);
  const [roundProgress, setRoundProgress] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [lineReactions, setLineReactions] = useState<Record<string, string>>({});
  const [activeEmojiLine, setActiveEmojiLine] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; text: string; voted_side: string; created_at: string }>>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const progressTimerRef = useRef<number>(0);
  const roundStartRef = useRef<number>(0);
  const hookEndFiredA = useRef(false);
  const hookEndFiredB = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (cardState === "active") return;
    setBattleState("cover");
    setReplayingSide(null);
    setPanelOpen(false);
  }, [cardState]);

  // ── Fetch battle_id from URL slugs ──────────────────────────
  useEffect(() => {
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
        setBattleId((data as any).battle_id);
        setHookPhrase((data as any).hook_phrase || null);
        setLoading(false);
      });
  }, [battleUrl]);

  // ── Hooks loaded callback ───────────────────────────────────
  const handleHooksLoaded = useCallback((a: HookInfo, b: HookInfo | null) => {
    setHookA(a);
    setHookB(b);
    setVoteCountA(a.vote_count || 0);
    if (b) setVoteCountB(b.vote_count || 0);

    // Check for existing vote
    if (!battleId) return;
    (async () => {
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;

      let query = supabase.from("hook_votes" as any).select("hook_id").eq("battle_id", battleId);
      if (u?.id) query = query.eq("user_id", u.id);
      else query = query.eq("session_id", sessionId);

      const { data: vote } = await query.maybeSingle();
      if (vote) {
        setVotedSide((vote as any).hook_id === a.id ? "a" : "b");
        setBattleState("results");
      }
    })();
  }, [battleId]);

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
    const duration = (hookA.hook_end - hookA.hook_start) * 1000 + 300;
    const timer = setTimeout(() => { hookEndFiredA.current = true; setBattleState("round-2"); }, duration);
    return () => clearTimeout(timer);
  }, [battleState, hookA]);

  useEffect(() => {
    if (battleState !== "round-2" || !hookB || hookEndFiredB.current) return;
    const duration = (hookB.hook_end - hookB.hook_start) * 1000 + 300;
    const timer = setTimeout(() => { hookEndFiredB.current = true; setBattleState("vote"); }, duration);
    return () => clearTimeout(timer);
  }, [battleState, hookB]);

  // ── Vote handler ────────────────────────────────────────────
  const handleVote = useCallback(async (side: "a" | "b") => {
    if (!hookA || !battleId || battleState !== "vote") return;
    const hookId = side === "a" ? hookA.id : hookB?.id;
    if (!hookId) return;

    setVotedSide(side);
    if (side === "a") setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setBattleState("results");

    const sessionId = getSessionId();
    if (userIdRef.current === undefined) {
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;
    }
    await supabase.from("hook_votes" as any).insert({
      battle_id: battleId, hook_id: hookId,
      user_id: userIdRef.current || null, session_id: sessionId,
    });
  }, [hookA, hookB, battleId, battleState]);

  // ── Poll vote counts ────────────────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !hookA || !battleId) return;
    const poll = async () => {
      const { data } = await supabase.from("hook_votes" as any).select("hook_id").eq("battle_id", battleId);
      if (!data) return;
      const votes = data as any[];
      setVoteCountA(votes.filter(v => v.hook_id === hookA.id).length);
      setVoteCountB(votes.filter(v => v.hook_id === hookB?.id).length);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [battleState, hookA, hookB, battleId]);

  // ── Comments ────────────────────────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !battleId) return;
    const fetchComments = async () => {
      const { data } = await supabase
        .from("battle_comments" as any)
        .select("id, text, voted_side, created_at")
        .eq("battle_id", battleId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setComments(data as any[]);
    };
    fetchComments();
    const interval = setInterval(fetchComments, 8000);
    return () => clearInterval(interval);
  }, [battleState, battleId]);

  const submitComment = useCallback(async () => {
    if (!commentInput.trim() || !battleId || !votedSide) return;
    setSubmittingComment(true);
    const sessionId = getSessionId();
    const newComment = { battle_id: battleId, user_id: userIdRef.current || null, session_id: sessionId, voted_side: votedSide, text: commentInput.trim() };
    const optimistic = { ...newComment, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setComments(prev => [optimistic, ...prev]);
    setCommentInput("");
    await supabase.from("battle_comments" as any).insert(newComment);
    setSubmittingComment(false);
  }, [commentInput, battleId, votedSide]);

  // ── Mute on scroll-out ──────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) setReplayingSide(null); },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Line reactions ──────────────────────────────────────────
  const toggleLineReaction = useCallback((side: "a" | "b", lineIndex: number, emoji: string) => {
    const key = `${side}-${lineIndex}`;
    setLineReactions(prev => {
      const next = { ...prev };
      if (next[key] === emoji) delete next[key]; else next[key] = emoji;
      return next;
    });
    setActiveEmojiLine(null);
  }, []);

  // ── Derived values ──────────────────────────────────────────
  const totalVotes = voteCountA + voteCountB;
  const pctA = totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const pctB = totalVotes > 0 ? Math.round((voteCountB / totalVotes) * 100) : 50;

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
    if (cardState !== "active") return null;
    switch (battleState) {
      case "cover": return null;
      case "round-1": return "a";
      case "round-2": return "b";
      case "vote": return null;
      case "results": return replayingSide ?? votedSide;
    }
  }, [cardState, battleState, votedSide, replayingSide]);

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

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden flex flex-col">
      {/* ── Canvas area ─────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden" style={{ height: 320 }}>
        {albumArtUrl && (
          <img
            src={albumArtUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
            loading="lazy"
          />
        )}

        {(loading || !battleId) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center space-y-2">
              <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
              <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Loading battle…</p>
            </div>
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ opacity: battleState === "cover" ? 0 : 1, transition: "opacity 0.4s ease" }}
          >
            <InlineBattle
              battleId={battleId}
              mode={battleMode}
              activePlaying={activePlaying}
              votedSide={votedSide}
              voteCount={votedSide === "a" ? voteCountA : votedSide === "b" ? voteCountB : undefined}
              votePct={votedSide === "a" ? pctA : votedSide === "b" ? pctB : undefined}
              onTileTap={handleTileTap}
              onHooksLoaded={handleHooksLoaded}
            />
          </div>
        )}

        {/* "In Battle" badge — top left */}
        {hookA && (
          <div className="absolute top-3 left-3 z-30 pointer-events-none">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
              In Battle
            </span>
          </div>
        )}

        {/* Cover overlay */}
        <AnimatePresence>
          {battleState === "cover" && hookA && (
            <motion.div
              key="battle-cover"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center"
              style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); window.open(battleUrl, "_blank"); }}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white/30 hover:text-white/60 transition-colors"
              >
                <Maximize2 size={12} />
              </button>
              <div className="flex flex-col items-center justify-center px-6 text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">{songTitle}</p>
                {hookPhrase && (
                  <p className="text-lg sm:text-xl font-semibold text-white/80 max-w-[85%] leading-snug mb-8 italic">
                    &ldquo;{hookPhrase}&rdquo;
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay?.();
                    setBattleState("round-1");
                  }}
                  className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Judge Now
                </button>
                <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mt-3">
                  2 rounds · 10 seconds each
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Round label overlays on dimmed side */}
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

        {/* Vote prompt overlay */}
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

        {/* Expand button — after cover */}
        {battleState !== "cover" && hookA && (
          <button
            onClick={(e) => { e.stopPropagation(); window.open(battleUrl, "_blank"); }}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      {/* ── Bottom bar ──────────────────────────────────────── */}
      <div className="w-full flex-shrink-0" style={{ background: "rgba(0,0,0,0.4)" }}>
        {/* Progress bar — visible during rounds */}
        {(battleState === "round-1" || battleState === "round-2") && (
          <div className="w-full h-[3px] bg-white/[0.06]">
            <motion.div
              className="h-full"
              style={{
                background: battleState === "round-1"
                  ? (hookA?.palette?.[0] ?? "#a855f7")
                  : (hookB?.palette?.[0] ?? "#a855f7"),
                width: `${roundProgress * 100}%`,
              }}
              transition={{ duration: 0 }}
            />
          </div>
        )}

        <div className="w-full px-4 py-2.5">
          <AnimatePresence mode="wait">
            {/* Cover: disabled vote buttons preview */}
            {battleState === "cover" && (
              <motion.div key="cover-bar" className="flex items-center gap-3 opacity-30 pointer-events-none">
                <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10">
                  <span className="text-sm">👊</span>
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 font-semibold">Left Hook</span>
                </div>
                <span className="text-[9px] font-mono text-white/10 shrink-0">vs</span>
                <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 font-semibold">Right Hook</span>
                  <span className="text-sm">👊</span>
                </div>
              </motion.div>
            )}

            {/* Round labels */}
            {(battleState === "round-1" || battleState === "round-2") && (
              <motion.div
                key={`round-${battleState}`}
                initial={{ opacity: 0, x: battleState === "round-2" ? 20 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/50">
                    {battleState === "round-1" ? "Round 1" : "Round 2"}
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-white/70">
                    {battleState === "round-1" ? "Left Hook" : "Right Hook"}
                  </span>
                </div>
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    background: battleState === "round-1"
                      ? (hookA?.palette?.[0] ?? "#a855f7")
                      : (hookB?.palette?.[0] ?? "#a855f7"),
                  }}
                />
              </motion.div>
            )}

            {/* Vote buttons */}
            {battleState === "vote" && (
              <motion.div key="vote-bar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3">
                <button onClick={() => handleVote("a")}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all">
                  <span className="text-sm">👊</span>
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-white/80 font-semibold">Left Hook</span>
                </button>
                <span className="text-[9px] font-mono text-white/15 shrink-0">vs</span>
                <button onClick={() => handleVote("b")}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all">
                  <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-white/80 font-semibold">Right Hook</span>
                  <span className="text-sm">👊</span>
                </button>
              </motion.div>
            )}

            {/* Results: comment + react */}
            {battleState === "results" && votedSide && (
              <motion.div key="results-bar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.07] min-w-0"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                    placeholder="Drop your take..."
                    className="flex-1 bg-transparent text-[11px] font-mono text-white/60 placeholder:text-white/20 outline-none min-w-0"
                    disabled={submittingComment}
                  />
                  {commentInput.trim() && (
                    <button onClick={submitComment} disabled={submittingComment}
                      className="text-[10px] font-mono text-primary/70 hover:text-primary uppercase tracking-wider shrink-0">
                      Send
                    </button>
                  )}
                </div>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.04] transition-all shrink-0"
                  onClick={() => setPanelOpen(true)}
                >
                  <span className="text-[11px] font-mono uppercase tracking-wider">React</span>
                  <span className="text-[10px] opacity-60">↑</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Reaction slide-up panel ─────────────────────────── */}
      <AnimatePresence>
        {panelOpen && battleState === "results" && (
          <motion.div
            key="take-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-[60] rounded-t-2xl overflow-hidden"
            style={{ background: "#111", maxHeight: "75%" }}
          >
            <button onClick={() => setPanelOpen(false)} className="w-full flex justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </button>
            <div className="px-4 pb-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100% - 40px)" }}>
              {/* Vote confirmation */}
              <div className="flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.5L4.5 9L10 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[11px] font-mono text-green-400/70 uppercase tracking-wider">
                  You picked {votedSide === "a" ? "Left" : "Right"} Hook · {votedSide === "a" ? voteCountA : voteCountB} FMLY ({votedSide === "a" ? pctA : pctB}%)
                </span>
              </div>

              {/* Takes */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/25">Takes ({comments.length})</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>
                {comments.length === 0 ? (
                  <p className="text-[10px] font-mono text-white/15 text-center py-3">No takes yet — be first</p>
                ) : (
                  <div className="space-y-2">
                    {comments.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 px-2">
                        <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-0.5 text-white/40 bg-white/[0.04] border border-white/[0.06]">
                          {c.voted_side === "a" ? "LEFT HOOK" : "RIGHT HOOK"}
                        </span>
                        <p className="text-[11px] text-white/45 leading-relaxed flex-1">{c.text}</p>
                        <span className="text-[9px] font-mono text-white/15 shrink-0">
                          {(() => {
                            const mins = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000);
                            if (mins < 1) return "now";
                            if (mins < 60) return `${mins}m`;
                            return `${Math.floor(mins / 60)}h`;
                          })()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop for panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[55] bg-black/50" onClick={() => setPanelOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export const InlineBattleFeed = memo(InlineBattleFeedInner);
