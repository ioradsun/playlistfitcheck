
-- Create saved_hitfit table for persisting HitFit analysis results
CREATE TABLE public.saved_hitfit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL DEFAULT 'Untitled',
  analysis_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_hitfit ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved analyses
CREATE POLICY "Users can view their own hitfit analyses"
  ON public.saved_hitfit FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own hitfit analyses"
  ON public.saved_hitfit FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hitfit analyses"
  ON public.saved_hitfit FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hitfit analyses"
  ON public.saved_hitfit FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_saved_hitfit_updated_at
  BEFORE UPDATE ON public.saved_hitfit
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
