ALTER TABLE public.saved_lyrics ADD COLUMN IF NOT EXISTS song_signature jsonb DEFAULT NULL;
ALTER TABLE public.saved_lyrics ADD COLUMN IF NOT EXISTS background_image_url text DEFAULT NULL;