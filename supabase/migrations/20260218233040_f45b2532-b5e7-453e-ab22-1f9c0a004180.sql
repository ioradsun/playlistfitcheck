
ALTER TABLE public.saved_lyrics
  ADD COLUMN IF NOT EXISTS fmly_lines jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS version_meta jsonb DEFAULT '{}'::jsonb;
