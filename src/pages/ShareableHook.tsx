import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { LyricDanceEmbed } from "@/components/lyric/LyricDanceEmbed";
import { InlineBattle, type BattleMode } from "@/components/hookfit/InlineBattle";
import { LYRIC_DANCE_COLUMNS } from "@/lib/lyricDanceColumns";
import type { LyricDanceData } from "@/engine/LyricDancePlayer";
import type { HookInfo } from "@/components/hookfit/InlineBattle";
import { getSessionId } from "@/lib/sessionId";

const HOOK_COLUMNS = "id,user_id,hook_start,hook_end,hook_label,hook_phrase,hook_slug,battle_id,battle_position,artist_slug,song_slug,palette,vote_count";

type BattleState = "cover" | "round-1" | "round-2" | "vote" | "results";

const EMOJI_OPTIONS = ["🔥", "💀", "🫠", "👑", "💜", "😤"];

export default function ShareableHook() {
  const { artistSlug, songSlug, hookSlug } = useParams<{ artistSlug: string; songSlug: string; hookSlug: string }>();
  const [hook, setHook] = useState<(HookInfo & { battle_id?: string }) | null>(null);
  const [danceData, setDanceData] = useState<LyricDanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hookA, setHookA] = useState<HookInfo | null>(null);
  const [hookB, setHookB] = useState<HookInfo | null>(null);

  // Battle flow state
  const [battleState, setBattleState] = useState<BattleState>("cover");
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [replayingSide, setReplayingSide] = useState<"a" | "b" | null>(null);
  const [lineReactions, setLineReactions] = useState<Record<string, string>>({});

  // Comments
  const [comments, setComments] = useState<Array<{ id: string; text: string; voted_side: string; user_id?: string; created_at: string }>>([]);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Per-line emoji — which line is expanded for emoji picking
  const [activeEmojiLine, setActiveEmojiLine] = useState<string | null>(null); // "a-0", "b-2", etc.

  const userIdRef = useRef<string | null | undefined>(undefined);

  const toggleLineReaction = useCallback((side: "a" | "b", lineIndex: number, emoji: string) => {
    const key = `${side}-${lineIndex}`;
    setLineReactions((prev) => {
      const next = { ...prev };
      if (next[key] === emoji) {
        delete next[key];
      } else {
        next[key] = emoji;
      }
      return next;
    });
    setActiveEmojiLine(null); // Close picker after selection
  }, []);

  // Progress tracking
  const [roundProgress, setRoundProgress] = useState(0);
  const progressTimerRef = useRef<number>(0);
  const roundStartRef = useRef<number>(0);

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

      // Always fetch dance data — needed for lyrics in the results panel
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

  // ── Hooks loaded callback ──────────────────────────────────
  const handleHooksLoaded = useCallback((a: HookInfo, b: HookInfo | null) => {
    setHookA(a);
    setHookB(b);
    setVoteCountA(a.vote_count || 0);
    if (b) setVoteCountB(b.vote_count || 0);

    // Check for existing vote
    if (!hook?.battle_id) return;
    (async () => {
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;

      let query = supabase
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
        setVotedSide((vote as any).hook_id === a.id ? "a" : "b");
        setBattleState("results");
      }
    })();
  }, [hook?.battle_id]);

  // ── Progress bar timer ─────────────────────────────────────
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
      const elapsed = (performance.now() - roundStartRef.current) / 1000;
      const p = Math.min(1, elapsed / hookDuration);
      setRoundProgress(p);
      if (p < 1) {
        progressTimerRef.current = requestAnimationFrame(tick);
      }
    };
    progressTimerRef.current = requestAnimationFrame(tick);

    return () => {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current);
    };
  }, [battleState, hookA, hookB]);

  // ── Hook end → auto-advance ────────────────────────────────
  const hookEndFiredA = useRef(false);
  const hookEndFiredB = useRef(false);

  useEffect(() => {
    if (battleState !== "round-1" || !hookA || hookEndFiredA.current) return;
    const duration = (hookA.hook_end - hookA.hook_start) * 1000 + 300;
    const timer = setTimeout(() => {
      hookEndFiredA.current = true;
      setBattleState("round-2");
    }, duration);
    return () => clearTimeout(timer);
  }, [battleState, hookA]);

  useEffect(() => {
    if (battleState !== "round-2" || !hookB || hookEndFiredB.current) return;
    const duration = (hookB.hook_end - hookB.hook_start) * 1000 + 300;
    const timer = setTimeout(() => {
      hookEndFiredB.current = true;
      setBattleState("vote");
    }, duration);
    return () => clearTimeout(timer);
  }, [battleState, hookB]);

  // ── Vote handler ───────────────────────────────────────────
  const handleVote = useCallback(async (side: "a" | "b") => {
    if (!hookA || !hook?.battle_id || battleState !== "vote") return;
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

    await supabase
      .from("hook_votes" as any)
      .insert({
        battle_id: hook.battle_id,
        hook_id: hookId,
        user_id: userIdRef.current || null,
        session_id: sessionId,
      });
  }, [hookA, hookB, hook?.battle_id, battleState]);

  // ── Poll vote counts ───────────────────────────────────────
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


  // ── Fetch + poll comments ──────────────────────────────────
  useEffect(() => {
    if (battleState !== "results" || !hook?.battle_id) return;
    const fetchComments = async () => {
      const { data } = await supabase
        .from("battle_comments" as any)
        .select("id, text, voted_side, user_id, created_at")
        .eq("battle_id", hook.battle_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setComments(data as any[]);
    };
    fetchComments();
    const interval = setInterval(fetchComments, 8000);
    return () => clearInterval(interval);
  }, [battleState, hook?.battle_id]);

  const submitComment = useCallback(async () => {
    if (!commentInput.trim() || !hook?.battle_id || !votedSide) return;
    setSubmittingComment(true);
    const sessionId = getSessionId();

    const newComment = {
      battle_id: hook.battle_id,
      user_id: userIdRef.current || null,
      session_id: sessionId,
      voted_side: votedSide,
      text: commentInput.trim(),
    };

    // Optimistic add
    const optimistic = { ...newComment, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setComments((prev) => [optimistic, ...prev]);
    setCommentInput("");

    await supabase.from("battle_comments" as any).insert(newComment);
    setSubmittingComment(false);
  }, [commentInput, hook?.battle_id, votedSide]);

  // ── iOS scroll prevention ──────────────────────────────────
  useEffect(() => {
    if (!hook?.battle_id) return;
    const style = document.createElement("style");
    style.textContent = "html, body { overflow: hidden; height: 100%; }";
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [hook?.battle_id]);

  // ── Derived ────────────────────────────────────────────────
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
    switch (battleState) {
      case "cover": return null;
      case "round-1": return "a";
      case "round-2": return "b";
      case "vote": return null;
      case "results": return replayingSide ?? votedSide;
    }
  }, [battleState, votedSide, replayingSide]);

  const handleTileTap = useCallback((side: "a" | "b") => {
    if (battleState !== "results") return;
    setReplayingSide(prev => prev === side ? null : side);
  }, [battleState]);

  const songDisplayName = useMemo(() => {
    if (hookA) {
      const artist = hookA.artist_slug?.replace(/-/g, " ") || "";
      const song = hookA.song_slug?.replace(/-/g, " ") || "";
      return `${artist} — ${song}`;
    }
    return hook?.artist_slug?.replace(/-/g, " ") ?? "";
  }, [hookA, hook]);

  const hookPhrase = hookA?.hook_phrase || hookB?.hook_phrase || null;

  const hookALines = useMemo(() => {
    if (!danceData?.lyrics || !hookA) return [];
    return danceData.lyrics.filter(
      (l: any) => l.start >= hookA.hook_start - 0.3 && l.end <= hookA.hook_end + 0.3,
    );
  }, [danceData?.lyrics, hookA]);

  const hookBLines = useMemo(() => {
    if (!danceData?.lyrics || !hookB) return [];
    return danceData.lyrics.filter(
      (l: any) => l.start >= hookB.hook_start - 0.3 && l.end <= hookB.hook_end + 0.3,
    );
  }, [danceData?.lyrics, hookB]);

  const danceUrl = useMemo(() => {
    if (!danceData) return "#";
    return `/lyric-dance/${danceData.artist_slug}/${danceData.song_slug}`;
  }, [danceData]);

  // ── Loading / error ────────────────────────────────────────
  if (loading) {
    return <div className="fixed inset-0 bg-black animate-pulse" />;
  }
  if (!hook) {
    return <div className="fixed inset-0 bg-black text-white grid place-items-center">Hook not found.</div>;
  }

  // ══════════════════════════════════════════════════════════════
  // ── BATTLE MODE ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  if (hook.battle_id) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>

        {/* ── Canvas area ───────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <InlineBattle
            battleId={hook.battle_id}
            mode={battleMode}
            activePlaying={activePlaying}
            votedSide={votedSide}
            voteCount={votedSide === "a" ? voteCountA : votedSide === "b" ? voteCountB : undefined}
            votePct={votedSide === "a" ? pctA : votedSide === "b" ? pctB : undefined}
            onTileTap={handleTileTap}
            onHooksLoaded={handleHooksLoaded}
          />

          {/* "In Battle" badge — always visible, top center */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400 border border-green-400/30 rounded px-1.5 py-0.5 bg-green-500/15 backdrop-blur-sm">
              In Battle
            </span>
          </div>

          {/* ── COVER OVERLAY ──────────────────────────────── */}
          <AnimatePresence>
            {battleState === "cover" && (
              <motion.div
                key="cover"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center"
                style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(2px)" }}
              >
                <div className="flex flex-col items-center justify-center px-6 text-center">
                  {/* Song info */}
                  <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30 mb-4">
                    {songDisplayName}
                  </p>

                  {/* Hook phrase — the compelling line */}
                  {hookPhrase && (
                    <p className="text-lg sm:text-xl font-semibold text-white/80 max-w-[85%] leading-snug mb-8 italic">
                      &ldquo;{hookPhrase}&rdquo;
                    </p>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() => setBattleState("round-1")}
                    className="px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Judge Now
                  </button>

                  {/* Subtext */}
                  <p className="text-[9px] font-mono text-white/20 uppercase tracking-wider mt-3">
                    2 rounds · 10 seconds each
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── ROUND label overlay on dimmed side ─────────── */}
          <AnimatePresence>
            {battleState === "round-1" && (
              <motion.div
                key="round2-preview"
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
                key="round1-done"
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

          {/* ── VOTE overlay — "YOUR VERDICT" ─────────────── */}
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
        </div>

        {/* ── Bottom bar ────────────────────────────────────── */}
        <div className="w-full flex-shrink-0" style={{ background: "#0a0a0a" }}>

          {/* Progress bar — visible during rounds only */}
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

          <div className="w-full max-w-2xl mx-auto px-4 py-3">
            <AnimatePresence mode="wait">

              {/* ── COVER: nothing in bottom bar ── */}
              {battleState === "cover" && (
                <motion.div key="cover-bar" className="h-5" />
              )}

              {/* ── ROUND 1 / ROUND 2: round label ── */}
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

              {/* ── VOTE: two large buttons ── */}
              {battleState === "vote" && (
                <motion.div
                  key="vote-bar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={() => handleVote("a")}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all"
                  >
                    <span className="text-sm">👊</span>
                    <span className="text-[12px] font-mono uppercase tracking-[0.12em] text-white/80 font-semibold">
                      Left Hook
                    </span>
                  </button>

                  <span className="text-[9px] font-mono text-white/15 shrink-0">vs</span>

                  <button
                    onClick={() => handleVote("b")}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-white/20 hover:border-white/40 hover:bg-white/[0.06] active:scale-[0.97] transition-all"
                  >
                    <span className="text-[12px] font-mono uppercase tracking-[0.12em] text-white/80 font-semibold">
                      Right Hook
                    </span>
                    <span className="text-sm">👊</span>
                  </button>
                </motion.div>
              )}

              {/* ── RESULTS: comment input + React button ── */}
              {battleState === "results" && votedSide && (
                <motion.div
                  key="results-bar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  {/* Comment input */}
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.07] min-w-0"
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
                      <button
                        onClick={submitComment}
                        disabled={submittingComment}
                        className="text-[10px] font-mono text-primary/70 hover:text-primary uppercase tracking-wider shrink-0"
                      >
                        Send
                      </button>
                    )}
                  </div>

                  {/* React button */}
                  <button
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/25 hover:bg-white/[0.04] transition-all shrink-0"
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

        {/* ── Slide-up panel ────────────────────────────────── */}
        <AnimatePresence>
          {panelOpen && battleState === "results" && (
            <motion.div
              key="take-panel"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl overflow-hidden"
              style={{ background: "#111", maxHeight: "75vh" }}
            >
              {/* Drag handle */}
              <button
                onClick={() => setPanelOpen(false)}
                className="w-full flex justify-center py-3"
              >
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </button>

              <div className="px-4 pb-6 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(75vh - 40px)" }}>

                {/* Vote confirmation */}
                <div className="flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L4.5 9L10 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[11px] font-mono text-green-400/70 uppercase tracking-wider">
                    You picked {votedSide === "a" ? "Left" : "Right"} Hook · {votedSide === "a" ? voteCountA : voteCountB} FMLY ({votedSide === "a" ? pctA : pctB}%)
                  </span>
                </div>

                {/* ── LEFT HOOK lines ──────────────────────── */}
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${
                      votedSide === "a" ? "text-green-400/50" : "text-white/25"
                    }`}>
                      Left Hook {votedSide === "a" ? "✓" : ""}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  {hookALines.map((line: any, i: number) => {
                    const key = `a-${i}`;
                    const reaction = lineReactions[key];
                    const isActive = activeEmojiLine === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setActiveEmojiLine(isActive ? null : key)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${
                            isActive ? "bg-white/[0.06] border border-white/[0.1]"
                            : reaction ? "bg-white/[0.03]" : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className="text-[11px] text-white/50 leading-relaxed flex-1 min-w-0">
                            {line.text}
                          </span>
                          {reaction && (
                            <span className="text-sm ml-2 shrink-0">{reaction}</span>
                          )}
                        </button>
                        {/* Inline emoji picker — appears under the tapped line */}
                        <AnimatePresence>
                          {isActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex items-center justify-center gap-2 py-2">
                                {EMOJI_OPTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleLineReaction("a", i, emoji)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all ${
                                      reaction === emoji ? "bg-white/15 ring-1 ring-white/25 scale-110" : "bg-white/[0.04] hover:bg-white/[0.08]"
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
                    );
                  })}
                </div>

                {/* ── RIGHT HOOK lines ─────────────────────── */}
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${
                      votedSide === "b" ? "text-green-400/50" : "text-white/25"
                    }`}>
                      Right Hook {votedSide === "b" ? "✓" : ""}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>
                  {hookBLines.map((line: any, i: number) => {
                    const key = `b-${i}`;
                    const reaction = lineReactions[key];
                    const isActive = activeEmojiLine === key;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setActiveEmojiLine(isActive ? null : key)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all ${
                            isActive ? "bg-white/[0.06] border border-white/[0.1]"
                            : reaction ? "bg-white/[0.03]" : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <span className="text-[11px] text-white/50 leading-relaxed flex-1 min-w-0">
                            {line.text}
                          </span>
                          {reaction && (
                            <span className="text-sm ml-2 shrink-0">{reaction}</span>
                          )}
                        </button>
                        <AnimatePresence>
                          {isActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex items-center justify-center gap-2 py-2">
                                {EMOJI_OPTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleLineReaction("b", i, emoji)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all ${
                                      reaction === emoji ? "bg-white/15 ring-1 ring-white/25 scale-110" : "bg-white/[0.04] hover:bg-white/[0.08]"
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
                    );
                  })}
                </div>

                {/* ── TAKES (comments) ─────────────────────── */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.06]" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/25">
                      Takes ({comments.length})
                    </span>
                    <div className="h-px flex-1 bg-white/[0.06]" />
                  </div>

                  {comments.length === 0 ? (
                    <p className="text-[10px] font-mono text-white/15 text-center py-3">
                      No takes yet — be first
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2 px-2">
                          {/* Side badge */}
                          <span className={`text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                            c.voted_side === "a"
                              ? "text-white/40 bg-white/[0.04] border border-white/[0.06]"
                              : "text-white/40 bg-white/[0.04] border border-white/[0.06]"
                          }`}>
                            {c.voted_side === "a" ? "LEFT HOOK" : "RIGHT HOOK"}
                          </span>
                          <p className="text-[11px] text-white/45 leading-relaxed flex-1">
                            {c.text}
                          </p>
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

        {/* Backdrop */}
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-black/50"
              onClick={() => setPanelOpen(false)}
            />
          )}
        </AnimatePresence>

      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── SINGLE HOOK MODE ─────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
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
          cardState="active"
          regionStart={hook.hook_start}
          regionEnd={hook.hook_end}
        />
      </div>
    </div>
  );
}
