ALTER TABLE public.feed_posts
ADD CONSTRAINT feed_posts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;