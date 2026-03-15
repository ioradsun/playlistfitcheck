-- Add missing columns to artist_lyric_videos
ALTER TABLE public.artist_lyric_videos
  ADD COLUMN IF NOT EXISTS spotify_track_id text NULL,
  ADD COLUMN IF NOT EXISTS spotify_track_url text NULL,
  ADD COLUMN IF NOT EXISTS synced_lyrics_lrc text NULL,
  ADD COLUMN IF NOT EXISTS plain_lyrics text NULL,
  ADD COLUMN IF NOT EXISTS lyrics_source text NULL;

-- Fix the INSERT policy to allow service role inserts
DROP POLICY IF EXISTS "Auth users can insert own videos" ON public.artist_lyric_videos;
DROP POLICY IF EXISTS "Service role insert lyric videos" ON public.artist_lyric_videos;

CREATE POLICY "Service role insert lyric videos"
  ON public.artist_lyric_videos FOR INSERT
  WITH CHECK (true);