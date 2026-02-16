
-- Add is_verified to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Create verification_requests table
CREATE TABLE public.verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  screenshot_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can submit verification requests"
ON public.verification_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own verification requests"
ON public.verification_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all (via edge function with service role)

-- Create storage bucket for verification screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('verification-screenshots', 'verification-screenshots', false);

-- Users can upload to their own folder
CREATE POLICY "Users can upload verification screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'verification-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can view their own screenshots
CREATE POLICY "Users can view own verification screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'verification-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
