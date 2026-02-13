-- Add user_id column to track_engagement to link plays to authenticated users
ALTER TABLE public.track_engagement
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for fast per-user lookups
CREATE INDEX idx_track_engagement_user_id ON public.track_engagement(user_id);
