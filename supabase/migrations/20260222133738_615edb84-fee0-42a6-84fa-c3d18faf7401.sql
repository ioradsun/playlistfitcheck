
-- Add playback_order and played_first_hook_id to hook_votes
ALTER TABLE public.hook_votes
  ADD COLUMN IF NOT EXISTS playback_order text,
  ADD COLUMN IF NOT EXISTS played_first_hook_id uuid;

-- Create battle_passes table for silent pass logging
CREATE TABLE IF NOT EXISTS public.battle_passes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id uuid NOT NULL,
  session_id text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.battle_passes ENABLE ROW LEVEL SECURITY;

-- Anyone can insert passes (anonymous or authenticated)
CREATE POLICY "Anyone can insert battle passes"
  ON public.battle_passes
  FOR INSERT
  WITH CHECK (true);

-- Only service role can read passes (no public select)
CREATE POLICY "No public read on battle passes"
  ON public.battle_passes
  FOR SELECT
  USING (false);
