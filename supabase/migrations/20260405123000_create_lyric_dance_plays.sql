CREATE TABLE public.lyric_dance_plays (
  dance_id         uuid     NOT NULL
                   REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  session_id       text     NOT NULL,
  user_id          uuid     REFERENCES public.profiles(id) ON DELETE SET NULL,
  was_muted        boolean  NOT NULL DEFAULT true,
  max_progress_pct smallint NOT NULL DEFAULT 0
                   CHECK (max_progress_pct BETWEEN 0 AND 100),
  play_count       smallint NOT NULL DEFAULT 1,
  duration_sec     integer  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dance_id, session_id)
);

CREATE INDEX idx_ldp_dance ON public.lyric_dance_plays (dance_id);
CREATE INDEX idx_ldp_user  ON public.lyric_dance_plays (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.lyric_dance_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert plays"
  ON public.lyric_dance_plays FOR INSERT WITH CHECK (true);
CREATE POLICY "Public upsert plays"
  ON public.lyric_dance_plays FOR UPDATE USING (true);
CREATE POLICY "Public read plays"
  ON public.lyric_dance_plays FOR SELECT USING (true);
