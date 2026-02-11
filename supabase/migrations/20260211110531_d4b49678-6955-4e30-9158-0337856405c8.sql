
-- Drop the overly permissive insert policy
DROP POLICY "Service role can insert snapshots" ON public.playlist_snapshots;

-- No anon insert policy needed — edge functions use service_role key which bypasses RLS
