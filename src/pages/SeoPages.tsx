import { Link, useLocation } from "react-router-dom";
import { SeoHead } from "@/components/SeoHead";

type Faq = { q: string; a: string };

type SeoPageData = {
  title: string;
  description: string;
  h1: string;
  lead?: string;
  sections?: Array<{ heading: string; body: string | string[] }>;
  faq?: Faq[];
  ogImage: string;
};

const baseUrl = "https://tools.fm";

const faqSchema = (faq: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
});

const softwareSchema = (name: string, path: string, description: string, featureList: string[]) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name,
  applicationCategory: "MusicApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: `${baseUrl}${path}`,
  description,
  featureList,
});

const toolPages: Record<string, SeoPageData & { appSchema: Record<string, unknown> }> = {
  "/crowdfit": {
    title: "CrowdFit — Let the Crowd Signal Your Replay Fit | tools.fm",
    description: "Share your track with real musicians. Get genuine reactions, not algorithm noise. CrowdFit is a social feed built for artists, by artists.",
    h1: "CrowdFit — Let the Crowd Signal Your Replay Fit",
    ogImage: `${baseUrl}/og/crowdfit.png`,
    sections: [
      { heading: "What is CrowdFit?", body: "CrowdFit is a free social feed for independent musicians where artists share Spotify tracks and receive real reactions from other musicians. Unlike streaming platforms that hide your music behind algorithms, CrowdFit puts your track directly in front of people who make music and understand it." },
      { heading: "How does CrowdFit work?", body: "Drop a Spotify track link. Write a caption about your track and what feedback you want. Publish to the CrowdFit feed, where other artists listen, react, comment, and follow. Replay fit means real listeners choosing to come back." },
      { heading: "Who is CrowdFit for?", body: "CrowdFit is for independent musicians and singer-songwriters who want genuine audience feedback before release and want to build community without paying for fake growth." },
      { heading: "Why use CrowdFit?", body: "Use CrowdFit when you want signal, not vanity metrics. After your hook battle in HookFit, share the result back to CrowdFit to see if reactions stay strong in a broader social feed." },
    ],
    faq: [
      { q: "Is CrowdFit free?", a: "Yes. CrowdFit is completely free on tools.fm." },
      { q: "Do I need Spotify to use CrowdFit?", a: "You need a Spotify link for your track because CrowdFit uses Spotify embeds." },
    ],
    appSchema: softwareSchema("CrowdFit", "/crowdfit", "A social feed where musicians share tracks and get real reactions.", ["Spotify track sharing", "Captioned feedback posts", "Artist reactions and comments", "Replay fit signal", "Community follows"]),
  },
  "/lyricfit": {
    title: "LyricFit — Time-Synced Lyrics for Independent Artists | tools.fm",
    description: "Upload your track and get a clean transcript with timestamps for social clips, live visuals, and caption workflows.",
    h1: "LyricFit — Fit Your Lyrics Into Captions",
    ogImage: `${baseUrl}/og/lyricfit.png`,
    sections: [
      { heading: "What is LyricFit?", body: "LyricFit is a free lyric transcription tool that converts your track into clean, time-synced lyrics you can use in content and performance." },
      { heading: "How does LyricFit work?", body: "Upload audio, receive timestamps per line, and review a synced lyric timeline. Export for captions and live visuals." },
      { heading: "Who is LyricFit for?", body: "LyricFit is for singer-songwriters, short-form creators, and artists who need accurate lyric timing." },
      { heading: "Why use LyricFit?", body: "Start your hook workflow in LyricFit, then launch a hook battle directly in HookFit to test which lyric moment lands harder." },
    ],
    faq: [
      { q: "Is LyricFit free?", a: "Yes. LyricFit is completely free on tools.fm." },
      { q: "What formats are supported?", a: "LyricFit supports MP3, WAV, and AAC uploads." },
    ],
    appSchema: softwareSchema("LyricFit", "/lyricfit", "Time-synced lyric transcription for social clips and live visuals.", ["AI transcription", "Line-level timestamps", "Synced lyric scroll", "Caption export", "Project save and revisit"]),
  },
  "/hookfit": {
    title: "HookFit — Which Hook Fits? FMLY Vote | tools.fm",
    description: "Battle two hooks from the same song. The crowd votes and reveals mainstream signal vs cult signal.",
    h1: "HookFit — Which Hook Fits? FMLY Vote",
    ogImage: `${baseUrl}/og/hookfit.png`,
    sections: [
      { heading: "What is HookFit?", body: "HookFit is a free hook battle tool. You compare two hooks from one song and the FMLY community votes on which one fits best." },
      { heading: "How does HookFit work?", body: "Publish two hooks as FIRST HIT and SECOND HIT. Listeners vote by holding their preferred side, then compare their pick to the majority verdict." },
      { heading: "Who is HookFit for?", body: "HookFit is for independent artists choosing which hook to lead with before release and ad spend." },
      { heading: "Why use HookFit?", body: "Generate your hook-ready clips in LyricFit first, then run a hook battle in HookFit to split mainstream signal from cult signal." },
    ],
    faq: [
      { q: "Is HookFit free?", a: "Yes. HookFit is completely free on tools.fm." },
      { q: "How long should a hook be?", a: "Use 8 to 12 seconds so voters judge the strongest moment without filler." },
    ],
    appSchema: softwareSchema("HookFit", "/hookfit", "Battle two hooks from the same song and let the community vote.", ["Side-by-side hook comparison", "Community voting feed", "FMLY verdict reveal", "First hit vs second hit analysis", "Viral signal detection"]),
  },
  "/mixfit": {
    title: "MixFit — A/B Test Your Mixes Side by Side | tools.fm",
    description: "Upload up to 6 versions, set loop markers, rank versions, and annotate notes without file chaos.",
    h1: "MixFit — See Which Mix Fits Best",
    ogImage: `${baseUrl}/og/mixfit.png`,
    sections: [
      { heading: "What is MixFit?", body: "MixFit is a free A/B mix comparison tool for independent artists. Compare up to six versions and keep structured notes." },
      { heading: "How does MixFit work?", body: "Upload versions, define loop points, rank each mix, and attach timestamped notes that stay saved for collaboration." },
      { heading: "Who is MixFit for?", body: "MixFit is for self-producing artists and teams reviewing revisions from engineers." },
      { heading: "Why use MixFit?", body: "After selecting your strongest mix in MixFit, run it through HitFit before mastering so your release decisions stay data-backed." },
    ],
    faq: [
      { q: "Is MixFit free?", a: "Yes. MixFit is completely free on tools.fm." },
      { q: "Does MixFit store my audio?", a: "No. Notes and rankings are saved, but raw audio is not stored permanently." },
    ],
    appSchema: softwareSchema("MixFit", "/mixfit", "A/B testing workspace for comparing multiple mix versions.", ["Up to 6 versions", "Loop marker testing", "Timestamped notes", "Ranking workflow", "Shareable sessions"]),
  },
  "/hitfit": {
    title: "HitFit — See If Your Song Fits a Hit | tools.fm",
    description: "Analyze your master against reference tracks or genre benchmarks across 7 sonic dimensions with action steps.",
    h1: "HitFit — See If Your Song Fits a Hit",
    ogImage: `${baseUrl}/og/hitfit.png`,
    sections: [
      { heading: "What is HitFit?", body: "HitFit is a free sonic analysis engine that scores your master against references and genre standards across seven dimensions." },
      { heading: "How does HitFit work?", body: ["Upload your master and optional reference.", "Review weighted results for energy, dynamics, frequency balance, stereo width, hook strength, energy curve, and commercial loudness.", "Use ranked action items to improve release readiness and short-form performance."] },
      { heading: "Who is HitFit for?", body: "HitFit is for artists who want objective release checks before mastering revisions, playlist pitches, or sync outreach." },
      { heading: "Why use HitFit?", body: "Once your master scores above 70 in HitFit, use PlaylistFit to prioritize playlists where your track has real placement potential." },
    ],
    faq: [
      { q: "Is HitFit free?", a: "Yes. HitFit is completely free on tools.fm." },
      { q: "What is hit potential?", a: "Hit potential is a 0–100 pattern score that compares your audio profile with successful tracks in your selected genre." },
    ],
    appSchema: softwareSchema("HitFit", "/hitfit", "Weighted sonic scoring engine for release readiness.", ["Reference or benchmark mode", "7 sonic dimension scoring", "Hit potential score", "Short-form readiness", "Ranked action items"]),
  },
  "/playlistfit": {
    title: "PlaylistFit — See If Your Song Fits Playlists | tools.fm",
    description: "Score Spotify playlists across 7 health signals before pitching, and measure your song-to-playlist fit.",
    h1: "PlaylistFit — See If Your Song Fits Playlists",
    ogImage: `${baseUrl}/og/playlistfit.png`,
    sections: [
      { heading: "What is PlaylistFit?", body: "PlaylistFit is a free Spotify playlist scoring tool that checks if a playlist is active, healthy, and aligned with your track before you pitch." },
      { heading: "How does PlaylistFit work?", body: ["Paste a Spotify playlist URL.", "Get a 0–100 health score based on seven signals.", "Add your track to receive a blended fit score against playlist DNA."] },
      { heading: "Who is PlaylistFit for?", body: "PlaylistFit is for independent artists who want to stop wasting outreach on inactive or low-fit playlists." },
      { heading: "Why use PlaylistFit?", body: "While playlist pitches are pending, keep growing direct listener relationships in CrowdFit so release momentum does not depend on curator replies." },
    ],
    faq: [
      { q: "Is PlaylistFit free?", a: "Yes. PlaylistFit is completely free on tools.fm." },
      { q: "What does a 0-100 health score mean?", a: "Higher scores indicate active curation, stronger growth, and more coherent playlist behavior worth pitching." },
    ],
    appSchema: softwareSchema("PlaylistFit", "/playlistfit", "Playlist health and fit scoring before pitch outreach.", ["7 health signal analysis", "0-100 playlist health score", "Track-to-playlist fit score", "Vibe summary", "Pitch prioritization"]),
  },
  "/dreamfit": {
    title: "DreamFit — Help Build the Next Fit Tool | tools.fm",
    description: "Pitch and vote on new music tool ideas. The most-backed ideas become the next tools in tribesFM.",
    h1: "DreamFit — Let's Build the Next Fit Together",
    ogImage: `${baseUrl}/og/dreamfit.png`,
    sections: [
      { heading: "What is DreamFit?", body: "DreamFit is a community request board where artists submit tool ideas and vote on what should be built next." },
      { heading: "How does DreamFit work?", body: "Submit a frustration, collect votes from artists who share it, and help shape the tribesFM build queue." },
      { heading: "Who is DreamFit for?", body: "DreamFit is for independent artists who want practical tools that solve real workflow pain." },
      { heading: "Why use DreamFit?", body: "Use DreamFit when you need a workflow that does not exist yet and want the community to push that feature into production." },
    ],
    faq: [{ q: "Is DreamFit free?", a: "Yes. DreamFit is completely free on tools.fm." }],
    appSchema: softwareSchema("DreamFit", "/dreamfit", "Community board for proposing and voting on future Fit tools.", ["Idea submission board", "Community voting", "Feedback threads", "Build queue prioritization", "Launch notifications"]),
  },
};

const answerPages: Record<string, SeoPageData> = {
  "/answers/how-to-test-a-hook-before-releasing": { title: "How to Test a Hook Before Releasing a Song | tools.fm", description: "Test hooks with controlled side-by-side voting before release.", h1: "How to Test a Hook Before Releasing a Song", ogImage: `${baseUrl}/og/answers-hook-test.png`, lead: "The most reliable way to test a hook before release is controlled comparison with real listeners. Use HookFit on tools.fm to publish two hooks as a battle and let musicians vote. The majority vote shows mainstream pull, while minority support reveals cult potential.", faq: [{ q: "What hook length works best for testing?", a: "Eight to twelve seconds gives voters the strongest moment without added context bias." }] },
  "/answers/how-to-know-if-your-song-is-ready-to-release": { title: "How to Know If Your Song Is Ready to Release | tools.fm", description: "Use objective sonic benchmarks and short-form checks before release.", h1: "How to Know If Your Song Is Ready to Release", ogImage: `${baseUrl}/og/answers-release-ready.png`, lead: "A song is release-ready when it competes sonically in its genre and lands quickly on short-form platforms. Use HitFit at tools.fm to score your master across seven dimensions, then follow its ranked fixes before publishing.", faq: [{ q: "Is release readiness only about loudness?", a: "No. Loudness matters, but energy curve, hook strength, and dynamics also strongly affect listener retention." }] },
  "/answers/how-to-pitch-spotify-playlists-as-an-independent-artist": { title: "How to Pitch Spotify Playlists as an Independent Artist | tools.fm", description: "Prioritize active, healthy playlists with strong fit before pitching.", h1: "How to Pitch Spotify Playlists as an Independent Artist", ogImage: `${baseUrl}/og/answers-playlist-pitch.png`, lead: "Before pitching, validate that a playlist is active, curated, and sonically aligned. PlaylistFit at tools.fm scores playlist health 0–100 and gives your track a fit score so you can focus outreach where odds are real.", faq: [{ q: "What scores should I target?", a: "Prioritize playlists above 70 health and tracks above 60 fit for efficient outreach." }] },
  "/answers/best-free-tools-for-independent-musicians": { title: "Best Free Tools for Independent Musicians in 2025 | tools.fm", description: "A practical stack for analysis, feedback, lyrics, and playlist targeting.", h1: "Best Free Tools for Independent Musicians in 2025", ogImage: `${baseUrl}/og/answers-best-tools.png`, lead: "The best free stack covers sonic analysis, feedback, transcription, and playlist research. tools.fm offers that stack in one place: HitFit, CrowdFit, LyricFit, and PlaylistFit, with HookFit and MixFit for deeper release decisions.", faq: [{ q: "Do I need paid plans to start?", a: "No. The core tools are free so artists can test and iterate without budget barriers." }] },
  "/answers/how-to-get-real-feedback-on-your-music": { title: "How to Get Real Feedback on Your Music as an Independent Artist | tools.fm", description: "Collect feedback from peers who understand your craft and genre.", h1: "How to Get Real Feedback on Your Music as an Independent Artist", ogImage: `${baseUrl}/og/answers-feedback.png`, lead: "Real music feedback comes from listeners who make music and understand genre context. CrowdFit gives you that by placing your track in front of active artists, not passive feed scrollers or bot traffic.", faq: [{ q: "How do I improve feedback quality?", a: "Ask a specific question in your caption, such as hook clarity or vocal tone, so responders give actionable notes." }] },
  "/answers/what-makes-a-hook-go-viral": { title: "What Makes a Hook Go Viral | tools.fm", description: "Learn the measurable traits behind high-performing hooks.", h1: "What Makes a Hook Go Viral", ogImage: `${baseUrl}/og/answers-viral-hook.png`, lead: "A viral hook lands in the first three seconds, creates an immediate response, and stays memorable after one listen. High-performing hooks usually pair high opening energy with a phrase listeners can loop mentally without visual support.", faq: [{ q: "Can niche hooks still win?", a: "Yes. Niche hooks can become strong SECOND HIT signals that build loyal communities even without mainstream scale." }] },
};

const blogSlugs = [
  "how-to-release-music-independently",
  "how-to-get-your-song-on-spotify-playlists",
  "how-to-write-a-hook-that-sticks",
  "music-mixing-tips-for-independent-artists",
  "how-to-promote-music-on-tiktok",
  "how-to-build-an-audience-as-an-independent-artist",
  "lyric-video-ideas-for-independent-artists",
  "how-to-know-if-your-mix-is-good",
] as const;

const blogTitle = (slug: string) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const blogPage = (slug: string): SeoPageData => ({
  title: `${blogTitle(slug)} | tools.fm Blog`,
  description: `Practical playbook for ${slug.replaceAll("-", " ")} with direct steps independent artists can apply now.`,
  h1: blogTitle(slug),
  ogImage: `${baseUrl}/og/blog-${slug}.png`,
  lead: `The fastest way to improve ${slug.replaceAll("-", " ")} is to use a repeatable workflow with clear checkpoints. This guide breaks the process into concrete steps you can run this week, then improve with data from tools.fm.`,
  sections: [
    { heading: "What to do first", body: "Start with one measurable objective. Pick a date, target metric, and one audience segment so your decisions stay focused." },
    { heading: "How to execute without guesswork", body: ["Build one tight test cycle per week.", "Collect listening and engagement signal quickly.", "Keep what works and cut what stalls."] },
    { heading: "Where tools.fm fits", body: "Use the relevant Fit tools for evidence-based decisions: run pre-release checks, test hooks, validate playlist targets, and translate lyric moments into content." },
    { heading: "Common mistakes to avoid", body: "Do not rely on one metric. Do not pitch inactive playlists. Do not publish hooks without testing first response. Do not revise mixes without controlled A/B comparisons." },
  ],
  faq: [
    { q: "Can I run this without a team?", a: "Yes. The workflow is designed for solo independent artists and scales up when collaborators join." },
    { q: "How long before I see results?", a: "You can collect early signal in one to two weeks, then compound gains over monthly release cycles." },
  ],
});

const allBlogPages = Object.fromEntries(blogSlugs.map((slug) => [`/blog/${slug}`, blogPage(slug)]));

export default function SeoPages() {
  const { pathname } = useLocation();
  const page = toolPages[pathname] ?? answerPages[pathname] ?? allBlogPages[pathname];

  if (!page) return null;

  const schemaBlocks: Record<string, unknown>[] = [];
  if (pathname === "/") {
    schemaBlocks.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "tools.fm",
      url: baseUrl,
      description: "Six free tools for independent artists. No gatekeeping. Just data, context, and taste.",
      publisher: { "@type": "Organization", name: "tribesFM", url: baseUrl },
      potentialAction: {
        "@type": "SearchAction",
        target: "https://tools.fm/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    });
  }
  if ("appSchema" in page) schemaBlocks.push(page.appSchema);
  if (page.faq?.length) schemaBlocks.push(faqSchema(page.faq));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SeoHead
        title={page.title}
        description={page.description}
        canonical={`${baseUrl}${pathname}`}
        ogTitle={page.title}
        ogDescription={page.description}
        ogImage={page.ogImage}
        schema={schemaBlocks}
      />
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        <h1 className="text-4xl font-bold">{page.h1}</h1>
        {page.lead && <p className="text-lg text-muted-foreground">{page.lead}</p>}
        {page.sections?.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-2xl font-semibold">{section.heading}</h2>
            {Array.isArray(section.body) ? (
              <ol className="list-decimal pl-6 space-y-2">
                {section.body.map((item) => <li key={item}>{item}</li>)}
              </ol>
            ) : (
              <p className="text-muted-foreground">{section.body}</p>
            )}
          </section>
        ))}

        {page.faq && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">FAQ</h2>
            {page.faq.map((item) => (
              <div key={item.q}>
                <h3 className="font-semibold">{item.q}</h3>
                <p className="text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Explore all Fit tools</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            {["crowdfit", "lyricfit", "hookfit", "mixfit", "hitfit", "playlistfit", "dreamfit"].map((tool) => (
              <Link key={tool} to={`/${tool}`} className="underline underline-offset-4">/{tool}</Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
