REVOKE EXECUTE ON FUNCTION public.agent_ping(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agent_ping(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.agent_ping(text, jsonb) FROM authenticated;