ALTER TABLE lyric_dances ADD COLUMN IF NOT EXISTS scene_manifest JSONB;
ALTER TABLE shareable_lyric_dances ADD COLUMN IF NOT EXISTS scene_manifest JSONB;
