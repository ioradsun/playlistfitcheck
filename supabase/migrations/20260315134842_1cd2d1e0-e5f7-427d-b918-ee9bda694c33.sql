-- Add claim-related columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spotify_artist_slug text;

-- Create artist_lyric_videos table
CREATE TABLE IF NOT EXISTS public.artist_lyric_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  track_title text NOT NULL,
  artist_name text NOT NULL,
  album_art_url text,
  preview_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_lyric_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view artist lyric videos"
  ON public.artist_lyric_videos FOR SELECT
  TO public USING (true);

CREATE POLICY "Auth users can insert own videos"
  ON public.artist_lyric_videos FOR INSERT
  TO public WITH CHECK (auth.uid() = user_id);