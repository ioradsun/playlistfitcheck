import { motion } from "framer-motion";

export default function OurStory() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-12 space-y-4">
      <motion.div
        className="glass-card rounded-xl p-6 space-y-5"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          I make music, so I know the 3am doubt—is the mix ready, is it actually good? My dad builds tech. So we built tools to try and answer those questions.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We're trying everything. Some will work. Some won't. That's how music works too. But at least we're not guessing alone.
        </p>
        <p className="text-sm text-primary font-semibold leading-relaxed">
          tools.fm: experiments to find answers.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
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
      </motion.div>
    </div>
  );
}
