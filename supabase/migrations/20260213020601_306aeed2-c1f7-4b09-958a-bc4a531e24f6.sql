CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _name text;
BEGIN
  -- Pick the best available name from metadata
  _name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  -- Create profile
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, _name);

  -- Assign role from metadata, default to 'user'
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'user');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$function$;
