CREATE POLICY "Users can delete their own searches"
ON public.saved_searches
FOR DELETE
USING (auth.uid() = user_id);