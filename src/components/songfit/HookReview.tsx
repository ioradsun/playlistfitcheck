import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSessionId } from "@/lib/sessionId";

interface Props {
  postId: string;
  isOwner?: boolean;
  onOpenReviews?: () => void;
  onReviewRemoved?: () => void;
  spotifyTrackUrl?: string;
  artistsJson?: any[];
  onScored?: () => void;
  onUnscored?: () => void;
  onVotedSide?: (side: "a" | "b" | null) => void;
  isBattle?: boolean;
  onOpenReactions?: () => void;
  onRegisterVoteHandler?: (fn: (replay: boolean) => void) => void;
  onRegisterSubmitHandler?: (fn: () => void) => void;
  onResultsChange?: (results: { total: number; replay_yes: number } | null) => void;
  showPreResolved?: boolean;
  preResolved?: { total: number; replay_yes: number; saves_count?: number };
  rank?: number;
}

interface Results {
  total: number;
  replay_yes: number;
  replay_no: number;
}

const SESSION_COUNT_KEY = "crowdfit_reviews_this_session";

function incrementSessionReviewCount() {
  const next = parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10) + 1;
  sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
}

export function HookReview({ postId, onScored, onVotedSide, onRegisterVoteHandler, onRegisterSubmitHandler, onResultsChange }: Props) {
  const { user } = useAuth();
  const sessionId = getSessionId();

  const navigate = useNavigate();

  const [wouldReplay, setWouldReplay] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [alreadyChecked, setAlreadyChecked] = useState(false);
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    const check = async () => {
      let q = supabase.from("songfit_hook_reviews").select("id, would_replay").eq("post_id", postId);
      q = user ? q.eq("user_id", user.id) : q.eq("session_id", sessionId).is("user_id", null);
      const { data } = await q.maybeSingle();
      if (data) {
        const voted = (data as any).would_replay;
        setWouldReplay(voted);
        onVotedSide?.(voted === true ? "a" : voted === false ? "b" : null);
        fetchResults().then((r) => {
          setResults(r);
        });
        onScored?.();
      }
      setAlreadyChecked(true);
    };
    check();
  }, [postId, user, sessionId]);

  const fetchResults = async (): Promise<Results> => {
    const { data } = await supabase
      .from("songfit_hook_reviews")
      .select("would_replay")
      .eq("post_id", postId);
    const rows = data || [];
    let replay_yes = 0, replay_no = 0;
    for (const row of rows) {
      if (row.would_replay === true) replay_yes++;
      else if (row.would_replay === false) replay_no++;
    }
    return { total: rows.length, replay_yes, replay_no };
  };

  const handleVote = (replay: boolean) => {
    if (!user) { navigate("/Auth", { state: { returnTab: "crowdfit" } }); return; }
    setWouldReplay(replay);
    onVotedSide?.(replay ? "a" : "b");
  };

  useEffect(() => {
    onRegisterVoteHandler?.(handleVote);
  }, [onRegisterVoteHandler, user]);

  const handleSubmit = async (text: string) => {
    try {
      const payload: any = {
        post_id: postId,
        hook_rating: "solid",
        would_replay: wouldReplay,
        context_note: text.trim() || null,
      };
      if (user) payload.user_id = user.id;
      else payload.session_id = sessionId;
      await supabase.from("songfit_hook_reviews").insert(payload);
    } catch { /* ignore unique constraint */ }
    incrementSessionReviewCount();
    window.dispatchEvent(new CustomEvent("crowdfit:vote"));
    const r = await fetchResults();
    setResults(r);
    onScored?.();
  };

  const hasVoted = wouldReplay !== null;

  useEffect(() => {
    onRegisterSubmitHandler?.(() => {
      if (!alreadyChecked || !hasVoted) return;
      void handleSubmit(note);
      setNote("");
    });
  }, [onRegisterSubmitHandler, alreadyChecked, hasVoted, note]);

  useEffect(() => {
    onResultsChange?.(results ? { total: results.total, replay_yes: results.replay_yes } : null);
  }, [results, onResultsChange]);
  if (!alreadyChecked || !hasVoted) return null;

  // HookReview renders nothing — all UI is in the canvas
  return null;
}
