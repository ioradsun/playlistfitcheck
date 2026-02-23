-- Add cinematic_direction JSONB column to shareable_lyric_dances
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN IF NOT EXISTS cinematic_direction jsonb DEFAULT NULL;