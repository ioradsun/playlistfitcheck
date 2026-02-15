
-- Dreams table
CREATE TABLE public.dream_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  frustration TEXT NOT NULL,
  transformation TEXT NOT NULL,
  dream_type TEXT NOT NULL DEFAULT 'new_fit' CHECK (dream_type IN ('feature', 'new_fit')),
  target_fit TEXT,
  status TEXT NOT NULL DEFAULT 'seeding' CHECK (status IN ('seeding', 'momentum', 'review', 'building', 'live', 'not_a_fit')),
  status_note TEXT,
  backers_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  trending_score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backers table
CREATE TABLE public.dream_backers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dream_tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dream_id, user_id)
);

-- Comments table
CREATE TABLE public.dream_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_id UUID NOT NULL REFERENCES public.dream_tools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.dream_comments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.dream_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_backers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dream_comments ENABLE ROW LEVEL SECURITY;

-- dream_tools policies
CREATE POLICY "Anyone can view dreams" ON public.dream_tools FOR SELECT USING (true);
CREATE POLICY "Auth users can create dreams" ON public.dream_tools FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own dreams" ON public.dream_tools FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own dreams" ON public.dream_tools FOR UPDATE USING (auth.uid() = user_id);

-- dream_backers policies
CREATE POLICY "Anyone can view backers" ON public.dream_backers FOR SELECT USING (true);
CREATE POLICY "Auth users can back" ON public.dream_backers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unback" ON public.dream_backers FOR DELETE USING (auth.uid() = user_id);

-- dream_comments policies
CREATE POLICY "Anyone can view dream comments" ON public.dream_comments FOR SELECT USING (true);
CREATE POLICY "Auth users can comment on dreams" ON public.dream_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own dream comments" ON public.dream_comments FOR DELETE USING (auth.uid() = user_id);

-- Backer count trigger
CREATE OR REPLACE FUNCTION public.update_dream_backers_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dream_tools SET backers_count = backers_count + 1 WHERE id = NEW.dream_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dream_tools SET backers_count = GREATEST(backers_count - 1, 0) WHERE id = OLD.dream_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_dream_backers_count
AFTER INSERT OR DELETE ON public.dream_backers
FOR EACH ROW EXECUTE FUNCTION public.update_dream_backers_count();

-- Comment count trigger
CREATE OR REPLACE FUNCTION public.update_dream_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dream_tools SET comments_count = comments_count + 1 WHERE id = NEW.dream_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dream_tools SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.dream_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_dream_comments_count
AFTER INSERT OR DELETE ON public.dream_comments
FOR EACH ROW EXECUTE FUNCTION public.update_dream_comments_count();

-- Trending score function
CREATE OR REPLACE FUNCTION public.update_dream_trending_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _dream_id UUID;
  _age_hours NUMERIC;
  _backers INT;
  _comments INT;
BEGIN
  _dream_id := COALESCE(NEW.dream_id, OLD.dream_id);
  
  SELECT backers_count, comments_count INTO _backers, _comments
  FROM public.dream_tools WHERE id = _dream_id;
  
  SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 3600.0 INTO _age_hours
  FROM public.dream_tools WHERE id = _dream_id;
  
  UPDATE public.dream_tools
  SET trending_score = (_backers * 2 + _comments * 1.5) / GREATEST((_age_hours / 24.0) + 1, 1)
  WHERE id = _dream_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_dream_trending_on_back
AFTER INSERT OR DELETE ON public.dream_backers
FOR EACH ROW EXECUTE FUNCTION public.update_dream_trending_score();

CREATE TRIGGER trg_dream_trending_on_comment
AFTER INSERT OR DELETE ON public.dream_comments
FOR EACH ROW EXECUTE FUNCTION public.update_dream_trending_score();
