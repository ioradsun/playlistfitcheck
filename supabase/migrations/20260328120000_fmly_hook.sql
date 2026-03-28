-- Store generated empowerment promise on the dance row
ALTER TABLE public.shareable_lyric_dances
  ADD COLUMN IF NOT EXISTS empowerment_promise jsonb NULL;

-- Audience angle votes — one per session/user per dance
CREATE TABLE IF NOT EXISTS public.lyric_dance_angle_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_id uuid NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  hook_index int NOT NULL CHECK (hook_index >= 0 AND hook_index <= 5),
  session_id text NULL,
  user_id uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_voter CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

ALTER TABLE public.lyric_dance_angle_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read angle votes"
  ON public.lyric_dance_angle_votes FOR SELECT USING (true);

CREATE POLICY "Anyone can vote"
  ON public.lyric_dance_angle_votes FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (user_id IS NULL AND session_id IS NOT NULL)
  );

-- One vote per session per dance
CREATE UNIQUE INDEX IF NOT EXISTS angle_votes_session_dance
  ON public.lyric_dance_angle_votes (session_id, dance_id)
  WHERE session_id IS NOT NULL;

-- One vote per user per dance
CREATE UNIQUE INDEX IF NOT EXISTS angle_votes_user_dance
  ON public.lyric_dance_angle_votes (user_id, dance_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_angle_votes_dance_id
  ON public.lyric_dance_angle_votes (dance_id);
