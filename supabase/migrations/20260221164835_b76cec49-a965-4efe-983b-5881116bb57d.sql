
-- Add artist_fingerprint JSON column to profiles
ALTER TABLE public.profiles ADD COLUMN artist_fingerprint jsonb DEFAULT NULL;

-- Add a comment for clarity
COMMENT ON COLUMN public.profiles.artist_fingerprint IS 'ArtistDNA fingerprint object — defines permanent visual identity for Hook Dance videos';
