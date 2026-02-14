-- Drop existing FK to auth.users, add FK to profiles instead
ALTER TABLE public.songfit_posts
  DROP CONSTRAINT songfit_posts_user_id_fkey;

ALTER TABLE public.songfit_posts
  ADD CONSTRAINT songfit_posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
