-- Lock down pgmq wrapper functions: only service_role should call them
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- Agent token management: must be a signed-in user; remove anon access
REVOKE EXECUTE ON FUNCTION public.rotate_agent_token(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_agent_token_expiry(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_username(text) FROM PUBLIC, anon;

-- Tighten waitlist insert policy (was WITH CHECK (true))
DROP POLICY IF EXISTS join_waitlist ON public.waitlist;
CREATE POLICY join_waitlist ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 5 AND 320
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND (use_case IS NULL OR length(use_case) <= 2000)
  );