
-- Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;

-- Make profiles publicly readable (public profile pages) but only self-editable
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Also make saved_searches publicly readable (for public profile)
DROP POLICY IF EXISTS "Users can view their own searches" ON public.saved_searches;
CREATE POLICY "Anyone can view searches"
  ON public.saved_searches FOR SELECT
  USING (true);

-- Make user_roles publicly readable (to show role on public profile)
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Anyone can read roles"
  ON public.user_roles FOR SELECT
  USING (true);
