
-- Add frame_state and background_url to shareable_lyric_dances
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN IF NOT EXISTS frame_state jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS background_url text DEFAULT NULL;
