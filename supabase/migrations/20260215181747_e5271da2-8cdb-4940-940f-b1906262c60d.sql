
-- Single-row site copy CMS table
CREATE TABLE public.site_copy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_copy ENABLE ROW LEVEL SECURITY;

-- Everyone can read site copy
CREATE POLICY "Anyone can read site copy"
  ON public.site_copy FOR SELECT
  USING (true);

-- No direct client writes (admin edge function uses service role)

-- Seed with current copy
INSERT INTO public.site_copy (copy_json) VALUES ('{
  "tools": {
    "songfit": { "label": "CrowdFit", "pill": "See how your song fits listeners." },
    "profit": { "label": "ProFit", "pill": "See how you can profit from your Spotify", "heading": "Turn Your Spotify Data Into A Revenue Strategy", "cta": "Generate My Plan" },
    "playlist": { "label": "PlaylistFit", "pill": "See if your song fits playlists.", "heading": "Check Playlist Health And Match Your Song", "cta": "Analyze Playlist" },
    "mix": { "label": "MixFit", "pill": "See which mix fits best.", "heading": "Compare Mix Versions And Choose The Best Fit", "cta": "Start Comparing" },
    "lyric": { "label": "LyricFit", "pill": "Fit your lyrics inside captions.", "heading": "Get Perfectly Timed Lyrics For Every Drop", "cta": "Sync Lyrics" },
    "hitfit": { "label": "HitFit", "pill": "See if your song fits the Top 10.", "heading": "Compare Your Track to Your Target Sound", "cta": "Analyze" },
    "dreamfit": { "label": "DreamFit", "pill": "Let''s build the next Fit together." }
  },
  "about": {
    "origin_intro": "I''m ajan. I make music, so I know the 3am doubt—is the mix ready, is it actually good? My dad builds tech. So we built tools to try and answer those questions.",
    "origin_body": "We''re trying everything. Some will work. Some won''t. That''s how music works too. But at least we''re not guessing alone.",
    "origin_tagline": "tools.fm: experiments to find answers.",
    "listen_label": "Listen to what started it all.",
    "tools_intro": "Six tools. One goal: give independent artists the clarity they deserve. No gatekeeping, no vague advice. Just data, context, and a little taste.",
    "products": [
      { "name": "CrowdFit", "tagline": "See how your song fits listeners.", "description": "A social feed where artists share tracks and the crowd reacts. Post a song, get real feedback from other musicians — not algorithms, not bots. Think of it as a listening room that never closes.", "how": "Drop a Spotify track, add a caption, and publish. Other artists like, comment, and follow. You build a real audience of people who actually care about music." },
      { "name": "ProFit", "tagline": "See how your Spotify fits making money.", "description": "A diagnostic engine that reads your Spotify Artist profile and tells you where the money is — and where it isn''t. No fluff, no generic advice. Just a blueprint built from your actual data.", "how": "Paste your Spotify Artist URL. ProFit evaluates 11 signals across your catalog, audience, and activity to generate a Revenue Leverage Scorecard, a 90-day roadmap, and a weekly execution checklist. Then chat with it to go deeper." },
      { "name": "PlaylistFit", "tagline": "See if your song fits playlists.", "description": "Before you pitch a playlist, know if it''s actually worth your time. PlaylistFit scores playlists on a 0–100 scale across 7 categories so you stop wasting energy on dead-end placements.", "how": "Paste a Spotify playlist URL (and optionally your song URL). The engine evaluates Song Activity, Focus Level, Curator Type, Recent Activity, Reach Per Song, Rotation Style, and Song Placement. You get a health score, a vibe summary, and — if you included your track — a blended fit score that tells you how well your sound matches the playlist''s DNA." },
      { "name": "MixFit", "tagline": "See which mix fits best.", "description": "Upload multiple mixes of the same track and A/B test them side by side. Rank, annotate, and compare without losing your mind switching between files.", "how": "Upload up to 6 audio files, set loop markers, and listen back-to-back. Rank each mix, leave notes, and save the project. Your rankings and notes persist — the audio doesn''t get stored, just the metadata." },
      { "name": "LyricFit", "tagline": "Make sure your lyrics fit captions.", "description": "Transcribe your track and get time-synced lyrics you can actually use — for social clips, live visuals, or just checking that your words land the way you think they do.", "how": "Upload an audio file. LyricFit transcribes it with timestamps, so you can scroll through your lyrics synced to the music. Save and revisit anytime." },
      { "name": "HitFit", "tagline": "See if your song fits a hit.", "description": "An honest check on whether your track has the structural and sonic markers that tend to perform well. Not a guarantee — just pattern recognition from what''s already working.", "how": "Upload your track. HitFit analyzes it against common patterns found in high-performing songs and gives you a read on where you stand." }
    ]
  },
  "sidebar": {
    "brand": "tools.fm",
    "story_link": "tools.fm story"
  },
  "pages": {
    "about_title": "tools.fm story",
    "about_subtitle": "What we built and why.",
    "auth_title": "tools fmly"
  }
}'::jsonb);
