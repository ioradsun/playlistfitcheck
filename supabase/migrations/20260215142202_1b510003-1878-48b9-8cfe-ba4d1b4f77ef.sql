ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);