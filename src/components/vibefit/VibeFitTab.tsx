import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VibeFitForm, type VibeFitInput } from "./VibeFitForm";
import { VibeFitResults, type VibeFitOutput } from "./VibeFitResults";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const DAILY_LIMIT = 2;
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

export function VibeFitTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VibeFitOutput | null>(null);
  const [lastInput, setLastInput] = useState<VibeFitInput | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const usage = getUsageToday();
  const atLimit = usage >= DAILY_LIMIT;

  const generate = useCallback(async (input: VibeFitInput) => {
    if (getUsageToday() >= DAILY_LIMIT) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setLastInput(input);
    try {
      const { data, error } = await supabase.functions.invoke("vibefit-generate", {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      incrementUsage();
      setResult(data as VibeFitOutput);
    } catch (e) {
      console.error("VibeFit error:", e);
      toast.error(e instanceof Error ? e.message : "Failed to generate. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegenerate = useCallback(() => {
    if (lastInput) generate(lastInput);
  }, [lastInput, generate]);

  const handleBack = useCallback(() => {
    setResult(null);
  }, []);

  if (result) {
    return (
      <VibeFitResults
        result={result}
        onBack={handleBack}
        onRegenerate={handleRegenerate}
        regenerating={loading}
      />
    );
  }

  return (
    <>
      <div className="flex-1 flex items-center justify-center">
        <VibeFitForm
          onSubmit={generate}
          loading={loading}
          disabled={atLimit}
          disabledMessage={atLimit ? "Daily limit reached. Upgrade for unlimited fits." : undefined}
        />
      </div>

      {/* Upgrade Modal */}
      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" /> Upgrade to VibeFit Pro
            </DialogTitle>
            <DialogDescription>
              You've used your 2 free generations today. Upgrade for unlimited fits, priority generation, and more.
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
