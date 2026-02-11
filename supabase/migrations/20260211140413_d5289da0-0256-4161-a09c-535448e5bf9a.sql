
-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read snapshots" ON public.playlist_snapshots;

-- Create a restrictive policy that denies all direct reads
-- (edge function uses service role key which bypasses RLS)
CREATE POLICY "No direct public access"
  ON public.playlist_snapshots
  FOR SELECT
  USING (false);

-- Delete snapshots older than 30 days to comply with Spotify's terms
DELETE FROM public.playlist_snapshots
WHERE created_at < now() - interval '30 days';
