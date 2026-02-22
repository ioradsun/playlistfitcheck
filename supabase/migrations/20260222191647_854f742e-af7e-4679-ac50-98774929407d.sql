
-- 1. Create lyric_dance_comments table
CREATE TABLE public.lyric_dance_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dance_id UUID NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  user_id UUID,
  session_id TEXT,
  text TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lyric_dance_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lyric dance comments"
  ON public.lyric_dance_comments FOR SELECT USING (true);

CREATE POLICY "Anyone can submit lyric dance comments"
  ON public.lyric_dance_comments FOR INSERT WITH CHECK (true);

-- 2. Create lyric_dance_signals table
CREATE TABLE public.lyric_dance_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dance_id UUID NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  user_id UUID,
  session_id TEXT NOT NULL,
  would_replay BOOLEAN NOT NULL,
  context_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dance_id, session_id)
);

ALTER TABLE public.lyric_dance_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lyric dance signals"
  ON public.lyric_dance_signals FOR SELECT USING (true);

CREATE POLICY "Anyone can submit lyric dance signals"
  ON public.lyric_dance_signals FOR INSERT WITH CHECK (true);

-- 3. Add fire_count to shareable_lyric_dances
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN fire_count INTEGER NOT NULL DEFAULT 0;

-- 4. Create trigger to increment fire_count on comment insert
CREATE OR REPLACE FUNCTION public.increment_lyric_dance_fire_count()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.shareable_lyric_dances SET fire_count = fire_count + 1 WHERE id = NEW.dance_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER increment_lyric_dance_fire_count
  AFTER INSERT ON public.lyric_dance_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_lyric_dance_fire_count();
