ALTER TABLE public.widget_config
  ADD COLUMN IF NOT EXISTS embed_url text NOT NULL DEFAULT 'https://open.spotify.com/embed/artist/1PlkAOmfFYqBYFpN8jDj4v?utm_source=generator&theme=0',
  ADD COLUMN IF NOT EXISTS widget_title text NOT NULL DEFAULT 'Featured Artist';

UPDATE public.widget_config SET embed_url = 'https://open.spotify.com/embed/album/22n5K3UqcWCRUjlyyZMfQA?utm_source=generator&theme=0', widget_title = 'Featured Song';