CREATE TABLE IF NOT EXISTS public.search_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_name TEXT,
  playlist_url TEXT,
  song_name TEXT,
  song_url TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

-- Ensure the restrictive policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_logs' AND policyname = 'No public access'
  ) THEN
    CREATE POLICY "No public access" ON public.search_logs FOR ALL USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_logs_session ON public.search_logs(session_id);