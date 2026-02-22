
-- Create hookfit_posts table
CREATE TABLE public.hookfit_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  battle_id uuid NOT NULL,
  hook_id uuid NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'live'
);

-- Enable RLS
ALTER TABLE public.hookfit_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view
CREATE POLICY "Anyone can view hookfit posts"
ON public.hookfit_posts FOR SELECT
USING (true);

-- Auth users can insert own
CREATE POLICY "Auth users can create hookfit posts"
ON public.hookfit_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own
CREATE POLICY "Users can update own hookfit posts"
ON public.hookfit_posts FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete own
CREATE POLICY "Users can delete own hookfit posts"
ON public.hookfit_posts FOR DELETE
USING (auth.uid() = user_id);

-- Unique constraint: one feed post per battle
CREATE UNIQUE INDEX hookfit_posts_battle_id_unique ON public.hookfit_posts (battle_id);
