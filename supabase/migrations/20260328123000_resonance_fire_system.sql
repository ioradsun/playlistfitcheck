-- Fire events — one row per tap or hold
CREATE TABLE public.lyric_dance_fires (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_id    uuid        NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  session_id  text        NOT NULL,
  line_index  integer     NOT NULL,
  time_sec    numeric     NOT NULL,
  hold_ms     integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lyric_dance_fires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert fires"
  ON public.lyric_dance_fires FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read fires"
  ON public.lyric_dance_fires FOR SELECT USING (true);
CREATE INDEX idx_ldf_dance       ON public.lyric_dance_fires (dance_id);
CREATE INDEX idx_ldf_dance_line  ON public.lyric_dance_fires (dance_id, line_index);
CREATE INDEX idx_ldf_dance_time  ON public.lyric_dance_fires (dance_id, time_sec);

-- Exposure events — one row per session per line (deduped)
CREATE TABLE public.lyric_dance_exposures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_id    uuid        NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  session_id  text        NOT NULL,
  line_index  integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exposure UNIQUE (dance_id, session_id, line_index)
);
ALTER TABLE public.lyric_dance_exposures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert exposures"
  ON public.lyric_dance_exposures FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read exposures"
  ON public.lyric_dance_exposures FOR SELECT USING (true);

-- Closing screen picks — one row per session per dance
CREATE TABLE public.lyric_dance_closing_picks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_id    uuid        NOT NULL REFERENCES public.shareable_lyric_dances(id) ON DELETE CASCADE,
  session_id  text        NOT NULL,
  hook_index  integer,
  free_text   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_closing UNIQUE (dance_id, session_id)
);
ALTER TABLE public.lyric_dance_closing_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert closing picks"
  ON public.lyric_dance_closing_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read closing picks"
  ON public.lyric_dance_closing_picks FOR SELECT USING (true);

-- Add clip_start to angle_votes if not exists
ALTER TABLE public.lyric_dance_angle_votes
  ADD COLUMN IF NOT EXISTS clip_start numeric DEFAULT NULL;

-- Fire strength per line (normalized by exposure count)
CREATE OR REPLACE VIEW public.v_fire_strength AS
SELECT
  f.dance_id,
  f.line_index,
  SUM(
    CASE
      WHEN f.hold_ms < 300  THEN 1
      WHEN f.hold_ms < 1000 THEN 2
      WHEN f.hold_ms < 3000 THEN 4
      ELSE 8
    END
  ) AS raw_score,
  COUNT(*) AS fire_count,
  COALESCE(e.exposure_count, 0) AS exposure_count,
  ROUND(
    SUM(
      CASE
        WHEN f.hold_ms < 300  THEN 1
        WHEN f.hold_ms < 1000 THEN 2
        WHEN f.hold_ms < 3000 THEN 4
        ELSE 8
      END
    )::numeric / NULLIF(e.exposure_count, 0),
    2
  ) AS fire_strength,
  ROUND(AVG(f.hold_ms)) AS avg_hold_ms
FROM public.lyric_dance_fires f
LEFT JOIN (
  SELECT dance_id, line_index, COUNT(DISTINCT session_id) AS exposure_count
  FROM public.lyric_dance_exposures
  GROUP BY dance_id, line_index
) e ON e.dance_id = f.dance_id AND e.line_index = f.line_index
GROUP BY f.dance_id, f.line_index, e.exposure_count;

-- Closing pick distribution per dance
CREATE OR REPLACE VIEW public.v_closing_distribution AS
SELECT
  dance_id,
  hook_index,
  COUNT(*) AS pick_count,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY dance_id) * 100) AS pct
FROM public.lyric_dance_closing_picks
WHERE hook_index IS NOT NULL
GROUP BY dance_id, hook_index;

-- Free form responses grouped (raw — artist reads these)
CREATE OR REPLACE VIEW public.v_free_form_responses AS
SELECT
  dance_id,
  free_text,
  COUNT(*) AS repeat_count,
  MIN(created_at) AS first_seen_at
FROM public.lyric_dance_closing_picks
WHERE free_text IS NOT NULL AND LENGTH(TRIM(free_text)) > 3
GROUP BY dance_id, free_text
ORDER BY repeat_count DESC;
