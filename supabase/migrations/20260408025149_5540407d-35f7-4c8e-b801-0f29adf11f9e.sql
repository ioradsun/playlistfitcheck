CREATE TABLE public.feed_comment_likes (
  comment_id UUID NOT NULL REFERENCES public.feed_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.feed_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feed comment likes"
  ON public.feed_comment_likes FOR SELECT USING (true);

CREATE POLICY "Auth users can like feed comments"
  ON public.feed_comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike feed comments"
  ON public.feed_comment_likes FOR DELETE
  USING (auth.uid() = user_id);