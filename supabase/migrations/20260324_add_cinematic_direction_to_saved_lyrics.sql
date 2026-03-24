-- Add cinematic_direction as a first-class column on saved_lyrics.
ALTER TABLE public.saved_lyrics
  ADD COLUMN IF NOT EXISTS cinematic_direction jsonb DEFAULT NULL;

-- Backfill from render_data for existing rows.
UPDATE public.saved_lyrics
SET cinematic_direction = render_data->'cinematicDirection'
WHERE cinematic_direction IS NULL
  AND render_data IS NOT NULL
  AND render_data->'cinematicDirection' IS NOT NULL;
