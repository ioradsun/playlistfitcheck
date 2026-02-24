
-- Add chapter_images JSONB column to shareable_lyric_dances
ALTER TABLE public.shareable_lyric_dances ADD COLUMN IF NOT EXISTS chapter_images jsonb DEFAULT NULL;
