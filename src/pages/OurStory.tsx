import { motion } from "framer-motion";

export default function OurStory() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12 space-y-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold tracking-tight">
            Our <span className="text-gradient-primary">Story</span>
          </h1>
        </motion.div>

        <motion.div
          className="glass-card rounded-xl p-6 space-y-5"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            <a
              href="https://open.spotify.com/artist/1PlkAOmfFYqBYFpN8jDj4v?si=ZKcGkrQ2RgGnKN-IRsIXEA"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-2 font-semibold"
            >
              Ajan Patel
            </a>{" "}
            — Son — makes music.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeep Patel — Father — makes tech.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ajan Patel has problems. Sundeep Patel has solutions.
          </p>
          <p className="text-sm text-primary font-semibold leading-relaxed">
            tools.fm was born.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
