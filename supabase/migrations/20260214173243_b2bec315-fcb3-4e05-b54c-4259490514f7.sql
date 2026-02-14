ALTER TABLE public.songfit_likes
ADD CONSTRAINT songfit_likes_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);