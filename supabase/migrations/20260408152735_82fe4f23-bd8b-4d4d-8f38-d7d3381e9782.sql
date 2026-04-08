CREATE OR REPLACE FUNCTION public.remove_feed_post_on_project_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a project is soft-deleted, remove its feed post
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.feed_posts WHERE project_id = NEW.id;
    -- Also un-publish so the public URL stops working
    NEW.is_published := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_remove_feed_on_project_delete
BEFORE UPDATE ON public.lyric_projects
FOR EACH ROW
EXECUTE FUNCTION public.remove_feed_post_on_project_delete();