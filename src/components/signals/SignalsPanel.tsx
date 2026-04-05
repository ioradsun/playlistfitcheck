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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "#0a0a0a",
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.2)",
            fontFamily: "monospace",
          }}
        >
          Sign in to see your connections.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      <div
        className={activePartnerId ? "hidden md:flex" : "flex"}
        style={{
          width: 280,
          flexShrink: 0,
          flexDirection: "column",
        }}
      >
        <DmThreadList
          threads={threads}
          loading={loading}
          activePartnerId={activePartnerId}
          onSelect={(t) => setSearchParams({ partner: t.partner_id })}
        />
      </div>

      {activeThread ? (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            className="md:hidden"
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              onClick={() => setSearchParams({})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                fontFamily: "monospace",
                padding: 0,
              }}
            >
              <ArrowLeft size={14} />
              back
            </button>
          </div>

          <DmThreadView partner={activeThread} />
        </div>
      ) : pendingThread ? (
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              fontFamily: "monospace",
            }}
          >
            Loading…
          </p>
        </div>
      ) : (
        <div
          className="hidden md:flex"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.15)",
              fontFamily: "monospace",
            }}
          >
            select a connection
          </p>
        </div>
      )}
    </div>
  );
}
