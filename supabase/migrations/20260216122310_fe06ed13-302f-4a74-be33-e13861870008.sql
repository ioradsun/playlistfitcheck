
-- =========================================================
-- Phase 1: Submission lifecycle columns on songfit_posts
-- =========================================================
ALTER TABLE public.songfit_posts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS engagement_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_rank integer,
  ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_boost numeric NOT NULL DEFAULT 0;

-- Set expires_at for existing rows (21 days from created_at)
UPDATE public.songfit_posts
SET submitted_at = created_at,
    expires_at = created_at + interval '21 days',
    status = CASE
      WHEN created_at + interval '21 days' > now() THEN 'live'
      WHEN created_at + interval '42 days' > now() THEN 'cooldown'
      ELSE 'eligible'
    END,
    cooldown_until = CASE
      WHEN created_at + interval '21 days' <= now() THEN created_at + interval '42 days'
      ELSE NULL
    END
WHERE expires_at IS NULL;

-- =========================================================
-- Phase 1: engagement_weights (configurable scoring weights)
-- =========================================================
CREATE TABLE public.engagement_weights (
  event_type text PRIMARY KEY,
  weight numeric NOT NULL DEFAULT 1
);

ALTER TABLE public.engagement_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engagement weights"
  ON public.engagement_weights FOR SELECT
  USING (true);

-- Seed default weights
INSERT INTO public.engagement_weights (event_type, weight) VALUES
  ('follow_from_post', 15),
  ('share', 12),
  ('save', 10),
  ('comment', 7),
  ('spotify_click', 5),
  ('profile_visit', 3),
  ('like', 1);

-- =========================================================
-- Phase 1: songfit_engagement_events
-- =========================================================
CREATE TABLE public.songfit_engagement_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_event_per_post UNIQUE (post_id, user_id, event_type)
);

ALTER TABLE public.songfit_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view engagement events"
  ON public.songfit_engagement_events FOR SELECT
  USING (true);

CREATE POLICY "Auth users can log engagement events"
  ON public.songfit_engagement_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- Phase 1: songfit_cycle_history
-- =========================================================
CREATE TABLE public.songfit_cycle_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,
  final_engagement_score numeric NOT NULL DEFAULT 0,
  peak_rank integer,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL
);

ALTER TABLE public.songfit_cycle_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cycle history"
  ON public.songfit_cycle_history FOR SELECT
  USING (true);

-- =========================================================
-- Trigger: recompute engagement_score on new event
-- =========================================================
CREATE OR REPLACE FUNCTION public.recompute_engagement_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _score numeric;
  _boost numeric;
BEGIN
  SELECT COALESCE(SUM(w.weight), 0)
  INTO _score
  FROM (
    SELECT event_type, COUNT(DISTINCT user_id) AS cnt
    FROM public.songfit_engagement_events
    WHERE post_id = NEW.post_id
    GROUP BY event_type
  ) e
  JOIN public.engagement_weights w ON w.event_type = e.event_type;

  -- Add legacy boost if within 48h of submission
  SELECT CASE
    WHEN submitted_at + interval '48 hours' > now() THEN legacy_boost
    ELSE 0
  END INTO _boost
  FROM public.songfit_posts WHERE id = NEW.post_id;

  UPDATE public.songfit_posts
  SET engagement_score = _score * (SELECT COALESCE(SUM(e2.cnt * w2.weight), 0)
    FROM (
      SELECT event_type, COUNT(DISTINCT user_id) AS cnt
      FROM public.songfit_engagement_events
      WHERE post_id = NEW.post_id
      GROUP BY event_type
    ) e2
    JOIN public.engagement_weights w2 ON w2.event_type = e2.event_type
  ) + COALESCE(_boost, 0)
  WHERE id = NEW.post_id;

  -- Simplified: just set the correct score
  UPDATE public.songfit_posts
  SET engagement_score = _score + COALESCE(_boost, 0)
  WHERE id = NEW.post_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recompute_engagement
  AFTER INSERT ON public.songfit_engagement_events
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_engagement_score();

-- =========================================================
-- Function: update_submission_statuses (called by scheduler)
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_submission_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Archive live → cooldown
  INSERT INTO public.songfit_cycle_history (post_id, cycle_number, final_engagement_score, peak_rank, started_at, ended_at)
  SELECT id, cycle_number, engagement_score, peak_rank, submitted_at, expires_at
  FROM public.songfit_posts
  WHERE status = 'live' AND expires_at <= now();

  UPDATE public.songfit_posts
  SET status = 'cooldown',
      cooldown_until = expires_at + interval '21 days'
  WHERE status = 'live' AND expires_at <= now();

  -- Cooldown → eligible
  UPDATE public.songfit_posts
  SET status = 'eligible'
  WHERE status = 'cooldown' AND cooldown_until <= now();
END;
$$;

-- Enable realtime for engagement events
ALTER PUBLICATION supabase_realtime ADD TABLE public.songfit_engagement_events;
