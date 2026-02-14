
-- SongFit: Social gallery for Spotify tracks

-- Posts table
CREATE TABLE public.songfit_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_track_url TEXT NOT NULL,
  spotify_track_id TEXT NOT NULL,
  track_title TEXT NOT NULL,
  track_artists_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  album_title TEXT,
  album_art_url TEXT,
  release_date TEXT,
  preview_url TEXT,
  caption TEXT DEFAULT '',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.songfit_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view posts" ON public.songfit_posts FOR SELECT USING (true);
CREATE POLICY "Auth users can create posts" ON public.songfit_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.songfit_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.songfit_posts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_songfit_posts_created ON public.songfit_posts(created_at DESC);
CREATE INDEX idx_songfit_posts_user ON public.songfit_posts(user_id);

-- Likes
CREATE TABLE public.songfit_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.songfit_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON public.songfit_likes FOR SELECT USING (true);
CREATE POLICY "Auth users can like" ON public.songfit_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.songfit_likes FOR DELETE USING (auth.uid() = user_id);

-- Comments
CREATE TABLE public.songfit_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.songfit_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments" ON public.songfit_comments FOR SELECT USING (true);
CREATE POLICY "Auth users can comment" ON public.songfit_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.songfit_comments FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_songfit_comments_post ON public.songfit_comments(post_id, created_at);

-- Saves
CREATE TABLE public.songfit_saves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.songfit_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own saves" ON public.songfit_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Auth users can save" ON public.songfit_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave" ON public.songfit_saves FOR DELETE USING (auth.uid() = user_id);

-- Follows
CREATE TABLE public.songfit_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_user_id, followed_user_id),
  CHECK (follower_user_id != followed_user_id)
);
ALTER TABLE public.songfit_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view follows" ON public.songfit_follows FOR SELECT USING (true);
CREATE POLICY "Auth users can follow" ON public.songfit_follows FOR INSERT WITH CHECK (auth.uid() = follower_user_id);
CREATE POLICY "Users can unfollow" ON public.songfit_follows FOR DELETE USING (auth.uid() = follower_user_id);

-- Blocks
CREATE TABLE public.songfit_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_user_id, blocked_user_id)
);
ALTER TABLE public.songfit_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own blocks" ON public.songfit_blocks FOR SELECT USING (auth.uid() = blocker_user_id);
CREATE POLICY "Auth users can block" ON public.songfit_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_user_id);
CREATE POLICY "Users can unblock" ON public.songfit_blocks FOR DELETE USING (auth.uid() = blocker_user_id);

-- Reports
CREATE TABLE public.songfit_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.songfit_posts(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES public.songfit_comments(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.songfit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON public.songfit_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

-- Add artist profile fields to existing profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS spotify_artist_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Function to update likes_count on posts
CREATE OR REPLACE FUNCTION public.update_songfit_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.songfit_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.songfit_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_songfit_likes_count
AFTER INSERT OR DELETE ON public.songfit_likes
FOR EACH ROW EXECUTE FUNCTION public.update_songfit_likes_count();

-- Function to update comments_count on posts
CREATE OR REPLACE FUNCTION public.update_songfit_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.songfit_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.songfit_posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_songfit_comments_count
AFTER INSERT OR DELETE ON public.songfit_comments
FOR EACH ROW EXECUTE FUNCTION public.update_songfit_comments_count();
