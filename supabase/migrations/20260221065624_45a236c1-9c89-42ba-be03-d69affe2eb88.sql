-- Allow admins to update any dream's status
CREATE POLICY "Admins can update any dream"
ON public.dream_tools
FOR UPDATE
USING (
  (auth.jwt() ->> 'email') = ANY (ARRAY['sunpatel@gmail.com', 'spatel@iorad.com'])
);