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
