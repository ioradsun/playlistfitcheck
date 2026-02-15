import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, ChevronDown } from "lucide-react";
import { FIT_OPTIONS } from "./types";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onCreated: () => void;
}

export function DreamToolsComposer({ onCreated }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [frustration, setFrustration] = useState("");
  const [transformation, setTransformation] = useState("");
  const [dreamType, setDreamType] = useState<"feature" | "new_fit">("new_fit");
  const [targetFit, setTargetFit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const canSubmit = title.trim() && frustration.trim() && transformation.trim() && !submitting;

  const handleSubmit = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("dream_tools").insert({
        user_id: user.id,
        title: title.trim(),
        frustration: frustration.trim(),
        transformation: transformation.trim(),
        dream_type: dreamType,
        target_fit: dreamType === "feature" ? targetFit || null : null,
      });
      if (error) throw error;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      toast.success("Dream launched! 🚀");
      setTitle("");
      setFrustration("");
      setTransformation("");
      setDreamType("new_fit");
      setTargetFit("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Failed to launch dream");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="glass-card rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Name your Dream</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-color palettes for moody graphic novels"
            className="w-full h-11 bg-transparent border-0 border-b border-border focus:border-primary outline-none text-sm transition-colors"
            maxLength={120}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">What's frustrating you?</label>
          <textarea
            value={frustration}
            onChange={(e) => setFrustration(e.target.value)}
            placeholder="I spend hours doing this manually every time..."
            className="w-full bg-transparent border-0 border-b border-border focus:border-primary outline-none text-sm resize-none transition-colors"
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">If this existed, what would change?</label>
          <textarea
            value={transformation}
            onChange={(e) => setTransformation(e.target.value)}
            placeholder="I could focus on the creative part instead of the boring stuff"
            className="w-full bg-transparent border-0 border-b border-border focus:border-primary outline-none text-sm resize-none transition-colors"
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDreamType("new_fit")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                dreamType === "new_fit"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              🚀 New Fit
            </button>
            <button
              onClick={() => setDreamType("feature")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                dreamType === "feature"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              🧩 Feature
            </button>
          </div>

          <AnimatePresence>
            {dreamType === "feature" && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <select
                  value={targetFit}
                  onChange={(e) => setTargetFit(e.target.value)}
                  className="h-8 px-2 rounded-md bg-muted border-0 text-xs text-foreground outline-none"
                >
                  <option value="">Which Fit?</option>
                  {FIT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity glow-primary relative overflow-hidden"
        >
          <span className="flex items-center justify-center gap-2">
            <Sparkles size={16} />
            Launch Dream
          </span>
        </button>

        {showConfetti && (
          <motion.div
            initial={{ opacity: 1, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none text-4xl"
          >
            🚀✨
          </motion.div>
        )}
      </div>
    </div>
  );
}
