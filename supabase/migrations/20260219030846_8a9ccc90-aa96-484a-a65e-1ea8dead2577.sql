
-- Create songfit_hook_reviews table
CREATE TABLE public.songfit_hook_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  user_id uuid NULL,
  session_id text NULL,
  hook_rating text NOT NULL CHECK (hook_rating IN ('missed', 'almost', 'solid', 'hit')),
  would_replay boolean NOT NULL,
  context_note text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_reviewer CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.songfit_hook_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: public (for aggregates)
CREATE POLICY "Anyone can view hook reviews"
  ON public.songfit_hook_reviews
  FOR SELECT
  USING (true);

-- INSERT: authenticated users (with their user_id)
CREATE POLICY "Auth users can insert hook reviews"
  ON public.songfit_hook_reviews
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- Unique: one review per user per post
CREATE UNIQUE INDEX songfit_hook_reviews_user_post_unique
  ON public.songfit_hook_reviews (user_id, post_id)
  WHERE user_id IS NOT NULL;

-- Unique: one review per session per post (guest dedup)
CREATE UNIQUE INDEX songfit_hook_reviews_session_post_unique
  ON public.songfit_hook_reviews (session_id, post_id)
  WHERE session_id IS NOT NULL;

-- Index for fast post lookups
CREATE INDEX idx_songfit_hook_reviews_post_id ON public.songfit_hook_reviews (post_id);
