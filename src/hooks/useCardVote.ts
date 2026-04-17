import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";
import { useVoteGate } from "@/hooks/useVoteGate";

const SESSION_COUNT_KEY = "fmly_reviews_this_session";

function incrementSessionReviewCount() {
  const next = parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10) + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
}

interface Options {
  /** When true, unauthed users vote via session_id instead of being redirected to /Auth */
  allowAnonymous?: boolean;
  /** Alias for allowAnonymous */
  anonymous?: boolean;
  /** When false, skip the initial vote lookup and score fetch */
  enabled?: boolean;
}

export interface CardVoteState {
  votedSide: "a" | "b" | null;
  score: { total: number; replay_yes: number } | null;
  note: string;
  setNote: (note: string) => void;
  alreadyChecked: boolean;
  handleVote: (replay: boolean) => void;
  handleSubmit: () => Promise<void>;
}

export function useCardVote(postId: string, options: Options = {}): CardVoteState {
  const allowAnonymous = options.allowAnonymous ?? options.anonymous ?? false;
  const enabled = options.enabled ?? true;
  const { user } = useAuth();
  const sessionId = getSessionId();
  const navigate = useNavigate();
  const { addCredit } = useVoteGate();

  const [votedSide, setVotedSide] = useState<"a" | "b" | null>(null);
  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [score, setScore] = useState<{ total: number; replay_yes: number } | null>(null);
  const [note, setNote] = useState("");
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  useEffect(() => {
    if (!postId || !enabled) return;

    let cancelled = false;
    const check = async () => {
      let q = supabase
        .from("feed_hook_reviews" as any)
        .select("id, would_replay")
        .eq("post_id", postId);
      q = user
        ? q.eq("user_id", user.id)
        : q.eq("session_id", sessionId).is("user_id", null);
      const { data } = await q.maybeSingle();
      if (cancelled) return;
      if (data) {
        const voted = (data as any).would_replay;
        const side = voted === true ? "a" : voted === false ? "b" : null;
        setWouldReplay(voted);
        setVotedSide(side);
      }
      const results = await fetchResults();
      if (cancelled) return;
      setScore({ total: results.total, replay_yes: results.replay_yes });
      setAlreadyChecked(true);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [enabled, postId, user, sessionId]);

  const fetchResults = async () => {
    const { data } = await supabase
      .from("feed_hook_reviews" as any)
      .select("would_replay")
      .eq("post_id", postId);
    const rows = (data || []) as any[];
    let replay_yes = 0;
    for (const row of rows) {
      if (row.would_replay === true) replay_yes++;
    }
    return { total: rows.length, replay_yes };
  };

  const handleVote = (replay: boolean) => {
    if (!user && !allowAnonymous) {
      navigate("/Auth", { state: { returnTab: "fmly" } });
      return;
    }
    const clickedSide = replay ? "a" : "b";
    if (votedSide === clickedSide) {
      setVotedSide(null);
      setWouldReplay(null);
      setScore((prev) => {
        if (!prev) return prev;
        return {
          total: Math.max(0, prev.total - 1),
          replay_yes: replay ? Math.max(0, prev.replay_yes - 1) : prev.replay_yes,
        };
      });
      (async () => {
        try {
          let q = supabase.from("feed_hook_reviews" as any).delete().eq("post_id", postId);
          if (user) q = q.eq("user_id", user.id);
          else q = q.eq("session_id", sessionId).is("user_id", null);
          await q;
        } catch {
          // ignore
        }
        window.dispatchEvent(new CustomEvent("fmly:vote"));
      })();
      return;
    }
    setWouldReplay(replay);
    setVotedSide(clickedSide);
    addCredit();

    // Optimistically update score so UI never shows "calibrating" after a vote
    setScore((prev) => {
      const total = (prev?.total ?? 0) + 1;
      const replay_yes = (prev?.replay_yes ?? 0) + (replay ? 1 : 0);
      return { total, replay_yes };
    });

    // Auto-persist the vote in the background
    const persistVote = async () => {
      try {
        const payload: any = {
          post_id: postId,
          hook_rating: "solid",
          would_replay: replay,
          context_note: null,
        };
        if (user) {
          payload.user_id = user.id;
          await supabase
            .from("feed_hook_reviews" as any)
            .upsert(payload, { onConflict: "user_id,post_id" });
        } else {
          payload.session_id = sessionId;
          await supabase
            .from("feed_hook_reviews" as any)
            .upsert(payload, { onConflict: "session_id,post_id" });
        }
      } catch {
        // ignore
      }
      incrementSessionReviewCount();
      window.dispatchEvent(new CustomEvent("fmly:vote"));
    };
    persistVote();
  };

  const handleSubmit = async () => {
    if (!alreadyChecked || wouldReplay === null) return;
    // Update context note on existing review
    if (note.trim()) {
      try {
        const payload: any = {
          post_id: postId,
          hook_rating: "solid",
          would_replay: wouldReplay,
          context_note: note.trim(),
        };
        if (user) {
          payload.user_id = user.id;
          await supabase
            .from("feed_hook_reviews" as any)
            .upsert(payload, { onConflict: "user_id,post_id" });
        } else {
          payload.session_id = sessionId;
          await supabase
            .from("feed_hook_reviews" as any)
            .upsert(payload, { onConflict: "session_id,post_id" });
        }
      } catch {
        // ignore
      }
    }
    setNote("");
  };

  return { votedSide, score, note, setNote, alreadyChecked, handleVote, handleSubmit };
}
