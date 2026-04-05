ALTER TABLE public.lyric_dance_fires
  ADD COLUMN IF NOT EXISTS user_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ldf_user
  ON public.lyric_dance_fires (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ldf_user_dance
  ON public.lyric_dance_fires (user_id, dance_id)
  WHERE user_id IS NOT NULL;
