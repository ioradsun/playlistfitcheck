DROP POLICY IF EXISTS "Anyone can view live feed posts" ON public.feed_posts;

CREATE POLICY "Anyone can view live feed posts"
  ON public.feed_posts
  FOR SELECT
  USING (status = 'live' OR auth.uid() = user_id);