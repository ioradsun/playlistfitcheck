
-- Increment impressions helper (best-effort, no auth needed)
CREATE OR REPLACE FUNCTION public.increment_impressions(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.songfit_posts SET impressions = impressions + 1 WHERE id = _post_id;
$$;

-- Increment cycle_number helper
CREATE OR REPLACE FUNCTION public.increment_cycle_number(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.songfit_posts SET cycle_number = cycle_number + 1 WHERE id = _post_id;
$$;
