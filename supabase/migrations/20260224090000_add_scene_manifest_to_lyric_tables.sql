ALTER TABLE lyric_dances ADD COLUMN IF NOT EXISTS frame_state JSONB;
ALTER TABLE shareable_lyric_dances ADD COLUMN IF NOT EXISTS frame_state JSONB;
