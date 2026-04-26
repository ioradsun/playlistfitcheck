import { createContext, useContext, useState, type ReactNode } from "react";
import { useDmThreadList } from "@/hooks/useDmThreadList";
import { useDropAlerts } from "@/hooks/useDropAlerts";
import type { DmThreadSummary } from "@/hooks/useDmThreadList";

interface DmContextValue {
  threads: DmThreadSummary[];
  loading: boolean;
  unreadCount: number;
  dropUnreadCount: number;
  totalUnread: number;
  reload: () => void;
  composePartnerId: string | null;
  openCompose: (partnerId: string) => void;
  closeCompose: () => void;
}

const DmContext = createContext<DmContextValue>({
  threads: [],
  loading: false,
  unreadCount: 0,
  dropUnreadCount: 0,
  totalUnread: 0,
  reload: () => {},
  composePartnerId: null,
  openCompose: () => {},
  closeCompose: () => {},
});

export function DmProvider({ children }: { children: ReactNode }) {
  const { threads, loading, reload } = useDmThreadList();
  const { unreadCount: dropUnreadCount } = useDropAlerts();
  const [composePartnerId, setComposePartnerId] = useState<string | null>(null);
  const dmUnreadCount = threads.reduce(
    (sum, t) => sum + t.unread_count,
    0,
  );
  const totalUnread = dmUnreadCount + dropUnreadCount;

  return (
    <DmContext.Provider
      value={{
        threads,
        loading,
        unreadCount: dmUnreadCount,
        dropUnreadCount,
        totalUnread,
        reload,
        composePartnerId,
        openCompose: setComposePartnerId,
        closeCompose: () => setComposePartnerId(null),
      }}
    >
      {children}
    </DmContext.Provider>
  );
}

export function useDmContext() {
  return useContext(DmContext);
}
