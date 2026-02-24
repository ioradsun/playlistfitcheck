
-- Fix usage_tracking: drop conflicting restrictive policies, recreate as permissive
DROP POLICY IF EXISTS "Users insert own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Anon insert usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users read own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Anon read usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Users update own usage" ON public.usage_tracking;
DROP POLICY IF EXISTS "Anon update usage" ON public.usage_tracking;

CREATE POLICY "Users insert own usage" ON public.usage_tracking
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon insert usage" ON public.usage_tracking
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Users read own usage" ON public.usage_tracking
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anon read usage" ON public.usage_tracking
  FOR SELECT TO anon
  USING (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Users update own usage" ON public.usage_tracking
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anon update usage" ON public.usage_tracking
  FOR UPDATE TO anon
  USING (user_id IS NULL AND session_id IS NOT NULL);

-- Fix lyric-backgrounds: allow authenticated users to upload
CREATE POLICY "Auth users can upload lyric backgrounds"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lyric-backgrounds' AND auth.uid() IS NOT NULL);
