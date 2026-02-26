ALTER TABLE public.shareable_hooks RENAME COLUMN physics_spec TO motion_profile_spec;
NOTIFY pgrst, 'reload schema';