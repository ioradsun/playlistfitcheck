
-- 1. Create claim_page_jobs table for tracking page generation steps
CREATE TABLE IF NOT EXISTS public.claim_page_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  spotify_artist_slug text NOT NULL,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.claim_page_jobs ENABLE ROW LEVEL SECURITY;

-- Public read so admin + realtime can see rows
CREATE POLICY "Anyone can view claim_page_jobs" ON public.claim_page_jobs
  FOR SELECT TO public USING (true);

-- Only service role inserts (edge function uses service role key)
-- No INSERT policy needed for anon/authenticated since edge fn uses service role

-- Enable realtime for live job feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.claim_page_jobs;

-- 2. Add missing columns to artist_lyric_videos that the edge function inserts
ALTER TABLE public.artist_lyric_videos
  ADD COLUMN IF NOT EXISTS spotify_track_id text,
  ADD COLUMN IF NOT EXISTS spotify_track_url text,
  ADD COLUMN IF NOT EXISTS synced_lyrics_lrc text,
  ADD COLUMN IF NOT EXISTS plain_lyrics text,
  ADD COLUMN IF NOT EXISTS lyrics_source text DEFAULT 'none';

-- 3. Add claim_token column to profiles (used by upsertGhostProfile)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS claim_token text;
