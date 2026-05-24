
-- 1) Realtime per-user topic scoping
DROP POLICY IF EXISTS authenticated_can_receive_own ON realtime.messages;
DROP POLICY IF EXISTS authenticated_can_send_own ON realtime.messages;

CREATE POLICY "authenticated_can_receive_own"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = 'user:' || auth.uid()::text);

CREATE POLICY "authenticated_can_send_own"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (realtime.topic() = 'user:' || auth.uid()::text);

-- 2) Pin search_path on SECURITY DEFINER helper functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
