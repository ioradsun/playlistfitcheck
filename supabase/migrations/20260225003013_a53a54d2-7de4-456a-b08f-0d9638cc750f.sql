
ALTER TABLE public.songfit_posts
  ALTER COLUMN spotify_track_url DROP NOT NULL,
  ALTER COLUMN spotify_track_id DROP NOT NULL;

ALTER TABLE public.songfit_posts
  ADD COLUMN lyric_dance_url text,
  ADD COLUMN lyric_dance_id uuid;
