
CREATE OR REPLACE FUNCTION public.recompute_engagement_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _score numeric;
  _boost numeric;
  _current_rank integer;
BEGIN
  -- Compute weighted engagement score
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

  -- Write the updated score
  UPDATE public.songfit_posts
  SET engagement_score = _score + COALESCE(_boost, 0)
  WHERE id = NEW.post_id;

  -- Compute current live rank (1 = highest score)
  SELECT COUNT(*) + 1
  INTO _current_rank
  FROM public.songfit_posts
  WHERE status = 'live'
    AND id <> NEW.post_id
    AND engagement_score > (_score + COALESCE(_boost, 0));

  -- Update peak_rank if this is a new personal best (lower rank number = better)
  UPDATE public.songfit_posts
  SET peak_rank = _current_rank
  WHERE id = NEW.post_id
    AND (peak_rank IS NULL OR _current_rank < peak_rank);

  RETURN NEW;
END;
$function$;
