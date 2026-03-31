ALTER TABLE lyric_dance_comments
  ADD COLUMN IF NOT EXISTS moment_index integer,
  ADD COLUMN IF NOT EXISTS audio_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;
