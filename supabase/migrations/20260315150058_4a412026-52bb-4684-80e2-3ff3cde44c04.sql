-- Drop the FK constraint that prevents ghost profile creation
-- Ghost profiles use is_claimed=false and get linked to real auth users on claim
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;