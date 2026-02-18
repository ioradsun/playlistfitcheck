
-- Comment likes for songfit (CrowdFit)
CREATE TABLE public.songfit_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.songfit_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE public.songfit_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view songfit comment likes"
  ON public.songfit_comment_likes FOR SELECT USING (true);

CREATE POLICY "Auth users can like songfit comments"
  ON public.songfit_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike songfit comments"
  ON public.songfit_comment_likes FOR DELETE USING (auth.uid() = user_id);

-- Add likes_count to songfit_comments
ALTER TABLE public.songfit_comments ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- Trigger to keep likes_count in sync for songfit_comments
CREATE OR REPLACE FUNCTION public.update_songfit_comment_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.songfit_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.songfit_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_songfit_comment_likes_count_trigger
AFTER INSERT OR DELETE ON public.songfit_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_songfit_comment_likes_count();

-- Comment likes for dream_comments (DreamFit)
CREATE TABLE public.dream_comment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.dream_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE public.dream_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view dream comment likes"
  ON public.dream_comment_likes FOR SELECT USING (true);

CREATE POLICY "Auth users can like dream comments"
  ON public.dream_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike dream comments"
  ON public.dream_comment_likes FOR DELETE USING (auth.uid() = user_id);

-- Add likes_count to dream_comments
ALTER TABLE public.dream_comments ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- Trigger to keep likes_count in sync for dream_comments
CREATE OR REPLACE FUNCTION public.update_dream_comment_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dream_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dream_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER update_dream_comment_likes_count_trigger
AFTER INSERT OR DELETE ON public.dream_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_dream_comment_likes_count();
