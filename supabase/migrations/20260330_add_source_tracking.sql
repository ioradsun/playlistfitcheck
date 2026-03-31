-- Source attribution for fire/exposure/closing signals.
-- Values: 'feed' (CrowdFit card), 'shareable' (direct link page), 'embed' (embedded player).
-- Nullable: existing rows stay NULL (pre-attribution).

ALTER TABLE public.lyric_dance_fires
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

ALTER TABLE public.lyric_dance_exposures
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

ALTER TABLE public.lyric_dance_closing_picks
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

-- Index for efficient source-grouped queries
CREATE INDEX IF NOT EXISTS idx_ldf_source ON public.lyric_dance_fires (dance_id, source);

COMMENT ON COLUMN public.lyric_dance_fires.source IS 'Where this fire came from: feed, shareable, embed. NULL = pre-attribution.';
COMMENT ON COLUMN public.lyric_dance_exposures.source IS 'Where this exposure came from: feed, shareable, embed. NULL = pre-attribution.';
COMMENT ON COLUMN public.lyric_dance_closing_picks.source IS 'Where this closing pick came from: feed, shareable, embed. NULL = pre-attribution.';
