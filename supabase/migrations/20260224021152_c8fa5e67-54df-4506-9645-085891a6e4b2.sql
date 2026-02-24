-- Drop the redundant artist column from saved_lyrics.
-- Artist identity is now exclusively derived from profiles.display_name.
-- The transcription-detected "song artist" stays in-memory only (LyricData type).
ALTER TABLE public.saved_lyrics DROP COLUMN IF EXISTS artist;