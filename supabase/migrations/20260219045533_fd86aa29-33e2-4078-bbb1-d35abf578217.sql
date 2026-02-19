CREATE POLICY "Users can delete own hook reviews"
  ON public.songfit_hook_reviews
  FOR DELETE
  USING (auth.uid() = user_id);