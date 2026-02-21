
-- Add battle columns to shareable_hooks
ALTER TABLE public.shareable_hooks
  ADD COLUMN battle_id uuid DEFAULT NULL,
  ADD COLUMN battle_position smallint DEFAULT NULL,
  ADD COLUMN hook_label text DEFAULT NULL,
  ADD COLUMN vote_count integer NOT NULL DEFAULT 0;

-- Index for loading battle pairs
CREATE INDEX idx_shareable_hooks_battle_id ON public.shareable_hooks (battle_id) WHERE battle_id IS NOT NULL;

-- Create hook_votes table
CREATE TABLE public.hook_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id uuid NOT NULL,
  hook_id uuid NOT NULL REFERENCES public.shareable_hooks(id) ON DELETE CASCADE,
  user_id uuid DEFAULT NULL,
  session_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One vote per visitor per battle (session-based)
CREATE UNIQUE INDEX idx_hook_votes_battle_session ON public.hook_votes (battle_id, session_id) WHERE session_id IS NOT NULL;
-- One vote per visitor per battle (user-based)
CREATE UNIQUE INDEX idx_hook_votes_battle_user ON public.hook_votes (battle_id, user_id) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.hook_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can view votes
CREATE POLICY "Anyone can view hook votes"
  ON public.hook_votes FOR SELECT
  USING (true);

-- Anyone can insert votes (anon via session_id or auth via user_id)
CREATE POLICY "Anyone can submit hook votes"
  ON public.hook_votes FOR INSERT
  WITH CHECK (true);

-- Allow switching votes via upsert (update)
CREATE POLICY "Voters can update their own vote"
  ON public.hook_votes FOR UPDATE
  USING (
    (user_id IS NOT NULL AND auth.uid() = user_id)
    OR (session_id IS NOT NULL AND user_id IS NULL)
  );

-- Trigger to increment vote_count on shareable_hooks
CREATE OR REPLACE FUNCTION public.increment_hook_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shareable_hooks SET vote_count = vote_count + 1 WHERE id = NEW.hook_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Switching vote: decrement old, increment new
    IF OLD.hook_id <> NEW.hook_id THEN
      UPDATE public.shareable_hooks SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.hook_id;
      UPDATE public.shareable_hooks SET vote_count = vote_count + 1 WHERE id = NEW.hook_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.shareable_hooks SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.hook_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_hook_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.hook_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_hook_vote_count();
