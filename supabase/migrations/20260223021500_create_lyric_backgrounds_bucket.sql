INSERT INTO storage.buckets (id, name, public)
VALUES ('lyric-backgrounds', 'lyric-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read lyric backgrounds'
  ) THEN
    CREATE POLICY "Public read lyric backgrounds"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'lyric-backgrounds');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role insert lyric backgrounds'
  ) THEN
    CREATE POLICY "Service role insert lyric backgrounds"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'lyric-backgrounds' AND auth.role() = 'service_role');
  END IF;
END
$$;
