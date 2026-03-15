-- Expand notifications for Signals system
ALTER TABLE public.notifications
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type IN (
      'run_it_back',
      'skip',
      'comment',
      'like',
      'save',
      'follow',
      'lyric_reaction',
      'lyric_comment',
      'milestone'
    )
  );

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dance_id uuid REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'crowdfit_feed';

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_post_type
  ON public.notifications (user_id, post_id, type, created_at DESC);

-- Hook review => run_it_back / skip
CREATE OR REPLACE FUNCTION public.notify_on_hook_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner uuid;
  post_dance_id uuid;
  noti_source text;
BEGIN
  SELECT user_id, lyric_dance_id INTO post_owner, post_dance_id
  FROM public.songfit_posts WHERE id = NEW.post_id;

  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF post_dance_id IS NOT NULL THEN
    noti_source := 'crowdfit_feed';
  ELSE
    noti_source := 'crowdfit_feed';
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, source, metadata)
  VALUES (
    post_owner,
    NEW.user_id,
    CASE WHEN NEW.would_replay THEN 'run_it_back' ELSE 'skip' END,
    NEW.post_id,
    noti_source,
    jsonb_build_object('hook_rating', NEW.hook_rating, 'session_id', COALESCE(NEW.session_id, ''))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_hook_review ON public.songfit_hook_reviews;
CREATE TRIGGER trg_notify_hook_review
  AFTER INSERT ON public.songfit_hook_reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_hook_review();

-- Feed comment => comment
CREATE OR REPLACE FUNCTION public.notify_on_feed_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.songfit_posts WHERE id = NEW.post_id;

  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, comment_id, source, metadata)
  VALUES (
    post_owner,
    NEW.user_id,
    'comment',
    NEW.post_id,
    NEW.id,
    'crowdfit_feed',
    jsonb_build_object('comment_text', LEFT(NEW.content, 200))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_feed_comment ON public.songfit_comments;
DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.songfit_comments;
CREATE TRIGGER trg_notify_feed_comment
  AFTER INSERT ON public.songfit_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_feed_comment();

-- Like => like
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.songfit_posts WHERE id = NEW.post_id;

  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, source)
  VALUES (post_owner, NEW.user_id, 'like', NEW.post_id, 'crowdfit_feed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_like ON public.songfit_likes;
DROP TRIGGER IF EXISTS trg_notify_on_like ON public.songfit_likes;
CREATE TRIGGER trg_notify_like
  AFTER INSERT ON public.songfit_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

-- Save => save
CREATE OR REPLACE FUNCTION public.notify_on_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.songfit_posts WHERE id = NEW.post_id;

  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, source)
  VALUES (post_owner, NEW.user_id, 'save', NEW.post_id, 'crowdfit_feed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_save ON public.songfit_saves;
CREATE TRIGGER trg_notify_save
  AFTER INSERT ON public.songfit_saves
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_save();

-- Follow => follow
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.followed_user_id = NEW.follower_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, source)
  VALUES (NEW.followed_user_id, NEW.follower_user_id, 'follow', 'crowdfit_feed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_follow ON public.songfit_follows;
DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.songfit_follows;
CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON public.songfit_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- Lyric reaction => lyric_reaction
CREATE OR REPLACE FUNCTION public.notify_on_lyric_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dance_owner uuid;
  dance_post_id uuid;
  dance_lyrics jsonb;
  lyric_text text;
BEGIN
  SELECT user_id, post_id, lyrics INTO dance_owner, dance_post_id, dance_lyrics
  FROM public.shareable_lyric_dances WHERE id = NEW.dance_id;

  IF dance_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.line_index IS NOT NULL AND dance_lyrics IS NOT NULL THEN
    lyric_text := dance_lyrics -> NEW.line_index ->> 'text';
  END IF;

  INSERT INTO public.notifications (user_id, type, post_id, dance_id, source, metadata)
  VALUES (
    dance_owner,
    'lyric_reaction',
    dance_post_id,
    NEW.dance_id,
    'shared_player',
    jsonb_build_object(
      'emoji', NEW.emoji,
      'line_index', COALESCE(NEW.line_index, -1),
      'lyric_text', COALESCE(lyric_text, ''),
      'session_id', COALESCE(NEW.session_id, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lyric_reaction ON public.lyric_dance_reactions;
CREATE TRIGGER trg_notify_lyric_reaction
  AFTER INSERT ON public.lyric_dance_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_lyric_reaction();

-- Lyric comment => lyric_comment
CREATE OR REPLACE FUNCTION public.notify_on_lyric_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dance_owner uuid;
  dance_post_id uuid;
  dance_lyrics jsonb;
  lyric_text text;
BEGIN
  SELECT user_id, post_id, lyrics INTO dance_owner, dance_post_id, dance_lyrics
  FROM public.shareable_lyric_dances WHERE id = NEW.dance_id;

  IF dance_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL AND dance_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.line_index IS NOT NULL AND dance_lyrics IS NOT NULL THEN
    lyric_text := dance_lyrics -> NEW.line_index ->> 'text';
  END IF;

  INSERT INTO public.notifications (user_id, actor_user_id, type, post_id, dance_id, source, metadata)
  VALUES (
    dance_owner,
    NEW.user_id,
    'lyric_comment',
    dance_post_id,
    NEW.dance_id,
    'shared_player',
    jsonb_build_object(
      'line_index', COALESCE(NEW.line_index, -1),
      'lyric_text', COALESCE(lyric_text, ''),
      'comment_text', LEFT(NEW.text, 200),
      'session_id', COALESCE(NEW.session_id, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lyric_comment ON public.lyric_dance_comments;
CREATE TRIGGER trg_notify_lyric_comment
  AFTER INSERT ON public.lyric_dance_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_lyric_comment();
