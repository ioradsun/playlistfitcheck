
-- Create the lyric-backgrounds storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('lyric-backgrounds', 'lyric-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read lyric backgrounds"
ON storage.objects FOR SELECT
USING (bucket_id = 'lyric-backgrounds');

-- Allow service role uploads (edge function uses service role key)
CREATE POLICY "Service role upload lyric backgrounds"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lyric-backgrounds');
