-- Allow users to update their own saved searches (needed to save report_data)
CREATE POLICY "Users can update their own searches"
ON public.saved_searches
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);