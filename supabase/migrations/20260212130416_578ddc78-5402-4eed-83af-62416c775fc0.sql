
-- Create track engagement table for logging plays and Spotify clicks
CREATE TABLE public.track_engagement (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL,
  track_name TEXT,
  artist_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('play', 'spotify_click')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.track_engagement ENABLE ROW LEVEL SECURITY;

-- No public read access - only service role (edge functions) can insert
CREATE POLICY "No direct public access" ON public.track_engagement
  FOR SELECT USING (false);
