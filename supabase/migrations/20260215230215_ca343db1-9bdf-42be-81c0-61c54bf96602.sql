
-- Remove overly permissive INSERT/UPDATE policies on profit tables
-- Edge functions use service role key, so anon write access is unnecessary

DROP POLICY IF EXISTS "Anon insert profit_artists" ON public.profit_artists;
DROP POLICY IF EXISTS "Anon update profit_artists" ON public.profit_artists;
DROP POLICY IF EXISTS "Anon insert profit_reports" ON public.profit_reports;
DROP POLICY IF EXISTS "Anon insert profit_plan_variants" ON public.profit_plan_variants;
DROP POLICY IF EXISTS "Anon insert profit_chats" ON public.profit_chats;
DROP POLICY IF EXISTS "Anon update profit_chats" ON public.profit_chats;
