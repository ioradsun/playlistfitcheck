import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { VibeFitForm, type VibeFitInput } from "./VibeFitForm";
import { VibeFitResults, type VibeFitOutput } from "./VibeFitResults";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const DAILY_LIMIT = 20;
const STORAGE_KEY = "vibefit_usage";

function getUsageToday(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    return date === today ? count : 0;
  } catch {
    return 0;
  }
}

function incrementUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const current = getUsageToday();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: current + 1 }));
}

const LoadingScreen = () => (
  <motion.div
    className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <div className="relative">
      <div className="w-20 h-20 rounded-full border-2 border-primary/30 flex items-center justify-center">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    </div>
    <div className="text-center space-y-2">
      <h2 className="text-lg font-semibold">Generating Your Vibe…</h2>
      <p className="text-sm text-muted-foreground">
        Creating cover art and captions that fit your song
      </p>
    </div>
  </motion.div>
);

interface VibeFitTabProps {
  initialResult?: { input: VibeFitInput; result: VibeFitOutput } | null;
  onProjectSaved?: () => void;
}

export function VibeFitTab({ initialResult, onProjectSaved }: VibeFitTabProps = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VibeFitOutput | null>(initialResult?.result || null);
  const [lastInput, setLastInput] = useState<VibeFitInput | null>(initialResult?.input || null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { user } = useAuth();

  const usage = getUsageToday();
  const atLimit = usage >= DAILY_LIMIT;

  const generate = useCallback(async (input: VibeFitInput) => {
    if (getUsageToday() >= DAILY_LIMIT) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setLastInput(input);
    setResult(null); // Hide form, show loading
    try {
      const { data, error } = await supabase.functions.invoke("vibefit-generate", {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      incrementUsage();
      const output = data as VibeFitOutput;
      setResult(output);

      // Save for authenticated users
      if (user) {
        try {
          await supabase.from("saved_vibefit").insert({
            user_id: user.id,
            song_title: input.songTitle,
            genre: input.genre,
            moods: input.moods,
            result_json: { input, result: output } as any,
          });
          onProjectSaved?.();
        } catch (e) {
          console.error("Failed to save VibeFit:", e);
        }
      }
    } catch (e) {
      console.error("VibeFit error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to generate. Try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [user, onProjectSaved]);

  const handleRegenerate = useCallback(() => {
    if (lastInput) generate(lastInput);
  }, [lastInput, generate]);

  const handleBack = useCallback(() => {
    setResult(null);
    setLastInput(null);
  }, []);

  // Loading state — form hidden, spinner shown
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingScreen />
      </div>
    );
  }

  // Results view
  if (result) {
    return (
      <VibeFitResults
        result={result}
        songTitle={lastInput?.songTitle}
        onBack={handleBack}
        onRegenerate={handleRegenerate}
        regenerating={loading}
      />
    );
  }

  // Input form
  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <h1 className="text-xl font-semibold text-center">Art & Captions for your song</h1>
        <VibeFitForm
          onSubmit={generate}
          loading={loading}
          disabled={atLimit}
          disabledMessage={atLimit ? "Daily limit reached. Upgrade for unlimited fits." : undefined}
        />
      </div>

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" /> Upgrade to VibeFit Pro
            </DialogTitle>
            <DialogDescription>
              You've used your 20 free generations today. Upgrade for unlimited fits, priority generation, and more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="glass-card rounded-lg p-4 space-y-2">
              <div className="text-lg font-bold">$9<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Unlimited generations</li>
                <li>✓ Priority AI processing</li>
                <li>✓ Save to My Fits history</li>
                <li>✓ HD cover art exports</li>
              </ul>
            </div>
            <Button className="w-full" onClick={() => {
              toast.info("Coming soon! Stay tuned for VibeFit Pro.");
              setShowUpgrade(false);
            }}>
              Get VibeFit Pro
            </Button>
            <p className="text-xs text-center text-muted-foreground">No payment required yet — coming soon.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
