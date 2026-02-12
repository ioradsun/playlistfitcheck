
-- Add session_id to track_engagement so we can correlate clicks back to a search session
ALTER TABLE public.track_engagement ADD COLUMN session_id text;

-- Add session_id to search_logs for the same correlation
ALTER TABLE public.search_logs ADD COLUMN session_id text;

-- Index for fast aggregation lookups
CREATE INDEX idx_track_engagement_session ON public.track_engagement(session_id);
CREATE INDEX idx_search_logs_session ON public.search_logs(session_id);
CREATE INDEX idx_track_engagement_track ON public.track_engagement(track_id, action);
