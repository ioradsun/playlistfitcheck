const Terms = () => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Terms of Use</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What toolsFM is</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          toolsFM is a set of experimental music tools built for artists, songwriters, and curious music people.
          Everything here is provided as-is — we're building in public, iterating fast, and shipping things we think are useful.
          Some tools will stick around. Some might change. That's the deal.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your music stays yours</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We don't store your uploaded audio files. When you use MixFit, LyricFit, or HitFit, your audio is processed
          in real-time and then discarded. We never keep a copy of your music. Period.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What we do store</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We store things like your profile info, analysis results, metadata, saved searches, and any posts
          or comments you make on SongFit. This is what makes the app work between sessions — your data,
          not your files.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">No guarantees</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These tools are experiments. Scores, analysis results, and recommendations are based on pattern
          recognition and data — they're not promises, professional advice, or guarantees of anything.
          Use them as one signal among many.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spotify data</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We use Spotify's public API to search for tracks, playlists, and artist metadata. We don't access
          your Spotify account beyond what you paste or search for. We're not connected to your Spotify login.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your account</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can delete your account anytime. When you do, your profile and associated data will be removed.
          If you have questions, reach out — we're real people building this.
        </p>
      </section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Last updated: February 2026
      </p>
    </div>
  );
};

export default Terms;
