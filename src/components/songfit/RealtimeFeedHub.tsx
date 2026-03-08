import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DanceUpdatePayload = {
  new?: {
    id?: string;
    lyrics?: unknown;
    words?: unknown;
  };
};

export type ReactionInsertPayload = {
  new?: {
    dance_id?: string;
    emoji?: string;
    line_index?: number | null;
  };
};

type DanceSubscriber = (payload: DanceUpdatePayload) => void;
type ReactionSubscriber = (payload: ReactionInsertPayload) => void;

interface RealtimeFeedHubValue {
  subscribeDance: (id: string, callback: DanceSubscriber) => () => void;
  subscribeReactions: (danceId: string, callback: ReactionSubscriber) => () => void;
}

const RealtimeFeedHubContext = createContext<RealtimeFeedHubValue | null>(null);

export function RealtimeFeedHubProvider({ children }: { children: ReactNode }) {
  const danceSubscribers = useRef<Map<string, Set<DanceSubscriber>>>(new Map());
  const reactionSubscribers = useRef<Map<string, Set<ReactionSubscriber>>>(new Map());

  const subscribeDance = useCallback((id: string, callback: DanceSubscriber) => {
    if (!id) return () => undefined;
    const set = danceSubscribers.current.get(id) ?? new Set<DanceSubscriber>();
    set.add(callback);
    danceSubscribers.current.set(id, set);

    return () => {
      const current = danceSubscribers.current.get(id);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) {
        danceSubscribers.current.delete(id);
      }
    };
  }, []);

  const subscribeReactions = useCallback((danceId: string, callback: ReactionSubscriber) => {
    if (!danceId) return () => undefined;
    const set = reactionSubscribers.current.get(danceId) ?? new Set<ReactionSubscriber>();
    set.add(callback);
    reactionSubscribers.current.set(danceId, set);

    return () => {
      const current = reactionSubscribers.current.get(danceId);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) {
        reactionSubscribers.current.delete(danceId);
      }
    };
  }, []);

  useEffect(() => {
    const danceChannel = supabase
      .channel("crowdfit-feed-dances")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "shareable_lyric_dances",
      }, (payload) => {
        const dancePayload = payload as DanceUpdatePayload;
        const id = dancePayload.new?.id;
        if (!id) return;
        const subscribers = danceSubscribers.current.get(id);
        if (!subscribers) return;
        subscribers.forEach((subscriber) => subscriber(dancePayload));
      })
      .subscribe();

    const reactionChannel = supabase
      .channel("crowdfit-feed-reactions")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "lyric_dance_reactions",
      }, (payload) => {
        const reactionPayload = payload as ReactionInsertPayload;
        const danceId = reactionPayload.new?.dance_id;
        if (!danceId) return;
        const subscribers = reactionSubscribers.current.get(danceId);
        if (!subscribers) return;
        subscribers.forEach((subscriber) => subscriber(reactionPayload));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(danceChannel);
      void supabase.removeChannel(reactionChannel);
    };
  }, []);

  const value = useMemo<RealtimeFeedHubValue>(() => ({ subscribeDance, subscribeReactions }), [subscribeDance, subscribeReactions]);

  return <RealtimeFeedHubContext.Provider value={value}>{children}</RealtimeFeedHubContext.Provider>;
}

export function useRealtimeFeedHub() {
  return useContext(RealtimeFeedHubContext);
}
