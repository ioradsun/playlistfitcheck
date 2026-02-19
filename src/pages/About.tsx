import { useState } from "react";
import { motion } from "framer-motion";
import { Users, BarChart3, ListMusic, Sliders, FileText, Target, Sparkles, AudioWaveform } from "lucide-react";
import { useSiteCopy, type ToolCopy } from "@/hooks/useSiteCopy";

const DEFAULT_TOOL_ORDER = ["songfit", "hitfit", "vibefit", "profit", "playlist", "mix", "lyric", "dreamfit"];

const TOOL_ICON_MAP: Record<string, any> = {
  songfit: Users,
  hitfit: Target,
  vibefit: AudioWaveform,
  profit: BarChart3,
  playlist: ListMusic,
  mix: Sliders,
  lyric: FileText,
  dreamfit: Sparkles,
};

const TABS = ["Origin Story", "The Tools"] as const;

export default function About() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Origin Story");
  const siteCopy = useSiteCopy();
  const about = siteCopy.about;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-12 space-y-6">
      {/* Tab bar */}
      <div className="flex gap-6 border-b border-border/40">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-xs font-mono tracking-wide transition-colors ${
              tab === t
                ? "text-foreground border-b border-foreground -mb-px"
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

          {(siteCopy.features?.tools_order ?? DEFAULT_TOOL_ORDER).filter((key) => {
            const enabled = siteCopy.features?.tools_enabled?.[key];
            return enabled === undefined || enabled === true;
          }).map((key, i) => {
            const tool = siteCopy.tools[key] as ToolCopy;
            if (!tool) return null;
            const Icon = TOOL_ICON_MAP[key] || Target;
            const product = about.products.find((p) => p.name === tool.label);
            return (
              <motion.div
                key={key}
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
                    <h2 className="text-sm font-semibold">{tool.label}</h2>
                    <p className="font-mono text-[11px] tracking-widest text-muted-foreground">{tool.pill}</p>
                    {tool.subheading && <p className="text-xs text-muted-foreground">{tool.subheading}</p>}
                  </div>
                </div>
                {product?.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                )}
                {product?.how && (
                  <div className="border-t border-border/30 pt-3">
                    <p className="text-xs font-medium text-foreground/80 mb-1">How it works</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {product.how}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
