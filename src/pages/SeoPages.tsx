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
  // New canonical SEO paths
  "/fmly-seo": {
    title: "FMLY — See What Your FMLY Is Making | tools.fm",
    description: "Drop your track. The FMLY fires what connects. Real reactions from real music makers — not algorithm noise, not vanity metrics.",
    h1: "FMLY — Your music. Their fire.",
    ogImage: `${baseUrl}/og/crowdfit.png`,
    sections: [
      { heading: "What is FMLY?", body: "FMLY is the community stream at the heart of tools.fm. Artists drop songs and beats. The FMLY fires what connects. Real reactions from people who make music — not bots, not paid plays, not inflated numbers. Drop your track and find out what's hitting before the world does." },
      { heading: "Who is FMLY for?", body: "FMLY is for people here for their songs, their beats, or their taste. Songs and beats are what you make. Taste is how you move the culture — the ear that fires a track before anyone knows the name. Every kind of creator belongs in the FMLY." },
      { heading: "How does it work?", body: "Drop your track to the FMLY feed. Write a caption. The community fires the moments that hit — on the lines that land for songs, on the timestamps that connect for beats. You see exactly which part of your music resonates. Real signal. No gatekeeping." },
      { heading: "Why FMLY over everywhere else?", body: "Everywhere else optimises for reach. FMLY optimises for truth. You're not performing for an algorithm. You're dropping for the family." },
    ],
    faq: [
      { q: "Is FMLY free?", a: "Yes. FMLY is completely free on tools.fm." },
      { q: "Do I need Spotify to use FMLY?", a: "You need a Spotify link for your track. FMLY uses Spotify embeds so the community hears it properly." },
      { q: "What does firing mean?", a: "Firing is how the FMLY reacts. Tap or hold the fire button on the moments that hit. It tells the artist exactly which part of their track connects." },
      { q: "What is taste?", a: "Taste is the people who make artists. The ones who fire a track before anyone knows the name. If you champion music more than you make it — you belong in the FMLY." },
    ],
    appSchema: softwareSchema("FMLY", "/fmly", "The community stream where artists drop music and the FMLY fires what connects.", ["Track drops", "Fire reactions", "Moment-level feedback", "Community follows", "FMLY Top 40"]),
  },
  "/the-director-seo": {
    title: "the Director — Turn Sound Into Motion | tools.fm",
    description: "Upload your song or beat. The Director builds a cinematic visual world around it. The FMLY fires it in real time.",
    h1: "the Director — Turn sound into motion.",
    ogImage: `${baseUrl}/og/lyricfit.png`,
    sections: [
      { heading: "What is the Director?", body: "The Director is the creative director on your team. Upload a song and your lyrics sync to a moving canvas — word by word, moment by moment, section by section. Upload a beat and the waveform becomes the visual. Section imagery shifts with the mood. The FMLY fires what connects in real time. Your sound finally has a world." },
      { heading: "Songs and beats. Both.", body: "Song mode syncs your lyrics to a cinematic canvas. Every line gets a visual moment, every section gets its own imagery. Beat mode makes the waveform the star — section imagery shifts with the energy, fires land on timestamps. Same Director. Different fuel." },
      { heading: "Who is the Director for?", body: "For artists who want their music to look as good as it sounds. For producers who want their beats to have a world. For anyone who has been posting static images over music and knows there is a better way." },
      { heading: "How does the Director differ from the Creative?", body: "The Director handles the track in motion — the visual experience while the music plays. The Creative builds the world around the release — the art, the assets, the aesthetic on your socials. The Director is the track in motion. The Creative is the release in the world." },
    ],
    faq: [
      { q: "Is the Director free?", a: "Yes. The Director is completely free on tools.fm." },
      { q: "What audio formats work?", a: "MP3, WAV, and M4A. Upload your song or your beat — the Director handles both." },
      { q: "What is the difference between song mode and beat mode?", a: "Song mode syncs your lyrics to the canvas. Beat mode skips the lyrics and uses the waveform as the visual — fires land on timestamps instead of lines." },
    ],
    appSchema: softwareSchema("the Director", "/the-director", "Upload your song or beat. The Director builds a cinematic visual world around it.", ["Lyric sync canvas", "Beat visualization", "Cinematic section imagery", "Real-time fire reactions", "Shareable visual output"]),
  },
  // Legacy SEO paths (kept for backwards compat)
  "/crowdfit": {
    title: "FMLY — See What Your FMLY Is Making | tools.fm",
    description: "Drop your track. The FMLY fires what connects. Real reactions from real music makers — not algorithm noise, not vanity metrics.",
    h1: "FMLY — Your music. Their fire.",
    ogImage: `${baseUrl}/og/crowdfit.png`,
    sections: [
      {
        heading: "What is FMLY?",
        body: "FMLY is the community stream at the heart of tools.fm. Artists drop songs and beats. The FMLY fires what connects. Real reactions from people who make music — not bots, not paid plays, not inflated numbers. Drop your track and find out what's hitting before the world does.",
      },
      {
        heading: "Who is FMLY for?",
        body: "FMLY is for people here for their songs, their beats, or their taste. Songs and beats are what you make. Taste is how you move the culture — the ear that fires a track before anyone knows the name. Every kind of creator belongs in the FMLY.",
      },
      {
        heading: "How does it work?",
        body: "Drop your track to the FMLY feed. Write a caption. The community fires the moments that hit — on the lines that land for songs, on the timestamps that connect for beats. You see exactly which part of your music resonates. Real signal. No gatekeeping.",
      },
      {
        heading: "Why FMLY over everywhere else?",
        body: "Everywhere else optimises for reach. FMLY optimises for truth. You're not performing for an algorithm. You're dropping for the family.",
      },
    ],
    faq: [
      { q: "Is FMLY free?", a: "Yes. FMLY is completely free on tools.fm." },
      { q: "Do I need Spotify to use FMLY?", a: "You need a Spotify link for your track. FMLY uses Spotify embeds so the community hears it properly." },
      { q: "What does firing mean?", a: "Firing is how the FMLY reacts. Tap or hold the fire button on the moments that hit. It tells the artist exactly which part of their track connects." },
      { q: "What is taste?", a: "Taste is the people who make artists. The ones who fire a track before anyone knows the name. If you champion music more than you make it — you belong in the FMLY." },
    ],
    appSchema: softwareSchema("FMLY", "/crowdfit", "The community stream where artists drop music and the FMLY fires what connects.", ["Track drops", "Fire reactions", "Moment-level feedback", "Community follows", "FMLY Top 40"]),
  },
  "/lyricfit": {
    title: "the Director — Turn Sound Into Motion | tools.fm",
    description: "Upload your song or beat. The Director builds a cinematic visual world around it. The FMLY fires it in real time.",
    h1: "the Director — Turn sound into motion.",
    ogImage: `${baseUrl}/og/lyricfit.png`,
    sections: [
      { heading: "What is the Director?", body: "The Director is the creative director on your team. Upload a song and your lyrics sync to a moving canvas — word by word, moment by moment, section by section. Upload a beat and the waveform becomes the visual. Section imagery shifts with the mood. The FMLY fires what connects in real time. Your sound finally has a world." },
      { heading: "Songs and beats. Both.", body: "Song mode syncs your lyrics to a cinematic canvas. Every line gets a visual moment, every section gets its own imagery. Beat mode makes the waveform the star — section imagery shifts with the energy, fires land on timestamps. Same Director. Different fuel." },
      { heading: "Who is the Director for?", body: "For artists who want their music to look as good as it sounds. For producers who want their beats to have a world. For anyone who has been posting static images over music and knows there is a better way." },
      { heading: "How does the Director differ from the Creative?", body: "The Director handles the track in motion — the visual experience while the music plays. The Creative builds the world around the release — the art, the assets, the aesthetic on your socials. The Director is the track in motion. The Creative is the release in the world." },
    ],
    faq: [
      { q: "Is the Director free?", a: "Yes. The Director is completely free on tools.fm." },
      { q: "What audio formats work?", a: "MP3, WAV, and M4A. Upload your song or your beat — the Director handles both." },
      { q: "What is the difference between song mode and beat mode?", a: "Song mode syncs your lyrics to the canvas. Beat mode skips the lyrics and uses the waveform as the visual — fires land on timestamps instead of lines." },
    ],
    appSchema: softwareSchema("the Director", "/lyricfit", "Upload your song or beat. The Director builds a cinematic visual world around it.", ["Lyric sync canvas", "Beat visualization", "Cinematic section imagery", "Real-time fire reactions", "Shareable visual output"]),
  },
  "/mixfit": {
    title: "the Engineer — Trust Your Ears | tools.fm",
    description: "Two versions. Loop points. A/B switching. Timestamped notes. You leave with a decision.",
    h1: "the Engineer — Trust your ears.",
    ogImage: `${baseUrl}/og/mixfit.png`,
    sections: [
      { heading: "What is the Engineer?", body: "The Engineer is the decision-maker on your team. You have been going back and forth between two versions since midnight. The Engineer gives you loop points, A/B switching, and timestamped notes — everything you need to stop second-guessing and commit. You leave with a decision." },
      { heading: "How does it work?", body: "Upload up to six versions of the same track. Set loop markers so you are comparing the same section across every version. Switch between them instantly. Add notes at any timestamp. Rank them. Decide. No more file chaos, no more endless back and forth." },
      { heading: "Who is the Engineer for?", body: "For self-producing artists deciding between mix revisions. For artists working with engineers who need to give structured feedback. For anyone who has had three versions of the same track open in three different tabs." },
      { heading: "What happens after?", body: "Take your final mix to the A&R for a release-readiness check. Then bring it to the Plug to build the pitch. The team works together." },
    ],
    faq: [
      { q: "Is the Engineer free?", a: "Yes. The Engineer is completely free on tools.fm." },
      { q: "Does the Engineer store my audio?", a: "Notes and rankings are saved. Raw audio is not stored permanently — it lives in your session." },
    ],
    appSchema: softwareSchema("the Engineer", "/mixfit", "A/B mix comparison with loop points, rankings, and timestamped notes.", ["Up to 6 versions", "Loop marker testing", "A/B switching", "Timestamped notes", "Ranking workflow"]),
  },
  "/hitfit": {
    title: "the A&R — Is It Ready? | tools.fm",
    description: "Honest ears. No hype. Upload your track and get a real read on whether it is ready before you drop it.",
    h1: "the A&R — Is it ready?",
    ogImage: `${baseUrl}/og/hitfit.png`,
    sections: [
      { heading: "What is the A&R?", body: "The A&R is the honest set of ears on your team. Not your hype man. Not your mum. The person who listens to your track and tells you the truth — how it compares to what is breaking, where it stands, whether it is the one. Pre-release doubt has a cure. This is it." },
      { heading: "What does the A&R actually check?", body: "The A&R scores your master across seven sonic dimensions — energy, dynamics, frequency balance, stereo width, hook strength, energy curve, and commercial loudness. Then it tells you exactly what to address before you drop." },
      { heading: "Who is the A&R for?", body: "For artists who want objective truth before mastering revisions, playlist pitches, or sync outreach. For producers who need to know if the mix is ready. For anyone who has released something and wished they had caught it earlier." },
      { heading: "What happens after?", body: "Once the A&R gives you the read, take the mix back to the Engineer to make the call. Then bring it to the Plug to build the pitch. The team works together." },
    ],
    faq: [
      { q: "Is the A&R free?", a: "Yes. The A&R is completely free on tools.fm." },
      { q: "What is hit potential?", a: "Hit potential is a 0–100 pattern score that compares your audio profile with successful tracks in your selected genre. It is a signal, not a verdict." },
    ],
    appSchema: softwareSchema("the A&R", "/hitfit", "Honest sonic analysis. Seven dimensions. Is it ready?", ["7 sonic dimension scoring", "Hit potential score", "Reference or benchmark mode", "Short-form readiness", "Ranked action items"]),
  },
  "/playlistfit": {
    title: "the Plug — Get In the Room | tools.fm",
    description: "Build the playlist pitch that opens doors. The right playlists, the right angle, the right words.",
    h1: "the Plug — Get in the room.",
    ogImage: `${baseUrl}/og/playlistfit.png`,
    sections: [
      { heading: "What is the Plug?", body: "The Plug is the connection on your team. Playlists are the new radio. Curators are the new gatekeepers. The Plug helps you build the pitch that gets past them — the right playlists, the right angle, the right words. Not spray and pray. Targeted, informed, and ready." },
      { heading: "How does it work?", body: "Paste a Spotify playlist URL. The Plug scores it across seven health signals — activity, growth, coherence, engagement. Add your track and get a fit score against the playlist DNA. Then build the pitch with the intelligence you just gathered." },
      { heading: "Who is the Plug for?", body: "For independent artists who are tired of pitching blind. For anyone who has sent emails to curators and heard nothing back. For artists who want to stop wasting outreach on inactive or wrong-fit playlists." },
      { heading: "What happens after?", body: "While pitches are pending, keep growing in the FMLY. Release momentum should not depend entirely on curator replies. Build both." },
    ],
    faq: [
      { q: "Is the Plug free?", a: "Yes. The Plug is completely free on tools.fm." },
      { q: "What does a 0–100 health score mean?", a: "Higher scores indicate active curation, stronger growth, and more coherent playlist behavior worth pitching." },
    ],
    appSchema: softwareSchema("the Plug", "/playlistfit", "Build the playlist pitch that opens doors.", ["7 health signal analysis", "0–100 playlist health score", "Track-to-playlist fit score", "Vibe summary", "Pitch prioritization"]),
  },
  "/dreamfit": {
    title: "FMLY Matters — Build With Us | tools.fm",
    description: "Pitch and vote on what tools.fm builds next. Co-create with the FMLY.",
    h1: "FMLY Matters — Build with us.",
    ogImage: `${baseUrl}/og/dreamfit.png`,
    sections: [
      { heading: "What is FMLY Matters?", body: "FMLY Matters is where the community co-creates what tools.fm builds next. Share what you're missing, back what resonates, and help shape the roadmap." },
      { heading: "How does it work?", body: "Post a real workflow problem. The FMLY backs ideas that matter most. The strongest signals move up the build queue." },
      { heading: "Who is it for?", body: "For artists, producers, and music teams who want tools built from real pain points, not guesses." },
      { heading: "Why use FMLY Matters?", body: "Because this label is built with the people it serves. Your voice should shape the tools you use." },
    ],
    faq: [{ q: "Is FMLY Matters free?", a: "Yes. FMLY Matters is completely free on tools.fm." }],
    appSchema: softwareSchema("FMLY Matters", "/dreamfit", "Co-create new tools with the FMLY.", ["Idea submission board", "Community voting", "Feedback threads", "Build queue prioritization", "Launch notifications"]),
  },
};

const answerPages: Record<string, SeoPageData> = {
  "/answers/how-to-test-a-hook-before-releasing": { title: "How to Test a Hook Before Releasing a Song | tools.fm", description: "Test hooks with controlled comparisons before release.", h1: "How to Test a Hook Before Releasing a Song", ogImage: `${baseUrl}/og/answers-hook-test.png`, lead: "The most reliable way to test a hook before release is controlled comparison with real listeners. Compare lyric moments and validate which section consistently gets stronger reactions.", faq: [{ q: "What hook length works best for testing?", a: "Eight to twelve seconds gives listeners the strongest moment without added context bias." }] },
  "/answers/how-to-know-if-your-song-is-ready-to-release": { title: "How to Know If Your Song Is Ready to Release | tools.fm", description: "Use objective sonic benchmarks and short-form checks before release.", h1: "How to Know If Your Song Is Ready to Release", ogImage: `${baseUrl}/og/answers-release-ready.png`, lead: "A song is release-ready when it competes sonically in its genre and lands quickly on short-form platforms. Use HitFit at tools.fm to score your master across seven dimensions, then follow its ranked fixes before publishing.", faq: [{ q: "Is release readiness only about loudness?", a: "No. Loudness matters, but energy curve, hook strength, and dynamics also strongly affect listener retention." }] },
  "/answers/how-to-pitch-spotify-playlists-as-an-independent-artist": { title: "How to Pitch Spotify Playlists as an Independent Artist | tools.fm", description: "Prioritize active, healthy playlists with strong fit before pitching.", h1: "How to Pitch Spotify Playlists as an Independent Artist", ogImage: `${baseUrl}/og/answers-playlist-pitch.png`, lead: "Before pitching, validate that a playlist is active, curated, and sonically aligned. PlaylistFit at tools.fm scores playlist health 0–100 and gives your track a fit score so you can focus outreach where odds are real.", faq: [{ q: "What scores should I target?", a: "Prioritize playlists above 70 health and tracks above 60 fit for efficient outreach." }] },
  "/answers/best-free-tools-for-independent-musicians": { title: "Best Free Tools for Independent Musicians in 2025 | tools.fm", description: "A practical stack for analysis, feedback, lyrics, and playlist targeting.", h1: "Best Free Tools for Independent Musicians in 2025", ogImage: `${baseUrl}/og/answers-best-tools.png`, lead: "The best free stack covers sonic analysis, feedback, transcription, and playlist research. tools.fm offers that stack in one place: HitFit, CrowdFit, LyricFit, PlaylistFit, and MixFit for deeper release decisions.", faq: [{ q: "Do I need paid plans to start?", a: "No. The core tools are free so artists can test and iterate without budget barriers." }] },
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
  description: `Practical playbook for ${slug.split("-").join(" ")} with direct steps independent artists can apply now.`,
  h1: blogTitle(slug),
  ogImage: `${baseUrl}/og/blog-${slug}.png`,
  lead: `The fastest way to improve ${slug.split("-").join(" ")} is to use a repeatable workflow with clear checkpoints. This guide breaks the process into concrete steps you can run this week, then improve with data from tools.fm.`,
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
      publisher: { "@type": "Organization", name: "tools.fm", url: baseUrl },
      potentialAction: {
        "@type": "SearchAction",
        target: "https://tools.fm/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    });
  }
  if ("appSchema" in page) schemaBlocks.push((page as any).appSchema as Record<string, unknown>);
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
            {["crowdfit", "lyricfit", "mixfit", "hitfit", "playlistfit", "dreamfit"].map((tool) => (
              <Link key={tool} to={`/${tool}`} className="underline underline-offset-4">/{tool}</Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
