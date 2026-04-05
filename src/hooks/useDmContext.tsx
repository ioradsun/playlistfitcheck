import { createContext, useContext, type ReactNode } from "react";
import { useDmThreadList } from "@/hooks/useDmThreadList";
import type { DmThreadSummary } from "@/hooks/useDmThreadList";

interface DmContextValue {
  threads: DmThreadSummary[];
  loading: boolean;
  unreadCount: number;
  reload: () => void;
}

const DmContext = createContext<DmContextValue>({
  threads: [],
  loading: false,
  unreadCount: 0,
  reload: () => {},
});

export function DmProvider({ children }: { children: ReactNode }) {
  const { threads, loading, reload } = useDmThreadList();
  const unreadCount = threads.reduce(
    (sum, t) => sum + t.unread_count,
    0,
  );

  return (
    <DmContext.Provider value={{ threads, loading, unreadCount, reload }}>
      {children}
    </DmContext.Provider>
  );
}

export function useDmContext() {
  return useContext(DmContext);
}
