import { useState } from "react";
import { motion } from "framer-motion";
import { Users, BarChart3, ListMusic, Sliders, FileText, Target } from "lucide-react";
import { useSiteCopy } from "@/hooks/useSiteCopy";

const ICON_MAP: Record<string, any> = {
  CrowdFit: Users,
  ProFit: BarChart3,
  PlaylistFit: ListMusic,
  MixFit: Sliders,
  LyricFit: FileText,
  HitFit: Target,
};

const TABS = ["Origin Story", "The Tools"] as const;

export default function About() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Origin Story");
  const siteCopy = useSiteCopy();
  const about = siteCopy.about;

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

      {tab === "Origin Story" && (
        <motion.div
          key="origin"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="glass-card rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {about.origin_intro || (
                <>
                  I'm{" "}
                  <a
                    href="https://open.spotify.com/artist/1PlkAOmfFYqBYFpN8jDj4v"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline underline-offset-2 font-semibold"
                  >
                    ajan
                  </a>
                  . I make music, so I know the 3am doubt—is the mix ready, is it actually good? My dad builds tech. So we built tools to try and answer those questions.
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {about.origin_body || "We're trying everything. Some will work. Some won't. That's how music works too. But at least we're not guessing alone."}
            </p>
            <p className="text-sm text-primary font-semibold leading-relaxed">
              {about.origin_tagline}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-3 font-medium">{about.listen_label}</p>
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
            {about.tools_intro || "Six tools. One goal: give independent artists the clarity they deserve. No gatekeeping, no vague advice. Just data, context, and a little taste."}
          </p>

          {about.products.map((product, i) => {
            const Icon = ICON_MAP[product.name] || Target;
            return (
              <motion.div
                key={product.name}
                className="glass-card rounded-xl p-5 space-y-3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-primary" />
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
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
