const Terms = () => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

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
          You own everything you upload. We don't claim any rights to your music, lyrics, audio, or creative work — ever.
          We don't use your files to train models, sell to third parties, or do anything other than run the tool you asked us to run.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What we store vs. what we don't</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Some tools (like LyricFit) store your audio so the project works when you come back.
          That file sits in secure cloud storage tied to your account — we don't open it, modify it, listen to it, or share it.
          Other tools process audio in real-time and discard it immediately.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We also store things like your profile info, analysis results, metadata, saved searches, and any posts
          or comments you make on CrowdFit. This is what makes the app work between sessions — your data,
          not our data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">No guarantees</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          These tools are experiments. Scores, analysis results, AI-generated insights, and recommendations are based on
          pattern recognition and data — they're not promises, professional advice, or guarantees of any outcome.
          Use them as one signal among many. We make no claims about accuracy, completeness, or fitness for
          any particular purpose.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Use at your own risk</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          toolsFM is provided "as is" without warranties of any kind — express or implied. We're not responsible for
          decisions you make based on anything this platform outputs. If you release a song, pitch to a playlist,
          change your strategy, or take any action based on our tools — that's on you. We're here to help, not to be liable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Limitation of liability</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          To the maximum extent permitted by law, toolsFM and its creators shall not be held liable for any
          indirect, incidental, or consequential damages arising from your use of these tools. That includes
          lost revenue, missed opportunities, corrupted files, or anything else. We build with care, but
          things break sometimes — and when they do, we fix them, not pay for them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spotify & third-party data</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We use Spotify's public API to search for tracks, playlists, and artist metadata. We don't access
          your Spotify account beyond what you paste or search for. We're not connected to your Spotify login.
          Third-party data is provided as-is and may change without notice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your account</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can delete your account anytime. When you do, your profile, stored files, and associated data will be removed.
          If you have questions, reach out — we're real people building this.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Changes to these terms</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We might update these terms as the platform evolves. If something major changes, we'll make it visible.
          Continued use of toolsFM after updates means you're good with the new terms.
        </p>
      </section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border">
        Last updated: March 2026
      </p>
    </div>
  );
};

export default Terms;
