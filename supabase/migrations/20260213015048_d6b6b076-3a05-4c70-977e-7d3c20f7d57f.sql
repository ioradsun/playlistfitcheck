-- Allow users to update their own role
CREATE POLICY "Users can delete their own role"
ON public.user_roles
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own role"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);
