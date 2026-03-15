-- Allow service role to insert/update lyric dances on behalf of admin
-- Marketing pages are owned by the admin account
CREATE POLICY "Service role insert lyric dances"
  ON public.shareable_lyric_dances FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role update lyric dances"
  ON public.shareable_lyric_dances FOR UPDATE
  USING (true);

-- Add dance tracking columns to artist_lyric_videos
ALTER TABLE public.artist_lyric_videos
  ADD COLUMN IF NOT EXISTS lyric_dance_url text NULL,
  ADD COLUMN IF NOT EXISTS lyric_dance_id uuid NULL;