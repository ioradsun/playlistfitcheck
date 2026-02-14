
-- Tighten insert policy: only authenticated users can insert, and only for themselves as actor
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "Triggers insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_user_id);
