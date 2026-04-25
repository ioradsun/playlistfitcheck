-- artist_pages is replaced by columns on public.profiles.
-- Data was migrated in 20260425130000_profile_socials.sql.
DROP TABLE IF EXISTS public.artist_pages CASCADE;
