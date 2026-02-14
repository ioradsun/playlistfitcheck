
-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow')),
  post_id UUID REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.songfit_comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_actor ON public.notifications(actor_user_id);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System inserts via triggers (SECURITY DEFINER functions handle inserts)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Trigger function for like notifications
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _post_owner UUID;
BEGIN
  SELECT user_id INTO _post_owner FROM public.songfit_posts WHERE id = NEW.post_id;
  IF _post_owner IS NOT NULL AND _post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_user_id, type, post_id)
    VALUES (_post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_like
AFTER INSERT ON public.songfit_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

-- Trigger function for comment notifications
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _post_owner UUID;
BEGIN
  SELECT user_id INTO _post_owner FROM public.songfit_posts WHERE id = NEW.post_id;
  IF _post_owner IS NOT NULL AND _post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, comment_id)
    VALUES (_post_owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_comment
AFTER INSERT ON public.songfit_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- Trigger function for follow notifications
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.followed_user_id <> NEW.follower_user_id THEN
    INSERT INTO public.notifications (user_id, actor_user_id, type)
    VALUES (NEW.followed_user_id, NEW.follower_user_id, 'follow');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_follow
AFTER INSERT ON public.songfit_follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();
