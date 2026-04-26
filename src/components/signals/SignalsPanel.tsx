import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DropAlertList } from "@/components/signals/DropAlertList";
import { DmThreadList } from "@/components/signals/DmThreadList";
import { DmThreadView } from "@/components/signals/DmThreadView";
import { useAuth } from "@/hooks/useAuth";
import { useDmContext } from "@/hooks/useDmContext";

export function SignalsPanel() {
  const { user } = useAuth();
  const { threads, loading } = useDmContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const activePartnerId = searchParams.get("partner");
  const tabParam = searchParams.get("tab");
  const activeTab = activePartnerId
    ? "connections"
    : tabParam === "drops"
      ? "drops"
      : "connections";

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
    <div className="h-full bg-background overflow-hidden flex flex-col">
      <div className="flex border-b border-border">
        <button
          onClick={() => setSearchParams({ tab: "connections" })}
          className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
            activeTab === "connections"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground/50 hover:text-muted-foreground/80"
          }`}
        >
          connections
        </button>
        <button
          onClick={() => setSearchParams({ tab: "drops" })}
          className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
            activeTab === "drops"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground/50 hover:text-muted-foreground/80"
          }`}
        >
          drops
        </button>
      </div>

      {activeTab === "drops" ? (
        <DropAlertList />
      ) : (
        <div className="flex h-full bg-background overflow-hidden">
          <div
            className={`${activePartnerId ? "hidden md:flex" : "flex"} w-[280px] shrink-0 flex-col`}
          >
            <DmThreadList
              threads={threads}
              loading={loading}
              activePartnerId={activePartnerId}
              onSelect={(t) =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("partner", t.partner_id);
                  next.set("tab", "connections");
                  return next;
                })
              }
            />
          </div>

          {activeThread ? (
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="md:hidden px-3.5 py-2 border-b border-border">
                <button
                  onClick={() =>
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("partner");
                      return next;
                    })
                  }
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
      )}
    </div>
  );
}
