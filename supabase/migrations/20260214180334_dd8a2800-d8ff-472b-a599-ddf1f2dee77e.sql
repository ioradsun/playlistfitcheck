-- Update handle_new_user to store spotify_artist_id from signup metadata
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
BEGIN
  -- Pick the best available name from metadata
  _name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  -- Extract spotify artist id if provided during signup
  _spotify_id := NEW.raw_user_meta_data->>'spotify_artist_id';

  -- Create profile with spotify artist id
  INSERT INTO public.profiles (id, display_name, spotify_artist_id)
  VALUES (NEW.id, _name, _spotify_id);

  -- Assign role from metadata, default to 'user'
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;