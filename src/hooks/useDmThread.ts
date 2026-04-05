import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ActivityEventKind =
  | "fire"
  | "play"
  | "lyric_comment"
  | "post_comment"
  | "save"
  | "follow"
  | "message";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  direction: "incoming" | "outgoing";
  created_at: string;
  song_name?: string;
  line_index?: number;
  time_sec?: number;
  hold_ms?: number;
  fire_count?: number;
  max_progress_pct?: number;
  play_count?: number;
  duration_sec?: number;
  was_muted?: boolean;
  text?: string;
  sender_id?: string;
  is_read?: boolean;
}

interface ThreadActivityResponse {
  events?: ActivityEvent[];
  thread_id?: string | null;
}

export function useDmThread(partnerUserId: string | null) {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!user || !partnerUserId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-thread-activity", {
        body: { partner_user_id: partnerUserId },
      });
      if (!error && data) {
        const payload = data as ThreadActivityResponse;
        setEvents(payload.events ?? []);
        setThreadId(payload.thread_id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [partnerUserId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`dm_thread_${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const msg = payload.new as {
            id: string;
            sender_id: string;
            content: string;
            created_at: string;
            is_read: boolean;
          };
          setEvents((prev) => [
            ...prev,
            {
              id: msg.id,
              kind: "message",
              direction: msg.sender_id === user?.id ? "outgoing" : "incoming",
              created_at: msg.created_at,
              text: msg.content,
              sender_id: msg.sender_id,
              is_read: msg.is_read,
            },
          ]);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [threadId, user?.id]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !partnerUserId || !content.trim()) return;

    setSending(true);
    try {
      const [ua, ub] = [user.id, partnerUserId].sort();
      const { data: thread, error: threadError } = await supabase
        .from("dm_threads" as any)
        .upsert(
          { user_a_id: ua, user_b_id: ub },
          { onConflict: "user_a_id,user_b_id", ignoreDuplicates: false },
        )
        .select("id")
        .single();

      if (threadError || !thread) return;

      const tid = (thread as { id: string }).id;
      setThreadId(tid);

      await supabase.from("dm_messages" as any).insert({
        thread_id: tid,
        sender_id: user.id,
        content: content.trim(),
      });
    } finally {
      setSending(false);
    }
  }, [partnerUserId, user]);

  const markRead = useCallback(async () => {
    if (!threadId || !user) return;

    await supabase
      .from("dm_messages" as any)
      .update({ is_read: true })
      .eq("thread_id", threadId)
      .eq("is_read", false)
      .neq("sender_id", user.id);
  }, [threadId, user]);

  const updatePresence = useCallback(async () => {
    if (!threadId || !user) return;

    await supabase.from("dm_presence" as any).upsert(
      {
        thread_id: threadId,
        user_id: user.id,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "thread_id,user_id" },
    );
  }, [threadId, user]);

  return {
    events,
    threadId,
    loading,
    sending,
    sendMessage,
    markRead,
    updatePresence,
  };
}
