
-- Table to store editable AI prompts for each edge function
CREATE TABLE public.ai_prompts (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Everyone can read prompts (edge functions need this)
CREATE POLICY "Anyone can read ai_prompts" ON public.ai_prompts
  FOR SELECT USING (true);

-- Only admins can update
CREATE POLICY "Admins can update ai_prompts" ON public.ai_prompts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'curator')
    OR auth.jwt()->>'email' IN ('sunpatel@gmail.com', 'spatel@iorad.com')
  );

CREATE POLICY "Admins can insert ai_prompts" ON public.ai_prompts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'curator')
    OR auth.jwt()->>'email' IN ('sunpatel@gmail.com', 'spatel@iorad.com')
  );

-- Trigger for updated_at
CREATE TRIGGER update_ai_prompts_updated_at
  BEFORE UPDATE ON public.ai_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
