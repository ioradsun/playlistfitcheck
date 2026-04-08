import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DmThreadSummary {
  thread_id: string | null;
  partner_id: string;
  partner_name: string;
  partner_avatar: string | null;
  fmly_number: string | null;
  last_activity_at: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_is_mine: boolean;
}

export function useDmThreadList() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<DmThreadSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-dm-threads");
      if (error) {
        console.warn("[dm-threads] fetch failed:", error);
      } else if (data) {
        setThreads((data as { threads?: DmThreadSummary[] }).threads ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user || threads.length === 0) return;

    const threadIds = threads
      .filter((t) => t.thread_id !== null)
      .map((t) => t.thread_id as string);

    if (threadIds.length === 0) return;

    const filter = threadIds.length === 1
      ? `thread_id=eq.${threadIds[0]}`
      : `thread_id=in.(${threadIds.join(",")})`;

    const channel = supabase
      .channel(`dm_list_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, threads, load]);

  return { threads, loading, reload: load };
}
