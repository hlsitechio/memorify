-- Lock down internal SECURITY DEFINER functions that should never be called via the Data API.
-- Triggers + internal helpers: revoke EXECUTE from anon/authenticated/PUBLIC.
-- They will continue to work because triggers run as table owner and helpers are called from other SECURITY DEFINER functions.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_memory_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_collection_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_memory_mem_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.memory_slug_for(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.workspace_code_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_username(text) FROM PUBLIC, anon, authenticated;

-- agent_ping is the only definer function intentionally callable by anon (token-protected).
-- Ensure anon EXECUTE remains explicit and remove authenticated (agents authenticate via token, not JWT).
REVOKE EXECUTE ON FUNCTION public.agent_ping(text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_ping(text, jsonb) TO anon;

-- User-callable RPCs: restrict to authenticated only (already check auth.uid() internally).
REVOKE EXECUTE ON FUNCTION public.claim_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_username(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rotate_agent_token(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_agent_token(uuid, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_agent_token_expiry(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_token_expiry(uuid, integer) TO authenticated;

-- resolve_workspace_handle: needs anon for sign-in flow (lookup email by handle).
REVOKE EXECUTE ON FUNCTION public.resolve_workspace_handle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_workspace_handle(text) TO anon, authenticated;