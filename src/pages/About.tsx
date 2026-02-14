import { useState } from "react";
import { motion } from "framer-motion";
import { Users, BarChart3, ListMusic, Sliders, FileText, Target } from "lucide-react";

const PRODUCTS = [
  {
    icon: Users,
    name: "CrowdFit",
    tagline: "See how your song fits listeners.",
    description:
      "A social feed where artists share tracks and the crowd reacts. Post a song, get real feedback from other musicians — not algorithms, not bots. Think of it as a listening room that never closes.",
    how: "Drop a Spotify track, add a caption, and publish. Other artists like, comment, and follow. You build a real audience of people who actually care about music.",
  },
  {
    icon: BarChart3,
    name: "ProFit",
    tagline: "See how your Spotify fits making money.",
    description:
      "A diagnostic engine that reads your Spotify Artist profile and tells you where the money is — and where it isn't. No fluff, no generic advice. Just a blueprint built from your actual data.",
    how: "Paste your Spotify Artist URL. ProFit evaluates 11 signals across your catalog, audience, and activity to generate a Revenue Leverage Scorecard, a 90-day roadmap, and a weekly execution checklist. Then chat with it to go deeper.",
  },
  {
    icon: ListMusic,
    name: "PlaylistFit",
    tagline: "See if your song fits playlists.",
    description:
      "Before you pitch a playlist, know if it's actually worth your time. PlaylistFit scores playlists on a 0–100 scale across 7 categories so you stop wasting energy on dead-end placements.",
    how: "Paste a Spotify playlist URL (and optionally your song URL). The engine evaluates Song Activity, Focus Level, Curator Type, Recent Activity, Reach Per Song, Rotation Style, and Song Placement. You get a health score, a vibe summary, and — if you included your track — a blended fit score that tells you how well your sound matches the playlist's DNA.",
  },
  {
    icon: Sliders,
    name: "MixFit",
    tagline: "See which mix fits best.",
    description:
      "Upload multiple mixes of the same track and A/B test them side by side. Rank, annotate, and compare without losing your mind switching between files.",
    how: "Upload up to 6 audio files, set loop markers, and listen back-to-back. Rank each mix, leave notes, and save the project. Your rankings and notes persist — the audio doesn't get stored, just the metadata.",
  },
  {
    icon: FileText,
    name: "LyricFit",
    tagline: "Make sure your lyrics fit captions.",
    description:
      "Transcribe your track and get time-synced lyrics you can actually use — for social clips, live visuals, or just checking that your words land the way you think they do.",
    how: "Upload an audio file. LyricFit transcribes it with timestamps, so you can scroll through your lyrics synced to the music. Save and revisit anytime.",
  },
  {
    icon: Target,
    name: "HitFit",
    tagline: "See if your song fits a hit.",
    description:
      "An honest check on whether your track has the structural and sonic markers that tend to perform well. Not a guarantee — just pattern recognition from what's already working.",
    how: "Upload your track. HitFit analyzes it against common patterns found in high-performing songs and gives you a read on where you stand.",
  },
];

const TABS = ["Origin", "The Tools"] as const;

export default function About() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Origin");

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-12 space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Origin" && (
        <motion.div
          key="origin"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="glass-card rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <a
                href="https://open.spotify.com/artist/1PlkAOmfFYqBYFpN8jDj4v?si=ZKcGkrQ2RgGnKN-IRsIXEA"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2 font-semibold"
              >
                ajan
              </a>{" "}
              makes music, so he knows the 3am doubt — is the mix ready, should you pitch it, is it actually good? His dad builds tech. Instead of adding more opinions to the noise, they built tools for clarity.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No gatekeepers. No hype. No secrets. Just answers to the questions you're asking yourself at 2am.
            </p>
            <p className="text-sm text-primary font-semibold leading-relaxed">
              tools.fm: less guessing, more answers.
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-3 font-medium">Listen to what started it all.</p>
            <div className="rounded-xl overflow-hidden">
              <iframe
                src="https://open.spotify.com/embed/playlist/6dBswlpXDtfUBLLoCh5U9p?utm_source=generator&theme=0"
                width="100%"
                height="552"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-xl"
              />
            </div>
          </div>
        </motion.div>
      )}

      {tab === "The Tools" && (
        <motion.div
          key="tools"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            Six tools. One goal: give independent artists the clarity they deserve. No gatekeeping, no vague advice. Just data, context, and a little taste.
          </p>

          {PRODUCTS.map((product, i) => (
            <motion.div
              key={product.name}
              className="glass-card rounded-xl p-5 space-y-3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <product.icon size={16} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{product.name}</h2>
                  <p className="text-xs text-primary">{product.tagline}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {product.description}
              </p>
              <div className="border-t border-border/30 pt-3">
                <p className="text-xs font-medium text-foreground/80 mb-1">How it works</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {product.how}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
