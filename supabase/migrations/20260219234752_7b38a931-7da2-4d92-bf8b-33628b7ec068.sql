
-- 1. Add new columns to dream_backers
ALTER TABLE public.dream_backers
  ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'greenlight',
  ADD COLUMN context_note TEXT,
  ADD COLUMN session_id TEXT;

-- 2. Add check constraint via trigger (to avoid immutable constraint issues)
ALTER TABLE public.dream_backers
  ADD CONSTRAINT dream_backers_signal_type_check
  CHECK (signal_type IN ('greenlight', 'shelve'));

-- 3. Make user_id nullable for anonymous signals
ALTER TABLE public.dream_backers ALTER COLUMN user_id DROP NOT NULL;

-- 4. Drop old unique constraint if exists (user_id was NOT NULL before)
-- Add partial unique indexes for integrity
CREATE UNIQUE INDEX IF NOT EXISTS dream_backers_user_unique
  ON public.dream_backers (dream_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dream_backers_session_unique
  ON public.dream_backers (dream_id, session_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

-- 5. Add greenlight_count to dream_tools
ALTER TABLE public.dream_tools
  ADD COLUMN greenlight_count INTEGER NOT NULL DEFAULT 0;

-- 6. Backfill greenlight_count (assume all existing backers are greenlights)
UPDATE public.dream_tools dt
SET greenlight_count = (
  SELECT COUNT(*) FROM public.dream_backers db WHERE db.dream_id = dt.id
);

-- 7. Update RLS: allow anonymous inserts (session_id based)
DROP POLICY IF EXISTS "Auth users can back" ON public.dream_backers;

CREATE POLICY "Auth users can back"
  ON public.dream_backers
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (user_id IS NULL AND session_id IS NOT NULL)
  );

-- 8. Trigger to maintain greenlight_count on dream_tools
CREATE OR REPLACE FUNCTION public.update_dream_greenlight_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.signal_type = 'greenlight' THEN
      UPDATE public.dream_tools SET greenlight_count = greenlight_count + 1 WHERE id = NEW.dream_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.signal_type = 'greenlight' THEN
      UPDATE public.dream_tools SET greenlight_count = GREATEST(greenlight_count - 1, 0) WHERE id = OLD.dream_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_dream_greenlight_count_trigger
  AFTER INSERT OR DELETE ON public.dream_backers
  FOR EACH ROW EXECUTE FUNCTION public.update_dream_greenlight_count();
