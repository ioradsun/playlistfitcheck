
-- Create saved_vibefit table
CREATE TABLE public.saved_vibefit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  song_title TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  moods TEXT[] NOT NULL DEFAULT '{}',
  result_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_vibefit ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own vibefit" ON public.saved_vibefit FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own vibefit" ON public.saved_vibefit FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vibefit" ON public.saved_vibefit FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vibefit" ON public.saved_vibefit FOR DELETE USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_saved_vibefit_updated_at
  BEFORE UPDATE ON public.saved_vibefit
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
