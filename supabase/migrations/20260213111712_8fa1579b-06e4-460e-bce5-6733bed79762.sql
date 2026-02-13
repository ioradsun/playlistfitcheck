
-- Widget configuration (single-row pattern)
CREATE TABLE public.widget_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'tracklist' CHECK (mode IN ('tracklist', 'embed')),
  playlist_url TEXT NOT NULL DEFAULT 'https://open.spotify.com/playlist/3wtgtkdE8aDOf3V0LYoAXa',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed with default row
INSERT INTO public.widget_config (mode) VALUES ('tracklist');

-- Enable RLS
ALTER TABLE public.widget_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read the config (needed by PromoPlayer)
CREATE POLICY "Widget config is publicly readable"
  ON public.widget_config FOR SELECT
  USING (true);

-- No public write access (admin edge function uses service role)
