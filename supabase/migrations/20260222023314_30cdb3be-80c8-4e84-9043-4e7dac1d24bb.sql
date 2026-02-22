ALTER TABLE public.hookfit_posts
ADD CONSTRAINT hookfit_posts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);