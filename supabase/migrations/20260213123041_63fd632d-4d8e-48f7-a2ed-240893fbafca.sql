
-- Create a storage bucket for widget assets
INSERT INTO storage.buckets (id, name, public) VALUES ('widget-assets', 'widget-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Widget assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'widget-assets');

-- Allow authenticated users to upload (admin check happens in app code)
CREATE POLICY "Authenticated users can upload widget assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'widget-assets' AND auth.role() = 'authenticated');

-- Allow authenticated users to update/delete
CREATE POLICY "Authenticated users can manage widget assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'widget-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete widget assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'widget-assets' AND auth.role() = 'authenticated');
