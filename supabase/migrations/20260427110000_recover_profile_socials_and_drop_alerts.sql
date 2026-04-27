-- Recover columns + tables from prior migrations that failed to apply
-- (artist_pages backfill failed because the table had been dropped).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS merch_url TEXT;

CREATE TABLE IF NOT EXISTS public.release_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_user_id, artist_user_id),
  CHECK (subscriber_user_id <> artist_user_id)
);
CREATE INDEX IF NOT EXISTS idx_release_subs_artist
  ON public.release_subscriptions (artist_user_id);
CREATE INDEX IF NOT EXISTS idx_release_subs_subscriber
  ON public.release_subscriptions (subscriber_user_id);

ALTER TABLE public.release_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read counts" ON public.release_subscriptions;
CREATE POLICY "Public read counts"
  ON public.release_subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Subscriber inserts own" ON public.release_subscriptions;
CREATE POLICY "Subscriber inserts own"
  ON public.release_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = subscriber_user_id);
DROP POLICY IF EXISTS "Subscriber deletes own" ON public.release_subscriptions;
CREATE POLICY "Subscriber deletes own"
  ON public.release_subscriptions FOR DELETE
  USING (auth.uid() = subscriber_user_id);

CREATE TABLE IF NOT EXISTS public.release_alerts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_post_id       uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  is_read            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_release_alerts_inbox
  ON public.release_alerts (subscriber_user_id, is_read, created_at DESC);

ALTER TABLE public.release_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subscriber reads own alerts" ON public.release_alerts;
CREATE POLICY "Subscriber reads own alerts"
  ON public.release_alerts FOR SELECT
  USING (auth.uid() = subscriber_user_id);
DROP POLICY IF EXISTS "Subscriber updates own alerts" ON public.release_alerts;
CREATE POLICY "Subscriber updates own alerts"
  ON public.release_alerts FOR UPDATE
  USING (auth.uid() = subscriber_user_id);

CREATE OR REPLACE FUNCTION public.fan_out_drop_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.release_alerts
    (subscriber_user_id, artist_user_id, feed_post_id)
  SELECT subscriber_user_id, NEW.user_id, NEW.id
  FROM public.release_subscriptions
  WHERE artist_user_id = NEW.user_id
    AND subscriber_user_id <> NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fan_out_drop_alerts ON public.feed_posts;
CREATE TRIGGER trg_fan_out_drop_alerts
AFTER INSERT ON public.feed_posts
FOR EACH ROW
EXECUTE FUNCTION public.fan_out_drop_alerts();
