import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Share2, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface FitWidgetInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteCode: string | null;
}

function ProgressRing({ progress, size = 48, stroke = 3 }: { progress: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </svg>
  );
}

function InviteTab({ inviteUrl, inviteCode }: { inviteUrl: string; inviteCode: string | null }) {
  const [copied, setCopied] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setJustCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
    setTimeout(() => setJustCopied(false), 1200);
  }, [inviteUrl]);

  return (
    <div className="space-y-4 pt-1">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Know another artist? Invite them to join. When they sign up, you both get unlimited usage.
        Every artist they invite can do the same — grow your network and level up together!
      </p>

      <div className="flex gap-2">
        <Input value={inviteUrl} readOnly className="text-xs font-mono bg-muted/30" />
        <motion.div whileTap={{ scale: 0.9 }}>
          <Button
            size="icon"
            variant="outline"
            onClick={handleCopy}
            disabled={!inviteCode}
            className="relative overflow-hidden transition-colors hover:border-primary/50"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Check size={14} className="text-primary" />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <Copy size={14} />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <AnimatePresence>
          {justCopied && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2"
            >
              <ProgressRing progress={50} size={32} stroke={2.5} />
              <span className="text-xs text-primary font-medium">Link copied — waiting for signup</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

function ShareTab() {
  const [shared, setShared] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);

  const shareUrl = "https://tools.fm";

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied!");
  }, []);

  const handleShared = useCallback(() => {
    setShared(true);
    setShowSparkle(true);
    toast.success("Thanks for sharing! Unlimited unlocked 🎉");
    setTimeout(() => setShowSparkle(false), 2000);
  }, []);

  return (
    <div className="space-y-4 pt-1">
      <p className="text-sm text-muted-foreground leading-relaxed">
        No collaborators? No problem. Share your unique link to tools.fm and tap "I Shared" to
        unlock unlimited usage. Simple, no pressure, and you help other artists discover the tools.
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2 text-xs h-9 hover:border-primary/50 transition-colors"
          onClick={handleCopyLink}
        >
          <motion.div
            whileHover={{ x: 3 }}
            transition={{ duration: 0.2 }}
          >
            <ExternalLink size={13} />
          </motion.div>
          Copy Link
        </Button>
        <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
          <Button
            size="sm"
            className="w-full gap-2 text-xs h-9"
            onClick={handleShared}
            disabled={shared}
          >
            {shared ? (
              <>
                <Check size={13} />
                Shared!
              </>
            ) : (
              <>
                <Share2 size={13} />
                I Shared
              </>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Sparkle celebration */}
      <div className="flex items-center justify-center h-8">
        <AnimatePresence>
          {showSparkle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -5 }}
              className="flex items-center gap-2"
            >
              <ProgressRing progress={100} size={28} stroke={2.5} />
              <Sparkles size={14} className="text-primary animate-pulse" />
              <span className="text-xs text-primary font-medium">Unlimited Unlocked!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function FitWidgetInviteModal({ open, onOpenChange, inviteCode }: FitWidgetInviteModalProps) {
  const baseUrl = window.location.hostname === "localhost"
    ? window.location.origin
    : "https://tools.fm";
  const inviteUrl = inviteCode
    ? `${baseUrl}/?ref=${inviteCode}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Unlock Unlimited Usage
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <Tabs defaultValue="invite" className="px-5 pb-5">
          <TabsList className="w-full mb-3 h-9 bg-muted/50">
            <TabsTrigger value="invite" className="flex-1 gap-1.5 text-xs data-[state=active]:shadow-sm">
              <Users size={12} />
              Invite an Artist
            </TabsTrigger>
            <TabsTrigger value="share" className="flex-1 gap-1.5 text-xs data-[state=active]:shadow-sm">
              <Share2 size={12} />
              Share on Social
            </TabsTrigger>
          </TabsList>

          <div className="min-h-[190px]">
            <TabsContent value="invite" className="mt-0">
              <InviteTab inviteUrl={inviteUrl} inviteCode={inviteCode} />
            </TabsContent>

            <TabsContent value="share" className="mt-0">
              <ShareTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
