
ALTER TABLE public.lyric_dance_comments
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

ALTER TABLE public.lyric_dance_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.lyric_dance_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lyric_dance_comments_parent_idx
  ON public.lyric_dance_comments(parent_comment_id);

CREATE TABLE IF NOT EXISTS public.lyric_dance_comment_reactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id  uuid NOT NULL REFERENCES public.lyric_dance_comments(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  session_id  text NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lyric_dance_comment_reactions_comment_id_idx
  ON public.lyric_dance_comment_reactions(comment_id);

ALTER TABLE public.lyric_dance_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comment reactions"
  ON public.lyric_dance_comment_reactions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can submit comment reactions"
  ON public.lyric_dance_comment_reactions FOR INSERT
  WITH CHECK (true);
