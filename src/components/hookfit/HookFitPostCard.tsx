/**
 * HookFitPostCard — 6-state battle card for HookFit V1.
 * States: challenge → listen-first → listen-second → judgment → scorecard → results
 * Plus silent "pass" logging on scroll-away.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { User, MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ProfileHoverCard } from "@/components/songfit/ProfileHoverCard";
import { TrailblazerBadge } from "@/components/TrailblazerBadge";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineBattle, type BattleMode } from "./InlineBattle";
import type { HookFitPost } from "./types";
import type { HookData } from "@/hooks/useHookCanvas";
import { getSessionId } from "@/lib/sessionId";
import { mulberry32, hashSeed } from "@/engine/PhysicsIntegrator";
import { useGlobalAudio, audioKey } from "./useGlobalAudio";

// ── Types ─────────────────────────────────────────────────────────────────

type CardState =
  | "challenge"
  | "listen-first"
  | "listen-second"
  | "judgment"
  | "scorecard"
  | "results";

const RESULTS_THRESHOLD = 10;

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  post: HookFitPost;
  onRefresh: () => void;
}

export function HookFitPostCard({ post, onRefresh }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwnPost = user?.id === post.user_id;
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeKey, claim } = useGlobalAudio();

  // ── Card state machine ──────────────────────────────────────────
  const [cardState, setCardState] = useState<CardState>("challenge");
  const [hookA, setHookA] = useState<HookData | null>(null);
  const [hookB, setHookB] = useState<HookData | null>(null);
  const [playbackOrder, setPlaybackOrder] = useState<["a", "b"] | ["b", "a"]>(["a", "b"]);
  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(null);
  const [voteCountA, setVoteCountA] = useState(0);
  const [voteCountB, setVoteCountB] = useState(0);
  const [liveComments, setLiveComments] = useState<{ id: string; text: string; name: string }[]>([]);
  const passLoggedRef = useRef(false);
  const userIdRef = useRef<string | null | undefined>(undefined);

  // ── Derive activePlaying from global audio context ──────────────
  const myKeyA = audioKey(post.battle_id, "a");
  const myKeyB = audioKey(post.battle_id, "b");
  const activePlaying = useMemo<"a" | "b" | null>(() => {
    if (activeKey === myKeyA) return "a";
    if (activeKey === myKeyB) return "b";
    return null;
  }, [activeKey, myKeyA, myKeyB]);

  // ── Playback order from PRNG ────────────────────────────────────
  useEffect(() => {
    const sessionId = getSessionId();
    const seed = hashSeed(sessionId + post.battle_id);
    const rng = mulberry32(seed);
    setPlaybackOrder(rng() > 0.5 ? ["a", "b"] : ["b", "a"]);
  }, [post.battle_id]);

  // ── Hooks loaded callback ───────────────────────────────────────
  const handleHooksLoaded = useCallback((a: HookData, b: HookData | null) => {
    setHookA(a);
    setHookB(b);
    setVoteCountA(a.vote_count || 0);
    if (b) setVoteCountB(b.vote_count || 0);

    // Check for existing vote — prefer user_id for logged-in users
    const checkVote = async () => {
      const sessionId = getSessionId();
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;

      let query = supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", post.battle_id);

      if (u?.id) {
        query = query.eq("user_id", u.id);
      } else {
        query = query.eq("session_id", sessionId);
      }

      const { data: vote } = await query.maybeSingle();
      if (vote) {
        const existingVotedSide = (vote as any).hook_id === a.id ? "a" : "b";
        setVotedSide(existingVotedSide);
        setCardState("scorecard");
      }
    };
    checkVote();
  }, [post.battle_id]);

  // ── Derive battle mode for InlineBattle ─────────────────────────
  const getBattleMode = (): BattleMode => {
    switch (cardState) {
      case "challenge": return "dark";
      case "listen-first": return playbackOrder[0] === "a" ? "listen-a" : "listen-b";
      case "listen-second": return playbackOrder[1] === "a" ? "listen-a" : "listen-b";
      case "judgment": return "judgment";
      case "scorecard": return "scorecard";
      case "results": return "results";
    }
  };

  // ── Claim audio on state transitions ────────────────────────────
  useEffect(() => {
    switch (cardState) {
      case "listen-first":
        claim(audioKey(post.battle_id, playbackOrder[0]));
        break;
      case "listen-second":
        claim(audioKey(post.battle_id, playbackOrder[1]));
        break;
      case "judgment":
      case "challenge":
        claim(null);
        break;
      case "scorecard":
        // Mute on entering scorecard (user can tap to replay)
        claim(null);
        break;
    }
  }, [cardState, playbackOrder, post.battle_id, claim]);

  // ── Hook end callback — drives auto-advance in STATE 2 ──────────
  const handleHookEnd = useCallback((side: "a" | "b") => {
    if (cardState === "listen-first" && side === playbackOrder[0]) {
      setCardState("listen-second");
    } else if (cardState === "listen-second" && side === playbackOrder[1]) {
      setCardState("judgment");
    }
  }, [cardState, playbackOrder]);

  // ── Vote handler ────────────────────────────────────────────────
  const handleVote = useCallback(async (side: "a" | "b") => {
    if (!hookA || cardState !== "judgment") return;
    const hookId = side === "a" ? hookA.id : hookB?.id;
    if (!hookId) return;

    setVotedSide(side);
    if (side === "a") setVoteCountA(v => v + 1);
    else setVoteCountB(v => v + 1);
    setCardState("scorecard");

    const sessionId = getSessionId();
    if (userIdRef.current === undefined) {
      const { data: { user: u } } = await supabase.auth.getUser();
      userIdRef.current = u?.id ?? null;
    }

    const playedFirstId = playbackOrder[0] === "a" ? hookA.id : hookB?.id;
    const order = playbackOrder[0] === "a" ? "A_first" : "B_first";

    await supabase
      .from("hook_votes" as any)
      .insert({
        battle_id: post.battle_id,
        hook_id: hookId,
        user_id: userIdRef.current || null,
        session_id: sessionId,
        playback_order: order,
        played_first_hook_id: playedFirstId,
      });
  }, [hookA, hookB, cardState, playbackOrder, post.battle_id]);

  // ── Poll vote counts in scorecard/results ───────────────────────
  useEffect(() => {
    if (cardState !== "scorecard" && cardState !== "results") return;
    if (!hookA) return;

    const poll = async () => {
      const { data } = await supabase
        .from("hook_votes" as any)
        .select("hook_id")
        .eq("battle_id", post.battle_id);
      if (!data) return;
      const votes = data as any[];
      const countA = votes.filter(v => v.hook_id === hookA.id).length;
      const countB = votes.filter(v => v.hook_id === hookB?.id).length;
      setVoteCountA(countA);
      setVoteCountB(countB);

      if (countA + countB >= RESULTS_THRESHOLD && cardState === "scorecard") {
        setCardState("results");
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [cardState, hookA, hookB, post.battle_id]);

  // ── Pass logging (STATE 6) ──────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.intersectionRatio >= 0.5;
        // Log pass when card leaves viewport without vote
        if (!isVisible && !votedSide && cardState !== "challenge" && !passLoggedRef.current) {
          passLoggedRef.current = true;
          const sessionId = getSessionId();
          supabase
            .from("battle_passes" as any)
            .insert({
              battle_id: post.battle_id,
              session_id: sessionId,
              user_id: user?.id || null,
            })
            .then(() => {});
        }
        // Reset to challenge if scrolled back without vote
        if (isVisible && !votedSide && cardState !== "challenge" && passLoggedRef.current) {
          setCardState("challenge");
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [votedSide, cardState, post.battle_id, user?.id]);

  // ── Derived ─────────────────────────────────────────────────────
  const displayName = post.profiles?.display_name || "Anonymous";
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const hook = post.hook;
  const isBattle = !!(hookA && hookB);
  const totalVotes = voteCountA + voteCountB;

  const votedHookLabel = votedSide === "a"
    ? (hookA?.hook_label || hookA?.hook_slug || "Hook A")
    : (hookB?.hook_label || hookB?.hook_slug || "Hook B");

  const majorityIsA = voteCountA >= voteCountB;
  const judgeAgreed = votedSide ? (votedSide === "a" ? majorityIsA : !majorityIsA) : false;
  const minorityPct = totalVotes > 0
    ? Math.round(((votedSide === "a" ? voteCountA : voteCountB) / totalVotes) * 100)
    : 0;

  const handleDeletePost = async () => {
    try {
      const { error } = await supabase
        .from("hookfit_posts" as any)
        .delete()
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post deleted");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const handleProfileClick = () => navigate(`/u/${post.user_id}`);

  // ── First hook label for listen overlay ─────────────────────────
  const firstLabel = playbackOrder[0] === "a"
    ? (hookA?.hook_label || "Hook A")
    : (hookB?.hook_label || "Hook B");
  const secondLabel = playbackOrder[1] === "a"
    ? (hookA?.hook_label || "Hook A")
    : (hookB?.hook_label || "Hook B");

  return (
    <div className="border-b border-border/40" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ProfileHoverCard userId={post.user_id}>
            <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={handleProfileClick}>
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/20">
                  {post.profiles?.avatar_url ? (
                    <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-muted-foreground" />
                  )}
                </div>
                {post.profiles?.is_verified && (
                  <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge size={14} /></span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate text-muted-foreground">{displayName}</p>
                <p className="font-mono text-[11px] text-muted-foreground leading-tight">{timeAgo}</p>
              </div>
            </div>
          </ProfileHoverCard>
          <TrailblazerBadge userId={post.user_id} compact />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-full hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {hook && (
              <DropdownMenuItem onClick={() => navigate(`/${hook.artist_slug}/${hook.song_slug}/${hook.hook_slug}`)}>
                <ExternalLink size={14} className="mr-2" />Open Battle
              </DropdownMenuItem>
            )}
            {isOwnPost && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDeletePost}>
                <Trash2 size={14} className="mr-2" />Delete Post
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Battle canvas area */}
      <div
        className="relative cursor-pointer"
        onClick={() => {
          if (cardState === "challenge") setCardState("listen-first");
        }}
      >
        <InlineBattle
          battleId={post.battle_id}
          mode={getBattleMode()}
          votedSide={votedSide}
          onHookEnd={handleHookEnd}
          onHooksLoaded={handleHooksLoaded}
          activePlaying={activePlaying}
          onTileTap={(side) => {
            if (cardState === "scorecard" || cardState === "results") {
              const key = audioKey(post.battle_id, side);
              claim(activeKey === key ? null : key);
            }
          }}
        />

        {/* ── Overlays per state ─────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* STATE 1: CHALLENGE */}
          {cardState === "challenge" && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-10"
            >
              <p className="font-mono text-sm uppercase tracking-[0.2em] text-white/70">
                WHICH HOOK WINS
              </p>
            </motion.div>
          )}

          {/* STATE 2: LISTEN */}
          {(cardState === "listen-first" || cardState === "listen-second") && (
            <motion.div
              key={cardState}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none"
            >
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-white/60">
                {cardState === "listen-first" ? "FIRST HIT" : "SECOND HIT"}
              </p>
            </motion.div>
          )}

          {/* STATE 3: JUDGMENT */}
          {cardState === "judgment" && isBattle && (
            <motion.div
              key="judgment"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-10"
            >
              <p className="font-mono text-sm uppercase tracking-[0.2em] text-white/70 mb-8">
                YOUR VERDICT.
              </p>
              <div className="flex w-full">
                <div className="flex-1 flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVote("a"); }}
                    className="px-6 py-2 border border-white/20 rounded font-mono text-xs uppercase tracking-[0.15em] text-white/80 hover:bg-white/10 transition-colors"
                  >
                    HOOKED
                  </button>
                </div>
                <div className="flex-1 flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVote("b"); }}
                    className="px-6 py-2 border border-white/20 rounded font-mono text-xs uppercase tracking-[0.15em] text-white/80 hover:bg-white/10 transition-colors"
                  >
                    HOOKED
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATE 4: SCORECARD — overlays on tiles */}
          {(cardState === "scorecard" || cardState === "results") && votedSide && (
            <motion.div
              key="scorecard-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 pointer-events-none"
            >

              {/* Left tile (A) — FMLY badge top-left */}
              <div className="absolute top-2 left-2">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-sm"
                  style={{ background: "rgba(0,0,0,0.7)", fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#fff", letterSpacing: "0.05em" }}
                >
                  {votedSide === "a" ? voteCountA : (totalVotes - voteCountA)} FMLY
                </span>
              </div>

              {/* Right tile (B) — FMLY badge top-right */}
              <div className="absolute top-2 right-2">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-sm"
                  style={{ background: "rgba(0,0,0,0.7)", fontFamily: "'Space Mono', monospace", fontSize: "10px", color: "#fff", letterSpacing: "0.05em" }}
                >
                  {votedSide === "b" ? voteCountB : (totalVotes - voteCountB)} FMLY
                </span>
              </div>

              {/* Centered "LOCKED" text between the two FMLY badges */}
              {cardState === "scorecard" && (
                <motion.p
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/50 whitespace-nowrap"
                  style={{ background: "rgba(0,0,0,0.5)", padding: "2px 6px", borderRadius: "2px" }}
                >
                  LOCKED — FMLY VOTES INCOMING
                </motion.p>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Action area below canvas ──────────────────────────────── */}
      {isBattle && (
        <div className="px-3 py-2.5">
          <AnimatePresence mode="wait">
            {/* STATE 5: RESULTS */}
            {cardState === "results" && votedSide && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-white/80">
                  THE JUDGES HAVE SCORED
                </p>

                <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-white/50">
                  YOUR CALL: {votedHookLabel}
                </p>

                {/* FMLY Scorecard bars */}
                <div className="space-y-1.5 px-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/50 w-16 truncate">
                      {hookA?.hook_label || hookA?.hook_slug || "Hook A"}
                    </span>
                    <div className="flex-1 h-3 bg-white/[0.06] rounded-sm overflow-hidden">
                      <motion.div
                        className="h-full rounded-sm"
                        style={{ background: hookA?.palette?.[0] || "#a855f7" }}
                        initial={{ width: 0 }}
                        animate={{ width: totalVotes > 0 ? `${(voteCountA / totalVotes) * 100}%` : "0%" }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-white/70 w-16 text-right">
                      {voteCountA} FMLY
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/50 w-16 truncate">
                      {hookB?.hook_label || hookB?.hook_slug || "Hook B"}
                    </span>
                    <div className="flex-1 h-3 bg-white/[0.06] rounded-sm overflow-hidden">
                      <motion.div
                        className="h-full rounded-sm"
                        style={{ background: hookB?.palette?.[0] || "#ec4899" }}
                        initial={{ width: 0 }}
                        animate={{ width: totalVotes > 0 ? `${(voteCountB / totalVotes) * 100}%` : "0%" }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-white/70 w-16 text-right">
                      {voteCountB} FMLY
                    </span>
                  </div>
                </div>

                {/* Agreement text */}
                <div className="text-center pt-1">
                  {judgeAgreed ? (
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/60">
                      YOU CALLED IT WITH THE FMLY
                    </p>
                  ) : (
                    <>
                      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/60">
                        YOU SAW IT DIFFERENT
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground/40 mt-0.5">
                        {minorityPct}% OF JUDGES SAW IT YOUR WAY
                      </p>
                    </>
                  )}
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Caption */}
      {post.caption && (
        <div className="px-3 py-2">
          <p className="text-sm text-foreground">
            <span className="font-semibold mr-1.5">{displayName}</span>
            {post.caption}
          </p>
        </div>
      )}

      {/* Live comments + input */}
      <div className="px-3 pb-3 space-y-1.5">
        {liveComments.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {liveComments.map((c) => (
              <p key={c.id} className="text-sm leading-snug">
                <span className="font-semibold mr-1.5">{c.name}</span>
                {c.text}
              </p>
            ))}
          </div>
        )}
        <input
          type="text"
          placeholder="DROP YOUR TAKE LIVE"
          className="w-full bg-muted/40 border border-border/30 rounded px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-colors"
          onKeyDown={(e) => {
            const input = e.target as HTMLInputElement;
            if (e.key === "Enter" && input.value.trim()) {
              const text = input.value.trim();
              const name = user ? (displayName || "You") : "Anon";
              setLiveComments((prev) => [...prev, { id: crypto.randomUUID(), text, name }]);
              input.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}
