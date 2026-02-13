
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create mix_projects table
CREATE TABLE public.mix_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  mixes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mix_projects ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own mix projects"
ON public.mix_projects FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mix projects"
ON public.mix_projects FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mix projects"
ON public.mix_projects FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mix projects"
ON public.mix_projects FOR DELETE
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_mix_projects_updated_at
BEFORE UPDATE ON public.mix_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
