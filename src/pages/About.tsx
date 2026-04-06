import { useState } from "react";
import { motion } from "framer-motion";
import { useSiteCopy, type ToolCopy } from "@/hooks/useSiteCopy";

const DEFAULT_TOOL_ORDER = ["songfit", "lyric", "hitfit", "mix", "profit", "playlist", "vibefit", "dreamfit"];

const TABS = ["Our Story", "Your Team"] as const;

export default function About() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Our Story");
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

      {tab === "Our Story" && (
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
                  . I make music. My dad builds tech. Between us we've felt every version of the 3am question — is the mix right, is this actually good, will anyone care? We built tools.fm because we needed the answers ourselves. Every product here exists because we felt the problem first.
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {about.origin_body || "Major artists have teams. A Director who builds the visual world. An A&R who tells them the truth. An Engineer who trusts the ears. A Manager who reads the numbers. A Plug who opens the doors. A Creative who makes the look. Independent artists have never had that team — until now. tools.fm is not a set of tools. It is the label you never had, built by artists who know exactly what was missing."}
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

      {tab === "Your Team" && (
        <motion.div
          key="tools"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            {about.tools_intro || "Six specialists. One FMLY. Major artists have always had the team. Now you do too."}
          </p>

          {([
            ...((siteCopy.features?.tools_order ?? []).filter((key) => DEFAULT_TOOL_ORDER.includes(key))),
            ...DEFAULT_TOOL_ORDER.filter((key) => !(siteCopy.features?.tools_order ?? []).includes(key)),
          ]).filter((key) => {
            const enabled = siteCopy.features?.tools_enabled?.[key];
            return enabled === undefined || enabled === true;
          }).map((key, i) => {
            const tool = siteCopy.tools[key] as ToolCopy;
            if (!tool) return null;
            const product = about.products.find((p) => p.name === tool.label);
            return (
              <motion.div
                key={key}
                className="glass-card rounded-xl p-5 space-y-3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
              >
                <div>
                  <h2 className="text-sm font-semibold">{tool.label}</h2>
                  <p className="font-mono text-[11px] tracking-widest text-muted-foreground">{tool.pill}</p>
                </div>
                {product?.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                )}
                {product?.how && (
                  <div className="border-t border-border/30 pt-3">
                    <p className="text-xs font-medium text-foreground/80 mb-1">What they do</p>
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
