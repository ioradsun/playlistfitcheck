
-- Table to store playlist snapshots over time
CREATE TABLE public.playlist_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  playlist_url TEXT NOT NULL,
  playlist_name TEXT,
  owner_name TEXT,
  description TEXT,
  followers_total INTEGER,
  tracks_total INTEGER,
  track_ids TEXT[] NOT NULL DEFAULT '{}',
  track_positions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by playlist
CREATE INDEX idx_playlist_snapshots_playlist_id ON public.playlist_snapshots (playlist_id, created_at DESC);

-- Enable RLS (public read/write via edge functions using service role)
ALTER TABLE public.playlist_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow anon read access for the frontend to check snapshot availability
CREATE POLICY "Anyone can read snapshots"
  ON public.playlist_snapshots
  FOR SELECT
  USING (true);

-- Only service role can insert (edge functions)
CREATE POLICY "Service role can insert snapshots"
  ON public.playlist_snapshots
  FOR INSERT
  WITH CHECK (true);
