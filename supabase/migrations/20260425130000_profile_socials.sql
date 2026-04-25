ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS merch_url TEXT;

-- One-time backfill from artist_pages (legacy source of truth).
UPDATE public.profiles p
   SET tiktok_url = ap.tiktok_url
  FROM public.artist_pages ap
 WHERE ap.user_id = p.id
   AND p.tiktok_url IS NULL
   AND ap.tiktok_url IS NOT NULL;

UPDATE public.profiles p
   SET merch_url = ap.merch_url
  FROM public.artist_pages ap
 WHERE ap.user_id = p.id
   AND p.merch_url IS NULL
   AND ap.merch_url IS NOT NULL;

-- Backfill social links where profiles are missing values.
UPDATE public.profiles p
   SET instagram_url = COALESCE(p.instagram_url, ap.instagram_url),
       youtube_url   = COALESCE(p.youtube_url, ap.youtube_url),
       website_url   = COALESCE(p.website_url, ap.website_url)
  FROM public.artist_pages ap
 WHERE ap.user_id = p.id
   AND (
     (p.instagram_url IS NULL AND ap.instagram_url IS NOT NULL) OR
     (p.youtube_url IS NULL AND ap.youtube_url IS NOT NULL) OR
     (p.website_url IS NULL AND ap.website_url IS NOT NULL)
   );
