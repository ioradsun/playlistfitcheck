ALTER TABLE public.songfit_comments
ADD CONSTRAINT songfit_comments_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);