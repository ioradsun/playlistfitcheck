
-- Usage tracking table
CREATE TABLE public.usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text,
  tool text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'lifetime',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Anyone can read their own usage (or anonymous by session)
CREATE POLICY "Users read own usage" ON public.usage_tracking FOR SELECT
  USING (user_id = auth.uid() OR (user_id IS NULL AND session_id IS NOT NULL));

-- Authenticated users can insert/update their own usage
CREATE POLICY "Users insert own usage" ON public.usage_tracking FOR INSERT
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND session_id IS NOT NULL));

CREATE POLICY "Users update own usage" ON public.usage_tracking FOR UPDATE
  USING (user_id = auth.uid() OR (user_id IS NULL AND session_id IS NOT NULL));

-- Anonymous insert/update (anon role)
CREATE POLICY "Anon insert usage" ON public.usage_tracking FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Anon update usage" ON public.usage_tracking FOR UPDATE TO anon
  USING (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Anon read usage" ON public.usage_tracking FOR SELECT TO anon
  USING (user_id IS NULL AND session_id IS NOT NULL);

-- Unique constraint for upsert
CREATE UNIQUE INDEX usage_tracking_user_tool_period ON public.usage_tracking (user_id, tool, period) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX usage_tracking_session_tool_period ON public.usage_tracking (session_id, tool, period) WHERE session_id IS NOT NULL;

-- Invites table
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invite_code text NOT NULL,
  invitee_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own invites" ON public.invites FOR SELECT
  USING (inviter_user_id = auth.uid() OR invitee_user_id = auth.uid());

CREATE POLICY "Users insert own invites" ON public.invites FOR INSERT
  WITH CHECK (inviter_user_id = auth.uid());

-- Collab points table
CREATE TABLE public.collab_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  badge text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collab_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view collab points" ON public.collab_points FOR SELECT
  USING (true);

CREATE POLICY "Users update own points" ON public.collab_points FOR UPDATE
  USING (user_id = auth.uid());

-- Add invite_code and is_unlimited to profiles
ALTER TABLE public.profiles ADD COLUMN invite_code text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN is_unlimited boolean NOT NULL DEFAULT false;

-- Auto-generate invite code on profile creation
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invite_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_invite_code();

-- Generate invite codes for existing profiles that don't have one
UPDATE public.profiles SET invite_code = substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12) WHERE invite_code IS NULL;

-- Auto-create collab_points row on profile creation
CREATE OR REPLACE FUNCTION public.create_collab_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.collab_points (user_id, points, badge) VALUES (NEW.id, 0, NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_collab_points
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_collab_points();
