-- Add palette column to songfit_posts.
-- Stores computed color palette as a JSON array of hex strings (e.g. ["#0a0a0f","#C9A96E","#ffffff","#FFD700","#5A4A30"]).
-- Nullable: old posts will be null until backfilled.
ALTER TABLE songfit_posts ADD COLUMN IF NOT EXISTS palette jsonb DEFAULT NULL;

-- Backfill existing Spotify posts from their album art.
-- This is best done via an edge function or script that calls computeAutoPalettesFromUrls.
-- For now, null palette falls back to client-side computation with a cache.
COMMENT ON COLUMN songfit_posts.palette IS 'Computed color palette from album art or lyric dance. JSON array of hex strings.';
