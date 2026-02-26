
-- Table for published full-song lyric dance pages
CREATE TABLE public.shareable_lyric_dances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  artist_slug TEXT NOT NULL,
  song_slug TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  song_name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  lyrics JSONB NOT NULL,
  motion_profile_spec JSONB NOT NULL,
  beat_grid JSONB NOT NULL,
  palette JSONB NOT NULL DEFAULT '["#ffffff", "#a855f7", "#ec4899"]'::jsonb,
  system_type TEXT NOT NULL DEFAULT 'fracture',
  artist_dna JSONB,
  seed TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artist_slug, song_slug)
);

-- Enable RLS
ALTER TABLE public.shareable_lyric_dances ENABLE ROW LEVEL SECURITY;

-- Anyone can view (ungated)
CREATE POLICY "Anyone can view lyric dances"
  ON public.shareable_lyric_dances FOR SELECT
  USING (true);

-- Auth users can create their own
CREATE POLICY "Auth users can create their own lyric dances"
  ON public.shareable_lyric_dances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own
CREATE POLICY "Users can update their own lyric dances"
  ON public.shareable_lyric_dances FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own
CREATE POLICY "Users can delete their own lyric dances"
  ON public.shareable_lyric_dances FOR DELETE
  USING (auth.uid() = user_id);
