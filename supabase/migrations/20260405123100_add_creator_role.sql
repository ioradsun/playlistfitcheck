ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_role text
  CHECK (creator_role IN ('artist', 'beatmaker', 'tastemaker'));

COMMENT ON COLUMN public.profiles.creator_role IS
  'Self-identified role at signup. artist=makes songs, beatmaker=makes beats, tastemaker=discovers/promotes artists (stars).';
