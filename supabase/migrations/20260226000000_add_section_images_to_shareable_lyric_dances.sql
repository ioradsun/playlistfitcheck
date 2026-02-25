-- Add section_images JSONB column to shareable_lyric_dances
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN IF NOT EXISTS section_images jsonb DEFAULT NULL;

-- Backfill from legacy chapter_images when section_images is empty
UPDATE public.shareable_lyric_dances
SET section_images = chapter_images
WHERE section_images IS NULL
  AND chapter_images IS NOT NULL;
