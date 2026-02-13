
CREATE TABLE public.saved_lyrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  artist text NOT NULL DEFAULT 'Unknown',
  filename text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_lyrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lyrics" ON public.saved_lyrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own lyrics" ON public.saved_lyrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lyrics" ON public.saved_lyrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lyrics" ON public.saved_lyrics FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_lyrics_updated_at
  BEFORE UPDATE ON public.saved_lyrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
