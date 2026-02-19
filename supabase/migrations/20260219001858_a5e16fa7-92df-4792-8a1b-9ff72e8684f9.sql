-- Create artist_pages table for microsite customization
CREATE TABLE public.artist_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  -- Style
  accent_color text NOT NULL DEFAULT '#a855f7',
  theme text NOT NULL DEFAULT 'cinematic',
  -- Featured track (Spotify track ID)
  featured_track_id text NULL,
  featured_track_title text NULL,
  featured_track_art text NULL,
  featured_track_url text NULL,
  -- Hero content (optional single item)
  hero_content_type text NULL, -- 'youtube' | 'instagram' | 'tiktok' | null
  hero_content_url text NULL,
  -- Social links
  instagram_url text NULL,
  tiktok_url text NULL,
  youtube_url text NULL,
  website_url text NULL,
  merch_url text NULL,
  -- Sonic identity (cached)
  sonic_identity text NULL,
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.artist_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view artist pages"
  ON public.artist_pages FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own artist page"
  ON public.artist_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own artist page"
  ON public.artist_pages FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update timestamp
CREATE TRIGGER update_artist_pages_updated_at
  BEFORE UPDATE ON public.artist_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();