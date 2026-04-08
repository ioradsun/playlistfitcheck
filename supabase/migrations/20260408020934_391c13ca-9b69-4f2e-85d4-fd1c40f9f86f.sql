
-- ── lyric_projects ───────────────────────────────────────────────
CREATE TABLE lyric_projects (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL,
  title                TEXT        NOT NULL DEFAULT 'Untitled',
  artist_name          TEXT,
  artist_slug          TEXT,
  url_slug             TEXT,
  audio_url            TEXT,
  filename             TEXT,
  lines                JSONB,
  words                JSONB,
  fmly_lines           JSONB,
  version_meta         JSONB,
  cinematic_direction  JSONB,
  beat_grid            JSONB,
  section_images       TEXT[],
  palette              TEXT[],
  auto_palettes        JSONB,
  render_data          JSONB,
  song_signature       JSONB,
  empowerment_promise  JSONB,
  physics_spec         JSONB,
  spotify_track_id     TEXT,
  album_art_url        TEXT,
  is_published         BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at         TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX lyric_projects_url_idx
  ON lyric_projects(artist_slug, url_slug)
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX lyric_projects_user_idx
  ON lyric_projects(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ── feed_posts ───────────────────────────────────────────────────
CREATE TABLE feed_posts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL,
  caption           TEXT        NOT NULL DEFAULT '',
  tags_json         JSONB       NOT NULL DEFAULT '[]',
  status            TEXT        NOT NULL DEFAULT 'live',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  cooldown_until    TIMESTAMPTZ,
  cycle_number      INTEGER     NOT NULL DEFAULT 1,
  impressions       INTEGER     NOT NULL DEFAULT 0,
  fires_count       INTEGER     NOT NULL DEFAULT 0,
  saves_count       INTEGER     NOT NULL DEFAULT 0,
  comments_count    INTEGER     NOT NULL DEFAULT 0,
  engagement_score  NUMERIC     NOT NULL DEFAULT 0,
  peak_rank         INTEGER,
  legacy_boost      NUMERIC     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feed_posts_live_idx
  ON feed_posts(status, created_at DESC)
  WHERE status = 'live';

CREATE INDEX feed_posts_user_idx
  ON feed_posts(user_id, created_at DESC);

-- ── project_fires ────────────────────────────────────────────────
CREATE TABLE project_fires (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id  TEXT,
  user_id     UUID,
  line_index  INTEGER,
  time_sec    NUMERIC,
  hold_ms     INTEGER,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_fires_project_idx ON project_fires(project_id, line_index);
CREATE INDEX project_fires_session_idx ON project_fires(project_id, session_id);

-- ── project_exposures ────────────────────────────────────────────
CREATE TABLE project_exposures (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id  TEXT,
  user_id     UUID,
  line_index  INTEGER,
  source      TEXT,
  UNIQUE (project_id, session_id, line_index)
);

CREATE INDEX project_exposures_project_idx ON project_exposures(project_id);

-- ── project_closing_picks ────────────────────────────────────────
CREATE TABLE project_closing_picks (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id  TEXT,
  hook_index  INTEGER,
  free_text   TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, session_id)
);

-- ── project_plays ────────────────────────────────────────────────
CREATE TABLE project_plays (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id       TEXT,
  user_id          UUID,
  was_muted        BOOLEAN,
  max_progress_pct INTEGER,
  play_count       INTEGER DEFAULT 1,
  duration_sec     INTEGER,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, session_id)
);

-- ── project_comments ────────────────────────────────────────────
CREATE TABLE project_comments (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  user_id     UUID,
  session_id  TEXT,
  text        TEXT    NOT NULL,
  line_index  INTEGER,
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX project_comments_project_idx ON project_comments(project_id, line_index);

-- ── project_angle_votes ──────────────────────────────────────────
CREATE TABLE project_angle_votes (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID    NOT NULL REFERENCES lyric_projects(id) ON DELETE CASCADE,
  session_id  TEXT,
  user_id     UUID,
  hook_index  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── feed_comments ────────────────────────────────────────────────
CREATE TABLE feed_comments (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           UUID    NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id           UUID,
  content           TEXT    NOT NULL,
  parent_comment_id UUID    REFERENCES feed_comments(id),
  likes_count       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feed_comments_post_idx ON feed_comments(post_id, created_at);

-- ── feed_saves ───────────────────────────────────────────────────
CREATE TABLE feed_saves (
  post_id    UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── feed_likes ───────────────────────────────────────────────────
CREATE TABLE feed_likes (
  post_id    UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── feed_hook_reviews ────────────────────────────────────────────
CREATE TABLE feed_hook_reviews (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID    NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id      UUID,
  session_id   TEXT,
  would_replay BOOLEAN,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE lyric_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_fires ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_closing_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_angle_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_hook_reviews ENABLE ROW LEVEL SECURITY;

-- lyric_projects policies
CREATE POLICY "Anyone can view published projects" ON lyric_projects FOR SELECT USING (is_published = TRUE OR auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON lyric_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON lyric_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON lyric_projects FOR DELETE USING (auth.uid() = user_id);

-- feed_posts policies
CREATE POLICY "Anyone can view live feed posts" ON feed_posts FOR SELECT USING (true);
CREATE POLICY "Users can insert own feed posts" ON feed_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feed posts" ON feed_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own feed posts" ON feed_posts FOR DELETE USING (auth.uid() = user_id);

-- Telemetry tables: public insert, public read
CREATE POLICY "Anyone can insert fires" ON project_fires FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read fires" ON project_fires FOR SELECT USING (true);

CREATE POLICY "Anyone can insert exposures" ON project_exposures FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read exposures" ON project_exposures FOR SELECT USING (true);

CREATE POLICY "Anyone can insert closing picks" ON project_closing_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read closing picks" ON project_closing_picks FOR SELECT USING (true);

CREATE POLICY "Anyone can upsert plays" ON project_plays FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read plays" ON project_plays FOR SELECT USING (true);
CREATE POLICY "Anyone can update plays" ON project_plays FOR UPDATE USING (true);

CREATE POLICY "Anyone can insert project comments" ON project_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read project comments" ON project_comments FOR SELECT USING (true);

CREATE POLICY "Anyone can insert angle votes" ON project_angle_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read angle votes" ON project_angle_votes FOR SELECT USING (true);

-- Feed interaction tables
CREATE POLICY "Anyone can read feed comments" ON feed_comments FOR SELECT USING (true);
CREATE POLICY "Auth users can insert feed comments" ON feed_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own feed comments" ON feed_comments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read feed saves" ON feed_saves FOR SELECT USING (true);
CREATE POLICY "Auth users can save" ON feed_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave" ON feed_saves FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read feed likes" ON feed_likes FOR SELECT USING (true);
CREATE POLICY "Auth users can like" ON feed_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON feed_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can insert hook reviews" ON feed_hook_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read hook reviews" ON feed_hook_reviews FOR SELECT USING (true);

-- ── updated_at trigger ───────────────────────────────────────────
CREATE TRIGGER update_lyric_projects_updated_at
  BEFORE UPDATE ON lyric_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
