import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { Music, ChevronDown, ChevronUp, Zap, Crown, ArrowRight, UserPlus } from "lucide-react";
import { TrailblazerBadge } from "./TrailblazerBadge";
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
  const isNearLimit = !isUnlimited && limit > 0 && used >= limit * 0.8;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{TOOL_LABELS[tool] || tool}</span>
      <span className={`font-mono ${isNearLimit ? "text-destructive" : "text-muted-foreground/60"}`}>
        {isUnlimited ? "∞" : `${used}/${limit}`}
      </span>
    </div>
  );
}

export function FitWidget() {
  const siteCopy = useSiteCopy();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const location = useLocation();
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

  // Don't render if growth flow is disabled or on artist stage pages
  if (!siteCopy.features.growth_flow || location.pathname.startsWith("/artist/")) return null;

  return (
    <TooltipProvider>
      <div
        ref={widgetRef}
        className="fixed z-50 select-none"
        style={{
          bottom: 16 - pos.y,
          right: 16 - pos.x,
          width: 280,
          touchAction: "none",
        }}
      >
        {/* Panel — always mounted so iframe stays alive; hidden via CSS when collapsed */}
        <div
          className={`mb-2 rounded-xl border bg-background/80 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-200 origin-bottom flex flex-col ${
            collapsed
              ? "max-h-0 opacity-0 pointer-events-none border-transparent shadow-none !mb-0"
              : "opacity-100 border-border"
          }`}
          style={{ height: collapsed ? 0 : "auto" }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between cursor-pointer shrink-0" onClick={() => setCollapsed(true)}>
            <div className="flex items-center gap-2">
              <Music size={14} className="text-primary" />
            </div>
            {user ? (
              <TrailblazerBadge userId={user.id} compact />
            ) : tier !== "unlimited" ? (
              <Badge variant="default" className="text-[10px] h-5 bg-muted-foreground/80 text-white">Guest</Badge>
            ) : null}
          </div>

          {/* Body — flex-1 fills remaining space */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {tier !== "unlimited" ? (
              <>
                <div className="px-3 py-3 space-y-2.5 flex-1 overflow-y-auto">
                  {TOOLS.map((t) => (
                    <ToolUsageBar key={t} tool={t} forceUnlimited={false} />
                  ))}
                </div>
                <div className="px-3 pb-3 pt-1 shrink-0">
                  {!user ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8"
                      onClick={() => navigate("/auth")}
                    >
                      Sign Up
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8"
                      onClick={() => setShowInvite(true)}
                    >
                      Invite Artist
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-0 pt-1 pb-2 shrink-0">
                  <div className="w-full rounded-lg overflow-hidden" style={{ backgroundColor: resolvedTheme === "dark" ? "#121212" : "#f5f5f5" }}>
                    <iframe
                      src={`https://open.spotify.com/embed/playlist/6dBswlpXDtfUBLLoCh5U9p?utm_source=generator&theme=${resolvedTheme === "dark" ? "0" : "1"}`}
                      width="100%"
                      height={152}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="border-0 block"
                      title="toolsFM Playlist"
                    />
                  </div>
                </div>
                <div className="px-3 pb-3 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs h-8"
                    onClick={() => setShowInvite(true)}
                  >
                    Invite Artist
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Floating bubble toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={`ml-auto flex items-center justify-center w-12 h-12 rounded-full border-none bg-primary shadow-lg cursor-grab active:cursor-grabbing transition-shadow ${
                shouldPulse ? "animate-pulse glow-primary" : ""
              }`}
              whileTap={{ scale: 0.93 }}
              style={{ userSelect: "none" }}
            >
              <Music size={16} className="text-primary-foreground" />
              {tier === "unlimited" && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
              )}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs max-w-[220px] space-y-0.5">
            {tier === "unlimited" ? (
              <p>toolsFM — Unlimited ⚡</p>
            ) : tier === "limited" ? (
              <p>Invite 1 other artist to unlock Unlimited</p>
            ) : (
              <>
                <p className="font-semibold">Get your Badge.</p>
                <p>Join {pioneerTotal} early FMLY. <em>(max 1,000)</em></p>
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
