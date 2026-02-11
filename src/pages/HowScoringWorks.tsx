import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CATEGORIES = [
  {
    name: "Song Activity",
    max: 20,
    description:
      "Do people actually listen here? This is your best predictor of success. A playlist full of songs with avg popularity 65+ means listeners are engaging, saving, and returning. A playlist full of unknown tracks is a graveyard.",
    tiers: [
      { range: "Avg ≥ 60", score: "20/20", label: "High engagement" },
      { range: "Avg 40–59", score: "15/20", label: "Moderate engagement" },
      { range: "Avg 20–39", score: "8/20", label: "Low engagement" },
      { range: "Avg < 20", score: "0/20", label: "Minimal activity" },
    ],
  },
  {
    name: "Focus Level",
    max: 20,
    description:
      "Is it a niche fit or a crowded mess? Smaller, focused playlists = deeper listener engagement. Huge playlists = your song disappears.",
    tiers: [
      { range: "30–80 tracks", score: "20/20", label: "Ideal sweet spot" },
      { range: "81–150 tracks", score: "15/20", label: "Slightly large" },
      { range: "151–300 tracks", score: "8/20", label: "Diluted" },
      { range: "300+ tracks", score: "0/20", label: "Oversized" },
    ],
  },
  {
    name: "Curator Type",
    max: 15,
    description:
      "Who owns this playlist and how should you pitch? Not all playlists are created equal. Some accept submissions. Some are Spotify editorial. Some have pay-for-play red flags.",
    tiers: [
      { range: "Themed description (15+ chars)", score: "15/15", label: "Strong curation signal" },
      { range: "Spotify editorial", score: "10/15", label: "Editorial — use S4A instead" },
      { range: "Submission language detected", score: "8/15", label: "Accepts submissions" },
      { range: "Pay-for-play keywords", score: "3/15", label: "⚠ High risk" },
    ],
  },
  {
    name: "Recent Activity",
    max: 15,
    description:
      "Is the curator still paying attention? Dead playlists = dead ends. A playlist last updated 2 years ago won't help your song.",
    tiers: [
      { range: "≤ 7 days ago", score: "15/15", label: "Very active" },
      { range: "8–30 days ago", score: "10/15", label: "Active" },
      { range: "31–90 days ago", score: "5/15", label: "Stale" },
      { range: "90+ days ago", score: "0/15", label: "Inactive" },
    ],
  },
  {
    name: "Reach Per Song",
    max: 15,
    description:
      "How many followers per track? This is the exposure each song gets. Same playlist size, different impact depending on follower count.",
    tiers: [
      { range: "≥ 100:1", score: "15/15", label: "Excellent reach" },
      { range: "50–99:1", score: "10/15", label: "Good reach" },
      { range: "20–49:1", score: "5/15", label: "Moderate" },
      { range: "< 20:1", score: "0/15", label: "Low reach" },
    ],
  },
  {
    name: "Rotation Style",
    max: 20,
    description:
      "Will your song stick around or get deleted quickly? Healthy playlists rotate tracks at a moderate pace — not too static, not too volatile. Requires 2+ analyses spaced over time.",
    tiers: [
      { range: "5–25% churn", score: "20/20", label: "Healthy rotation" },
      { range: "26–45% churn", score: "12/20", label: "Moderate churn" },
      { range: "1–4% churn", score: "8/20", label: "Too static" },
      { range: "46–70% churn", score: "5/20", label: "Volatile" },
      { range: "70%+ churn", score: "0/20", label: "Unstable" },
    ],
  },
  {
    name: "Song Placement",
    max: 15,
    description:
      "Are new tracks placed thoughtfully or dumped at the bottom? Bottom-dumping = lazy curation = your song gets buried. Requires 2+ analyses.",
    tiers: [
      { range: "≤ 25% bottom-placed", score: "15/15", label: "Thoughtful placement" },
      { range: "26–50% bottom-placed", score: "10/15", label: "Mixed" },
      { range: "51–75% bottom-placed", score: "5/15", label: "Mostly dumped" },
      { range: "75%+ bottom-placed", score: "0/15", label: "Bottom dump" },
    ],
  },
];

const FIT_LABELS = [
  { range: "85–100", label: "🔥 Great Fit", color: "text-score-excellent", desc: "High confidence. Your song should thrive here." },
  { range: "75–84", label: "👍 Good Fit", color: "text-score-strong", desc: "Solid choice. Worth pitching or submitting." },
  { range: "60–74", label: "🤷 Possible Fit", color: "text-score-ok", desc: "Might work, but better options exist." },
  { range: "40–59", label: "⚠️ Weak Fit", color: "text-score-weak", desc: "Long shot. Only pitch if genre-aligned." },
  { range: "0–39", label: "❌ Poor Fit", color: "text-score-bad", desc: "Skip this one." },
];

const PITCH_LABELS = [
  { label: "Worth Pitching", description: "Score ≥ 75 — this is worth your time." },
  { label: "Accepts Submissions", description: "Description contains submission language (submit, DM). You can pitch directly." },
  { label: "High Risk", description: "⚠ Pay-for-play keywords detected. Avoid." },
  { label: "Spotify Editorial", description: "Spotify-owned playlist. Use Spotify for Artists (S4A) instead." },
  { label: "Low Priority", description: "Score below 75, no submission signals. Only pitch if desperate." },
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
              Every playlist is scored 0–100 across 7 categories. Only available data is counted — the score normalizes automatically.
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

        {/* Fit Labels */}
        <motion.div
          className="glass-card rounded-xl p-5 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-base font-semibold">Fit Labels</h2>
          <div className="space-y-2">
            {FIT_LABELS.map((h) => (
              <div key={h.label} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${h.color}`}>{h.label}</span>
                  <span className="text-xs text-muted-foreground">{h.range}</span>
                </div>
                <span className="text-xs text-muted-foreground">{h.desc}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Pitch Labels */}
        <motion.div
          className="glass-card rounded-xl p-5 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-base font-semibold">Pitch Labels</h2>
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
