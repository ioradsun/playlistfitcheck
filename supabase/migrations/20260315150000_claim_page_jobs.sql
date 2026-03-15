CREATE TABLE IF NOT EXISTS public.claim_page_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  spotify_artist_slug text NOT NULL,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  detail text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

ALTER TABLE public.claim_page_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role insert jobs"
  ON public.claim_page_jobs FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin read jobs"
  ON public.claim_page_jobs FOR SELECT USING (true);

CREATE POLICY "Service role update jobs"
  ON public.claim_page_jobs FOR UPDATE USING (true);

CREATE INDEX claim_page_jobs_job_id_idx ON public.claim_page_jobs(job_id);
CREATE INDEX claim_page_jobs_slug_idx ON public.claim_page_jobs(spotify_artist_slug);
CREATE INDEX claim_page_jobs_started_at_idx ON public.claim_page_jobs(started_at DESC);
