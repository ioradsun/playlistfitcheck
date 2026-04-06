import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DmThreadList } from "@/components/signals/DmThreadList";
import { DmThreadView } from "@/components/signals/DmThreadView";
import { useAuth } from "@/hooks/useAuth";
import { useDmContext } from "@/hooks/useDmContext";

export function SignalsPanel() {
  const { user } = useAuth();
  const { threads, loading } = useDmContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const activePartnerId = searchParams.get("partner");

  const activeThread = threads.find(
    (t) => t.partner_id === activePartnerId,
  ) ?? null;
  const pendingThread = activePartnerId && !activeThread && loading;

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-xs text-muted-foreground/40 font-mono">
          Sign in to see your connections.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <div
        className={`${activePartnerId ? "hidden md:flex" : "flex"} w-[280px] shrink-0 flex-col`}
      >
        <DmThreadList
          threads={threads}
          loading={loading}
          activePartnerId={activePartnerId}
          onSelect={(t) => setSearchParams({ partner: t.partner_id })}
        />
      </div>

      {activeThread ? (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="md:hidden px-3.5 py-2 border-b border-border">
            <button
              onClick={() => setSearchParams({})}
              className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer text-muted-foreground text-xs font-mono p-0"
            >
              <ArrowLeft size={14} />
              back
            </button>
          </div>

          <DmThreadView partner={activeThread} />
        </div>
      ) : pendingThread ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-muted-foreground/40 font-mono">
            Loading…
          </p>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground/30 font-mono">
            select a connection
          </p>
        </div>
      )}
    </div>
  );
}
