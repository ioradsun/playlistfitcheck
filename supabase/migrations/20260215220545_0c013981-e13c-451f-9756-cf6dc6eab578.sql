
-- Create songfit_tips table to log each tip
CREATE TABLE public.songfit_tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.songfit_posts(id) ON DELETE CASCADE,
  tipper_user_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.songfit_tips ENABLE ROW LEVEL SECURITY;

-- Anyone can view tips
CREATE POLICY "Anyone can view tips" ON public.songfit_tips FOR SELECT USING (true);

-- Auth users can insert their own tips
CREATE POLICY "Auth users can log tips" ON public.songfit_tips FOR INSERT WITH CHECK (auth.uid() = tipper_user_id);

-- Add tips_total column to songfit_posts
ALTER TABLE public.songfit_posts ADD COLUMN tips_total NUMERIC NOT NULL DEFAULT 0;

-- Trigger to increment tips_total on songfit_posts when a tip is inserted
CREATE OR REPLACE FUNCTION public.increment_tips_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.songfit_posts SET tips_total = tips_total + NEW.amount WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_tip_inserted
AFTER INSERT ON public.songfit_tips
FOR EACH ROW
EXECUTE FUNCTION public.increment_tips_total();
