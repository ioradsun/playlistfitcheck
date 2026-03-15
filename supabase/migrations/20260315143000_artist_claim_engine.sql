ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS claim_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS spotify_artist_slug text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_spotify_artist_slug_idx
  ON public.profiles(spotify_artist_slug)
  WHERE spotify_artist_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.artist_lyric_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  track_title text NOT NULL,
  artist_name text NOT NULL,
  album_art_url text NULL,
  spotify_track_url text NOT NULL,
  preview_url text NULL,
  synced_lyrics_lrc text NULL,
  plain_lyrics text NULL,
  lyrics_source text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_lyric_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read lyric videos"
  ON public.artist_lyric_videos FOR SELECT USING (true);
CREATE POLICY "Service role insert lyric videos"
  ON public.artist_lyric_videos FOR INSERT WITH CHECK (true);
