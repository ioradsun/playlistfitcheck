import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, ChevronDown, ChevronUp, Users, Zap, Crown, ArrowRight, UserPlus } from "lucide-react";
import { TrailblazerBadge } from "./TrailblazerBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useSiteCopy } from "@/hooks/useSiteCopy";
import { useAuth } from "@/hooks/useAuth";
import { useUsageQuota } from "@/hooks/useUsageQuota";
import { FitWidgetInviteModal } from "./FitWidgetInviteModal";
import { useTrailblazer } from "@/hooks/useTrailblazer";
import { useNavigate } from "react-router-dom";

const TOOLS = ["hitfit", "vibefit", "profit", "playlist", "mix", "lyric"] as const;

const TOOL_LABELS: Record<string, string> = {
  hitfit: "HitFit",
  vibefit: "VibeFit",
  profit: "ProFit",
  playlist: "PlaylistFit",
  mix: "MixFit",
  lyric: "LyricFit",
};

function ToolUsageBar({ tool, forceUnlimited }: { tool: string; forceUnlimited?: boolean }) {
  const { used, limit, tier } = useUsageQuota(tool);
  const isUnlimited = forceUnlimited || tier === "unlimited";
  const pct = isUnlimited ? 100 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = !isUnlimited && limit > 0 && used >= limit * 0.8;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground/80">{TOOL_LABELS[tool] || tool}</span>
        <span className={`font-mono ${isNearLimit ? "text-destructive" : "text-muted-foreground"}`}>
          {isUnlimited ? "∞" : `${used}/${limit}`}
        </span>
      </div>
      <Progress
        value={pct}
        className={`h-1.5 ${isNearLimit ? "[&>div]:bg-destructive" : ""}`}
      />
    </div>
  );
}

export function FitWidget() {
  const siteCopy = useSiteCopy();
  const { user, profile } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [socialUnlocked, setSocialUnlocked] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(false);

  // Draggable state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  const isUnlimited = !!(profile as any)?.is_unlimited || socialUnlocked;
  const tier = !user ? "anonymous" : isUnlimited ? "unlimited" : "limited";
  const inviteCode = (profile as any)?.invite_code ?? null;
  const navigate = useNavigate();
  const { total: pioneerTotal } = useTrailblazer();

  // Listen for social share unlock
  useEffect(() => {
    const handler = () => setSocialUnlocked(true);
    window.addEventListener("social-share-unlocked", handler);
    return () => window.removeEventListener("social-share-unlocked", handler);
  }, []);

  // Pulse when near limit on any tool
  useEffect(() => {
    if (tier === "unlimited") {
      setShouldPulse(false);
      return;
    }
    const interval = setInterval(() => {
      setShouldPulse(true);
      setTimeout(() => setShouldPulse(false), 2000);
    }, 30000);
    return () => clearInterval(interval);
  }, [tier]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    setDragging(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setDragging(true);
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const wasDrag = dragging;
    dragStart.current = null;
    // If it was a drag, don't toggle
    if (!wasDrag) setCollapsed((c) => !c);
    setTimeout(() => setDragging(false), 0);
  }, [dragging]);

  // Don't render if growth flow is disabled
  if (!siteCopy.features.growth_flow) return null;

  return (
    <TooltipProvider>
      <div
        ref={widgetRef}
        className="fixed z-50 select-none"
        style={{
          bottom: 16 - pos.y,
          right: 16 - pos.x,
          maxWidth: 280,
          touchAction: "none",
        }}
      >
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
                  <Music size={14} className="text-primary" />
                  <span className="text-xs font-semibold">toolsFM</span>
                </div>
                {user ? (
                  <TrailblazerBadge userId={user.id} compact />
                ) : tier !== "unlimited" ? (
                  <Badge variant="outline" className="text-[10px] h-5">Guest</Badge>
                ) : null}
              </div>

              {tier !== "unlimited" ? (
                <>
                  {/* Usage bars */}
                  <div className="px-3 py-3 space-y-2.5">
                    {TOOLS.map((t) => (
                      <ToolUsageBar key={t} tool={t} forceUnlimited={false} />
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="px-3 pb-3 space-y-2">
                    {!user ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-xs h-8"
                        onClick={() => navigate("/auth")}
                      >
                        Sign Up
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-xs h-8"
                        onClick={() => setShowInvite(true)}
                      >
                        <Users size={12} />
                        Invite Artist
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="px-3 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-xs h-8"
                    onClick={() => setShowInvite(true)}
                  >
                    <Users size={12} />
                    Invite Artist
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating bubble toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={`ml-auto flex items-center justify-center w-12 h-12 rounded-full border border-border bg-background/80 backdrop-blur-xl shadow-lg cursor-grab active:cursor-grabbing transition-shadow ${
                shouldPulse ? "animate-pulse glow-primary" : ""
              }`}
              whileTap={{ scale: 0.93 }}
              style={{ userSelect: "none" }}
            >
              <div className="flex items-center gap-0.5">
                <Music size={16} className="text-primary" />
                <ArrowRight size={10} className="text-primary/60" />
              </div>
              {tier === "unlimited" && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
              )}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs max-w-[220px] space-y-0.5">
            {tier === "unlimited" ? (
              <p>toolsFM — Unlimited ⚡</p>
            ) : tier === "limited" ? (
              <p>Invite to unlock one</p>
            ) : (
              <>
                <p className="font-semibold">Get your Badge.</p>
                <p>Join {pioneerTotal} early pioneers with Unlimited Usage. <em>(max 1,000)</em></p>
              </>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      <FitWidgetInviteModal
        open={showInvite}
        onOpenChange={setShowInvite}
        inviteCode={inviteCode}
        isUnlimited={tier === "unlimited"}
      />
    </TooltipProvider>
  );
}
