ALTER TABLE public.saved_lyrics
ADD COLUMN IF NOT EXISTS song_signature jsonb DEFAULT NULL;
