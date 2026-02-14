-- Add parent_comment_id for threaded replies
ALTER TABLE public.songfit_comments
ADD COLUMN parent_comment_id uuid REFERENCES public.songfit_comments(id) ON DELETE CASCADE DEFAULT NULL;

-- Index for fast reply lookups
CREATE INDEX idx_songfit_comments_parent ON public.songfit_comments(parent_comment_id);
