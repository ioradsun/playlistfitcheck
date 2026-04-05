import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DmThreadSummary {
  thread_id: string;
  partner_id: string;
  partner_name: string;
  partner_avatar: string | null;
  fmly_number: string | null;
  last_activity_at: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_is_mine: boolean;
}

interface DmThreadListResponse {
  threads?: DmThreadSummary[];
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
      if (!error && data) {
        const payload = data as DmThreadListResponse;
        setThreads(payload.threads ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("dm_thread_list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  return { threads, loading, reload: load };
}
