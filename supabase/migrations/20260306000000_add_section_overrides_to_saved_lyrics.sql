ALTER TABLE saved_lyrics
ADD COLUMN IF NOT EXISTS section_overrides jsonb DEFAULT NULL;
