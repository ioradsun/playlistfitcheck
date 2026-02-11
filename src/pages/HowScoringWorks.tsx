import { motion } from "framer-motion";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CATEGORIES = [
  {
    name: "Size vs Focus",
    max: 20,
    description:
      "Measures whether the playlist is focused enough for listeners to engage deeply. Oversized playlists dilute per-track attention.",
    tiers: [
      { range: "30–80 tracks", score: "20/20", label: "Ideal sweet spot" },
      { range: "81–150 tracks", score: "15/20", label: "Slightly large" },
      { range: "151–300 tracks", score: "8/20", label: "Diluted" },
      { range: "300+ tracks", score: "0/20", label: "Oversized" },
    ],
  },
  {
    name: "Follower/Track Ratio",
    max: 15,
    description:
      "How many followers exist per track. A high ratio means each song gets more listener exposure — a strong quality signal for pitching.",
    tiers: [
      { range: "≥ 100:1", score: "15/15", label: "Excellent reach" },
      { range: "50–99:1", score: "10/15", label: "Good reach" },
      { range: "20–49:1", score: "5/15", label: "Moderate" },
      { range: "< 20:1", score: "0/15", label: "Low reach" },
    ],
  },
  {
    name: "Listener Engagement",
    max: 20,
    description:
      "Average Spotify popularity score (0–100) across all tracks. This reflects real listener activity — saves, streams, and algorithmic traction. The most important signal of whether a playlist drives actual plays.",
    tiers: [
      { range: "Avg ≥ 60", score: "20/20", label: "High engagement" },
      { range: "Avg 40–59", score: "15/20", label: "Moderate engagement" },
      { range: "Avg 20–39", score: "8/20", label: "Low engagement" },
      { range: "Avg < 20", score: "0/20", label: "Minimal activity" },
    ],
  },
  {
    name: "Curator Intent",
    max: 15,
    description:
      "Analyzes the playlist owner and description for signals: Is it Spotify editorial? Does it accept submissions? Are there pay-for-play red flags?",
    tiers: [
      { range: "Themed description (15+ chars)", score: "15/15", label: "Strong curation signal" },
      { range: "Spotify editorial", score: "10/15", label: "Editorial — don't pitch directly" },
      { range: "Submission language detected", score: "8/15", label: "Accepts submissions" },
      { range: "Pay-for-play keywords", score: "3/15", label: "⚠ High risk" },
    ],
  },
  {
    name: "Update Cadence",
    max: 15,
    description:
      "How recently the playlist was updated. Active playlists signal engaged curators. This metric improves with repeated analyses over time.",
    tiers: [
      { range: "≤ 7 days ago", score: "15/15", label: "Very active" },
      { range: "8–30 days ago", score: "10/15", label: "Active" },
      { range: "31–90 days ago", score: "5/15", label: "Stale" },
      { range: "90+ days ago", score: "0/15", label: "Inactive" },
    ],
  },
  {
    name: "Churn vs Stability",
    max: 20,
    description:
      "Track add/remove rate over 30 days. Healthy playlists rotate tracks at a moderate pace — not too static, not too volatile. Requires 2+ analyses spaced over time.",
    tiers: [
      { range: "5–25% churn", score: "20/20", label: "Healthy rotation" },
      { range: "26–45% churn", score: "12/20", label: "Moderate churn" },
      { range: "1–4% churn", score: "8/20", label: "Too static" },
      { range: "46–70% churn", score: "5/20", label: "Volatile" },
      { range: "70%+ churn", score: "0/20", label: "Unstable" },
    ],
  },
  {
    name: "Track Placement",
    max: 15,
    description:
      "Detects whether newly added tracks are placed thoughtfully in the playlist or dumped at the bottom. Bottom-dumping suggests lazy curation. Requires 2+ analyses.",
    tiers: [
      { range: "≤ 25% bottom-placed", score: "15/15", label: "Thoughtful placement" },
      { range: "26–50% bottom-placed", score: "10/15", label: "Mixed" },
      { range: "51–75% bottom-placed", score: "5/15", label: "Mostly dumped" },
      { range: "75%+ bottom-placed", score: "0/15", label: "Bottom dump" },
    ],
  },
];

const HEALTH_LABELS = [
  { range: "85–100", label: "EXCELLENT", color: "text-primary" },
  { range: "75–84", label: "STRONG", color: "text-primary/80" },
  { range: "60–74", label: "OK", color: "text-yellow-400" },
  { range: "40–59", label: "WEAK", color: "text-orange-400" },
  { range: "0–39", label: "BAD", color: "text-destructive" },
];

const PITCH_LABELS = [
  { label: "GOOD_TARGET", description: "Health score ≥ 75 — worth pitching to" },
  { label: "ACCEPTS_SUBMISSIONS", description: "Description contains submission language (submit, DM)" },
  { label: "PAY_FOR_PLAY", description: "⚠ Red flags detected (guaranteed, promo, fee)" },
  { label: "DO_NOT_PITCH_SPOTIFY_OWNED", description: "Spotify editorial — use Spotify for Artists instead" },
  { label: "LOW_PRIORITY", description: "Score below 75, no submission signals" },
];

export default function HowScoringWorks() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        {/* Header */}
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              How <span className="text-gradient-primary">Scoring</span> Works
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every playlist is scored out of 100 across 7 categories. Only available data is counted — the score normalizes automatically.
            </p>
          </div>
        </motion.div>

        {/* Categories */}
        <div className="space-y-6">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.name}
              className="glass-card rounded-xl p-5 space-y-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{cat.name}</h2>
                <span className="text-xs font-mono text-primary">max {cat.max} pts</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cat.tiers.map((tier) => (
                  <div key={tier.range} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                    <span className="text-xs text-secondary-foreground">{tier.range}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{tier.label}</span>
                      <span className="text-xs font-mono text-primary font-semibold">{tier.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Health labels */}
        <motion.div
          className="glass-card rounded-xl p-5 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-base font-semibold">Health Labels</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {HEALTH_LABELS.map((h) => (
              <div key={h.label} className="text-center bg-secondary/40 rounded-lg px-3 py-2">
                <span className={`text-sm font-bold ${h.color}`}>{h.label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{h.range}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Pitch suitability */}
        <motion.div
          className="glass-card rounded-xl p-5 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-base font-semibold">Pitch Suitability</h2>
          <div className="space-y-2">
            {PITCH_LABELS.map((p) => (
              <div key={p.label} className="flex items-start gap-3 bg-secondary/40 rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-primary font-semibold whitespace-nowrap">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.description}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
