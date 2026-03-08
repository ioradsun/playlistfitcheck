-- Precomputed feed preview fields for lyric dance cards.
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS top_reaction jsonb,
  ADD COLUMN IF NOT EXISTS preview_ready boolean NOT NULL DEFAULT false;
