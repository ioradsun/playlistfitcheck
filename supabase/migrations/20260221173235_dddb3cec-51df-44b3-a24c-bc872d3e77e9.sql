
-- Shareable hooks table
CREATE TABLE public.shareable_hooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  artist_slug TEXT NOT NULL,
  song_slug TEXT NOT NULL,
  hook_slug TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  song_name TEXT NOT NULL,
  hook_phrase TEXT NOT NULL,
  artist_dna JSONB,
  physics_spec JSONB NOT NULL,
  beat_grid JSONB NOT NULL,
  hook_start NUMERIC NOT NULL,
  hook_end NUMERIC NOT NULL,
  lyrics JSONB NOT NULL,
  audio_url TEXT NOT NULL,
  fire_count INTEGER NOT NULL DEFAULT 0,
  system_type TEXT NOT NULL DEFAULT 'fracture',
  palette JSONB NOT NULL DEFAULT '["#ffffff","#a855f7","#ec4899"]'::jsonb,
  signature_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artist_slug, song_slug, hook_slug)
);

ALTER TABLE public.shareable_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shareable hooks"
  ON public.shareable_hooks FOR SELECT USING (true);

CREATE POLICY "Auth users can create their own hooks"
  ON public.shareable_hooks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hooks"
  ON public.shareable_hooks FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hooks"
  ON public.shareable_hooks FOR DELETE USING (auth.uid() = user_id);

-- Hook comments table
CREATE TABLE public.hook_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hook_id UUID NOT NULL REFERENCES public.shareable_hooks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  session_id TEXT,
  user_id UUID,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hook_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hook comments"
  ON public.hook_comments FOR SELECT USING (true);

CREATE POLICY "Anyone can submit hook comments"
  ON public.hook_comments FOR INSERT WITH CHECK (true);

-- Trigger to increment fire_count on new comment
CREATE OR REPLACE FUNCTION public.increment_hook_fire_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.shareable_hooks SET fire_count = fire_count + 1 WHERE id = NEW.hook_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER increment_hook_fire
  AFTER INSERT ON public.hook_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_hook_fire_count();

-- Audio clips storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-clips', 'audio-clips', true);

CREATE POLICY "Anyone can read audio clips"
  ON storage.objects FOR SELECT USING (bucket_id = 'audio-clips');

CREATE POLICY "Auth users can upload audio clips"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audio-clips' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their audio clips"
  ON storage.objects FOR UPDATE USING (bucket_id = 'audio-clips' AND auth.uid() IS NOT NULL);
