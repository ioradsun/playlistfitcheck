-- ghost_artist_profiles: no auth.users FK, purpose-built for marketing pages
CREATE TABLE IF NOT EXISTS public.ghost_artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  spotify_artist_slug text NOT NULL UNIQUE,
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  is_claimed boolean NOT NULL DEFAULT false,
  claimed_by_user_id uuid NULL REFERENCES auth.users(id),
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghost_artist_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read ghost profiles"
  ON public.ghost_artist_profiles FOR SELECT USING (true);
CREATE POLICY "Service role insert ghost profiles"
  ON public.ghost_artist_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update ghost profiles"
  ON public.ghost_artist_profiles FOR UPDATE USING (true);

-- Drop old FK on artist_lyric_videos that references profiles(id)
ALTER TABLE public.artist_lyric_videos
  DROP CONSTRAINT IF EXISTS artist_lyric_videos_user_id_fkey;

-- Add ghost_profile_id column
ALTER TABLE public.artist_lyric_videos
  ADD COLUMN IF NOT EXISTS ghost_profile_id uuid NULL
    REFERENCES public.ghost_artist_profiles(id) ON DELETE CASCADE;

-- Add dance tracking columns (idempotent)
ALTER TABLE public.artist_lyric_videos
  ADD COLUMN IF NOT EXISTS lyric_dance_url text NULL,
  ADD COLUMN IF NOT EXISTS lyric_dance_id uuid NULL;

-- Fix INSERT/UPDATE policies on artist_lyric_videos
DROP POLICY IF EXISTS "Service role insert lyric videos" ON public.artist_lyric_videos;
DROP POLICY IF EXISTS "Service role update lyric videos" ON public.artist_lyric_videos;
CREATE POLICY "Service role insert lyric videos"
  ON public.artist_lyric_videos FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update lyric videos"
  ON public.artist_lyric_videos FOR UPDATE USING (true);