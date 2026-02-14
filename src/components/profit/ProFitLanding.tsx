import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, TrendingUp, DollarSign, BarChart3 } from "lucide-react";

interface ProFitLandingProps {
  onAnalyze: (url: string) => void;
  loading: boolean;
}

const EXAMPLE_URL = "https://open.spotify.com/artist/6qqNVTkY8uBg9cP3Jd7DAH";

export const ProFitLanding = ({ onAnalyze, loading }: ProFitLandingProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onAnalyze(url.trim());
  };

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto flex flex-col items-center gap-10 py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Hero */}
      <div className="text-center space-y-3">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-2"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
        >
          <DollarSign size={14} />
          Free AI Revenue Consulting
        </motion.div>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Turn listeners into income.
        </p>
        <p className="text-sm text-muted-foreground/70">
          Paste your Spotify artist link → get your highest-probability revenue path.
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-3">
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/artist/..."
            className="flex-1 h-12 text-base"
            disabled={loading}
          />
          <Button type="submit" size="lg" disabled={loading || !url.trim()} className="h-12 px-6">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          </Button>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => { setUrl(EXAMPLE_URL); onAnalyze(EXAMPLE_URL); }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            disabled={loading}
          >
            Try an example artist
          </button>
        </div>
      </form>

      {/* Trust */}
      <p className="text-xs text-muted-foreground/60 text-center">
        No login required. We only analyze public Spotify data.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        {[
          { icon: BarChart3, label: "Tier Classification" },
          { icon: TrendingUp, label: "Revenue Scorecard" },
          { icon: DollarSign, label: "90-Day Roadmap" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-card/50">
            <Icon size={12} />
            {label}
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <motion.div
          className="flex flex-col items-center gap-4 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 rounded-full border-2 border-primary/30 flex items-center justify-center">
            <Loader2 size={28} className="text-primary animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Analyzing artist data...</p>
            <p className="text-xs text-muted-foreground">Fetching Spotify signals & generating your blueprint</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
