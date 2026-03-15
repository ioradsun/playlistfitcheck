import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { SignalCard } from "@/components/signals/SignalCard";
import { type SignalCategory, type SignalGroup, useNotifications } from "@/hooks/useNotifications";

const TABS: Array<{ label: string; value: "all" | SignalCategory }> = [
  { label: "All", value: "all" },
  { label: "Momentum", value: "momentum" },
  { label: "Lyrics", value: "lyrics" },
  { label: "Social", value: "social" },
];

type BucketKey = "Now" | "Today" | "This week" | "Earlier";

function toBucket(dateIso: string): BucketKey {
  const now = Date.now();
  const ts = new Date(dateIso).getTime();
  const diff = now - ts;
  if (diff < 30 * 60 * 1000) return "Now";
  if (diff < 24 * 60 * 60 * 1000) return "Today";
  if (diff < 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}

function bucketOpacity(bucket: BucketKey) {
  if (bucket === "This week") return "opacity-[0.65]";
  if (bucket === "Earlier") return "opacity-50";
  return "opacity-100";
}

export function SignalsPanel() {
  const navigate = useNavigate();
  const { grouped, loading, markAllRead, getSignalCategory } = useNotifications();
  const [tab, setTab] = useState<"all" | SignalCategory>("all");

  const visibleGroups = useMemo(() => {
    const withoutStandaloneSkips = grouped.filter((group) => group.type !== "skip");

    return withoutStandaloneSkips.filter((group) => {
      if (tab === "all") return true;
      return getSignalCategory(group.type) === tab;
    });
  }, [getSignalCategory, grouped, tab]);

  const skipGroups = useMemo(
    () => grouped.filter((group) => group.type === "skip" && group.post_id),
    [grouped]
  );

  const bucketed = useMemo(() => {
    const map = new Map<BucketKey, SignalGroup[]>();
    visibleGroups.forEach((group) => {
      const bucket = toBucket(group.latest_at);
      const list = map.get(bucket) || [];
      list.push(group);
      map.set(bucket, list);
    });
    return map;
  }, [visibleGroups]);

  return (
    <div className="h-full flex flex-col px-4 md:px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Signals</h2>
          <p className="text-xs text-[#777]">What your music is doing right now</p>
        </div>
        <button onClick={markAllRead} className="text-xs text-[#4ade80] hover:underline">Mark all read</button>
      </div>

      <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-[#121212] border border-[#1f1f1f]">
        {TABS.map((item) => (
          <button
            key={item.value}
            onClick={() => setTab(item.value)}
            className={`px-3 py-1.5 rounded-md text-xs transition-colors ${tab === item.value ? "bg-[#1d1d1d] text-foreground" : "text-[#777] hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {loading ? <p className="text-xs text-[#777]">Loading signals…</p> : null}

        {(["Now", "Today", "This week", "Earlier"] as BucketKey[]).map((bucket) => {
          const groups = bucketed.get(bucket) || [];
          if (groups.length === 0) return null;

          return (
            <section key={bucket} className={bucketOpacity(bucket)}>
              <p className="text-[10px] uppercase tracking-widest text-[#555] mb-2">{bucket}</p>
              <div className="space-y-2">
                {groups.map((group) => {
                  const skipCount = group.type === "run_it_back"
                    ? skipGroups
                        .filter(
                          (skipGroup) =>
                            skipGroup.post_id === group.post_id &&
                            Math.abs(
                              new Date(skipGroup.latest_at).getTime() -
                                new Date(group.latest_at).getTime()
                            ) <
                              30 * 60 * 1000
                        )
                        .reduce((total, skipGroup) => total + skipGroup.total_count, 0)
                    : 0;

                  return (
                    <SignalCard
                      key={group.key}
                      group={group}
                      skipCount={skipCount}
                      onNavigate={(path) => navigate(path)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {!loading && visibleGroups.length === 0 ? (
          <div className="h-48 rounded-lg border border-[#1f1f1f] bg-[#101010] flex flex-col items-center justify-center gap-2">
            <Bell size={18} className="text-[#666]" />
            <p className="text-xs text-[#777]">No signals yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
