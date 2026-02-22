import { useEffect, useState } from "react";
import { User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { HookData } from "@/hooks/useHookCanvas";

interface VoterRow {
  id: string;
  hook_id: string;
  created_at: string;
  user_id: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  battleId: string | null;
  hookA: HookData | null;
  hookB: HookData | null;
  voteCountA: number;
  voteCountB: number;
  votedHookId: string | null;
  onClose: () => void;
}

export function HookFitVotesSheet({ battleId, hookA, hookB, voteCountA, voteCountB, votedHookId, onClose }: Props) {
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!battleId) return;
    setLoading(true);
    setVoters([]);

    (async () => {
      const { data: votes } = await supabase
        .from("hook_votes" as any)
        .select("id, hook_id, created_at, user_id")
        .eq("battle_id", battleId)
        .order("created_at", { ascending: false });

      const rows = (votes ?? []) as any[];
      if (rows.length === 0) {
        setVoters([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(rows.filter(r => r.user_id).map(r => r.user_id!))];
      let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles || []) {
          profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
      }

      setVoters(rows.map(r => ({
        ...r,
        profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
      })));
      setLoading(false);
    })();
  }, [battleId]);

  const hookALabel = hookA?.hook_label || "Hook A";
  const hookBLabel = hookB?.hook_label || "Hook B";
  const votersA = voters.filter(v => v.hook_id === hookA?.id);
  const votersB = voters.filter(v => v.hook_id === hookB?.id);

  return (
    <Sheet open={!!battleId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Battle Votes</h2>

          {/* Vote count summary */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-border/50 bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-none mb-1">
                {hookALabel}
              </p>
              <p className="text-xl font-bold leading-none">{voteCountA}</p>
            </div>
            <div className="flex-1 rounded-xl border border-border/50 bg-card px-3 py-2.5 text-center">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 leading-none mb-1">
                {hookBLabel}
              </p>
              <p className="text-xl font-bold leading-none">{voteCountB}</p>
            </div>
          </div>
        </div>

        {/* Voters list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : voters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No votes yet.</p>
          ) : (
            <>
              {votersA.length > 0 && (
                <VoterGroup label={hookALabel} voters={votersA} votedHookId={votedHookId} hookId={hookA?.id} />
              )}
              {votersB.length > 0 && (
                <VoterGroup label={hookBLabel} voters={votersB} votedHookId={votedHookId} hookId={hookB?.id} />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VoterGroup({ label, voters, votedHookId, hookId }: { label: string; voters: VoterRow[]; votedHookId: string | null; hookId?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">
        {label} · {voters.length}
      </p>
      <div className="space-y-2">
        {voters.map(v => {
          const name = v.profiles?.display_name || (v.user_id ? "User" : "Anonymous");
          const isYou = votedHookId === hookId && v.hook_id === hookId;
          return (
            <div key={v.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {v.profiles?.avatar_url ? (
                  <img src={v.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-muted-foreground" />
                )}
              </div>
              <span className="text-sm text-foreground truncate">{name}</span>
              {isYou && (
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 ml-auto">You</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
