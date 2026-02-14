-- Update handle_new_user to store avatar_url from signup metadata (Spotify artist image)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _name text;
  _spotify_id text;
  _avatar text;
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

  INSERT INTO public.profiles (id, display_name, spotify_artist_id, avatar_url)
  VALUES (NEW.id, _name, _spotify_id, _avatar);

  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;