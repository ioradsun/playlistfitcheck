-- One thread per pair of users (canonical: user_a_id < user_b_id alphabetically)
CREATE TABLE public.dm_threads (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dm_thread UNIQUE (user_a_id, user_b_id),
  CONSTRAINT chk_dm_order CHECK (user_a_id < user_b_id)
);

CREATE INDEX idx_dm_threads_a ON public.dm_threads (user_a_id, last_activity_at DESC);
CREATE INDEX idx_dm_threads_b ON public.dm_threads (user_b_id, last_activity_at DESC);

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own threads"
  ON public.dm_threads FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Users create threads they belong to"
  ON public.dm_threads FOR INSERT
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Messages within a thread
CREATE TABLE public.dm_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid        NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read    boolean     NOT NULL DEFAULT false
);

CREATE INDEX idx_dm_messages_thread ON public.dm_messages (thread_id, created_at ASC);
CREATE INDEX idx_dm_messages_unread ON public.dm_messages (thread_id, is_read) WHERE is_read = false;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants read messages"
  ON public.dm_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id
      AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Sender inserts messages"
  ON public.dm_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id
      AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Recipient marks read"
  ON public.dm_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = thread_id
      AND (t.user_a_id = auth.uid() OR t.user_b_id = auth.uid())
    )
  )
  WITH CHECK (sender_id != auth.uid());

-- Trigger: keep last_activity_at current on new message
CREATE OR REPLACE FUNCTION public.update_thread_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.dm_threads
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dm_thread_activity
  AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_thread_activity();

-- Presence: last time each user was seen in a thread
CREATE TABLE public.dm_presence (
  thread_id  uuid        NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.dm_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Thread participants manage presence"
  ON public.dm_presence FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
