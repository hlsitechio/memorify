
-- 1. Realtime channel authorization: deny by default on realtime.messages
-- so users can't subscribe to broadcast/presence topics outside their scope.
-- (postgres_changes still respect per-table RLS, which is already in place.)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_receive_own" ON realtime.messages;
CREATE POLICY "authenticated_can_receive_own"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "authenticated_can_send_own" ON realtime.messages;
CREATE POLICY "authenticated_can_send_own"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2. agent_calls: explicitly deny UPDATE and DELETE (immutable audit log)
DROP POLICY IF EXISTS agent_calls_no_update ON public.agent_calls;
CREATE POLICY agent_calls_no_update
  ON public.agent_calls
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS agent_calls_no_delete ON public.agent_calls;
CREATE POLICY agent_calls_no_delete
  ON public.agent_calls
  FOR DELETE
  USING (false);

-- 3. mcp_oauth_states: contains client_secret + code_verifier.
-- Only the edge function (service role) needs to read these.
-- Users only need INSERT (start flow) and DELETE (cancel).
DROP POLICY IF EXISTS mcp_oauth_states_own ON public.mcp_oauth_states;

CREATE POLICY mcp_oauth_states_no_client_select
  ON public.mcp_oauth_states
  FOR SELECT
  USING (false);

CREATE POLICY mcp_oauth_states_insert_own
  ON public.mcp_oauth_states
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY mcp_oauth_states_delete_own
  ON public.mcp_oauth_states
  FOR DELETE
  USING (auth.uid() = user_id);
