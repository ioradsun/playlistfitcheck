-- 1. Prevent self-assignment of roles via signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _spotify_id text;
  _avatar text;
  _bio text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );
  _spotify_id := NEW.raw_user_meta_data->>'spotify_artist_id';
  _avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );
  _bio := NEW.raw_user_meta_data->>'bio';

  INSERT INTO public.profiles (id, display_name, spotify_artist_id, avatar_url, bio)
  VALUES (NEW.id, _name, _spotify_id, _avatar, _bio);

  -- Always default to 'user'. Admin/elevated roles must be granted explicitly via DB.
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user'::app_role);

  RETURN NEW;
END;
$function$;

-- 2. Lock down collab_points: users can no longer update their own points
DROP POLICY IF EXISTS "Users update own points" ON public.collab_points;
-- (No replacement INSERT/UPDATE policy: only SECURITY DEFINER functions / service role can mutate.)
