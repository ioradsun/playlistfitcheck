
-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add top_tracks_json column to profit_artists for the FMLY Artists feature
ALTER TABLE public.profit_artists ADD COLUMN IF NOT EXISTS top_tracks_json jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profit_artists ADD COLUMN IF NOT EXISTS artist_url text;
ALTER TABLE public.profit_artists ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;
