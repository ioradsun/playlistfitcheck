-- Drop the old check constraint and add one that includes resolved/bypassed
ALTER TABLE public.dream_tools DROP CONSTRAINT dream_tools_status_check;
ALTER TABLE public.dream_tools ADD CONSTRAINT dream_tools_status_check CHECK (status IN ('seeding', 'momentum', 'review', 'building', 'live', 'not_a_fit', 'resolved', 'bypassed'));