CREATE POLICY "Admins can delete ai_prompts"
ON public.ai_prompts
FOR DELETE
USING (
  (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'curator'::app_role
  )) OR ((auth.jwt() ->> 'email'::text) = ANY (ARRAY['sunpatel@gmail.com'::text, 'spatel@iorad.com'::text]))
);