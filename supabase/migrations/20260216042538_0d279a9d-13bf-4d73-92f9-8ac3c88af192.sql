
-- Add trailblazer_number to profiles (null = not yet assigned or over 1000)
ALTER TABLE public.profiles ADD COLUMN trailblazer_number integer;

-- Backfill existing profiles with their signup order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET trailblazer_number = n.rn
FROM numbered n
WHERE p.id = n.id AND n.rn <= 1000;

-- Trigger function: auto-assign trailblazer number on new profile creation
CREATE OR REPLACE FUNCTION public.assign_trailblazer_number()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
BEGIN
  SELECT COUNT(*) INTO current_count FROM public.profiles WHERE trailblazer_number IS NOT NULL;
  IF current_count < 1000 THEN
    NEW.trailblazer_number := current_count + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_assign_trailblazer
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_trailblazer_number();
