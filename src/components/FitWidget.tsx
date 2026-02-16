import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ChevronDown, ChevronUp, Users, Zap, Crown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { FitWidgetInviteModal } from "./FitWidgetInviteModal";

const TOOLS = ["hitfit", "vibefit", "profit", "playlist", "mix", "lyric"] as const;

const TOOL_LABELS: Record<string, string> = {
  hitfit: "HitFit",
  vibefit: "VibeFit",
  profit: "ProFit",
  playlist: "PlaylistFit",
  mix: "MixFit",
  lyric: "LyricFit",
};

function ToolUsageBar({ tool }: { tool: string }) {
  const { used, limit, tier } = useUsageQuota(tool);
  const isUnlimited = tier === "unlimited";
  const pct = isUnlimited ? 100 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground/80">{TOOL_LABELS[tool] || tool}</span>
        <span className="font-mono text-muted-foreground">
          {isUnlimited ? "∞" : `${used}/${limit}`}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export function FitWidget() {
  const siteCopy = useSiteCopy();
  const { user, profile } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const isUnlimited = !!(profile as any)?.is_unlimited;
  const tier = !user ? "anonymous" : isUnlimited ? "unlimited" : "free";
  const inviteCode = (profile as any)?.invite_code ?? null;

  // Don't render if growth flow is disabled
  if (!siteCopy.features.growth_flow) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50" style={{ maxWidth: 280 }}>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mb-2 rounded-xl border border-border bg-background/80 backdrop-blur-xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-primary" />
                  <span className="text-xs font-semibold">Fit Widget</span>
                </div>
                <Badge
                  variant={tier === "unlimited" ? "default" : "outline"}
                  className="text-[10px] h-5"
                >
                  {tier === "unlimited" && <Crown size={10} className="mr-1" />}
                  {tier === "anonymous" ? "Guest" : tier === "free" ? "Free" : "Unlimited"}
                </Badge>
              </div>

              {/* Usage bars */}
              <div className="px-3 py-3 space-y-2.5">
                {TOOLS.map((t) => (
                  <ToolUsageBar key={t} tool={t} />
                ))}
              </div>

              {/* CTA */}
              {tier !== "unlimited" && (
                <div className="px-3 pb-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground text-center">
                    {!user
                      ? "Sign up for 10 uses per tool"
                      : "Invite 1 artist → unlock unlimited ✅"}
                  </p>
                  {user && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5 text-xs h-8"
                      onClick={() => setShowInvite(true)}
                    >
                      <Users size={12} />
                      Invite Collaborator
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle button */}
        <motion.button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-full border border-border bg-background/80 backdrop-blur-xl shadow-lg hover:bg-muted/60 transition-colors"
          whileTap={{ scale: 0.95 }}
        >
          <Activity size={14} className="text-primary" />
          <span className="text-xs font-medium">
            {tier === "unlimited" ? (
              <Zap size={12} className="inline text-primary" />
            ) : null}
          </span>
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </motion.button>
      </div>

      <FitWidgetInviteModal
        open={showInvite}
        onOpenChange={setShowInvite}
        inviteCode={inviteCode}
      />
    </>
  );
}
