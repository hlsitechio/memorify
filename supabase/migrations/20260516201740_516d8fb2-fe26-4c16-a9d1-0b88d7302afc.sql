-- 1. Expiry / rotation columns
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_rotated_at timestamptz;

CREATE INDEX IF NOT EXISTS agents_token_expires_at_idx
  ON public.agents (token_expires_at)
  WHERE token_expires_at IS NOT NULL;

-- 2. Rotate token (returns the new token; only the owner can call)
CREATE OR REPLACE FUNCTION public.rotate_agent_token(
  _agent_id uuid,
  _expires_in_days int DEFAULT NULL  -- NULL = never expires
)
RETURNS TABLE(token text, token_expires_at timestamptz, token_rotated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token text;
  new_expiry timestamptz;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.id = _agent_id AND a.user_id = caller) THEN
    RAISE EXCEPTION 'agent not found or not owned by caller';
  END IF;

  new_token := encode(extensions.gen_random_bytes(24), 'hex');
  new_expiry := CASE
    WHEN _expires_in_days IS NULL THEN NULL
    ELSE now() + (_expires_in_days || ' days')::interval
  END;

  UPDATE public.agents
     SET token = new_token,
         token_expires_at = new_expiry,
         token_rotated_at = now(),
         updated_at = now(),
         status = 'pending'
   WHERE id = _agent_id;

  RETURN QUERY
  SELECT new_token, new_expiry, now();
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_agent_token(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.rotate_agent_token(uuid, int) TO authenticated;

-- 3. Change expiry without rotating
CREATE OR REPLACE FUNCTION public.set_agent_token_expiry(
  _agent_id uuid,
  _expires_in_days int DEFAULT NULL  -- NULL = never expires
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_expiry timestamptz;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.id = _agent_id AND a.user_id = caller) THEN
    RAISE EXCEPTION 'agent not found or not owned by caller';
  END IF;

  new_expiry := CASE
    WHEN _expires_in_days IS NULL THEN NULL
    ELSE now() + (_expires_in_days || ' days')::interval
  END;

  UPDATE public.agents
     SET token_expires_at = new_expiry,
         updated_at = now()
   WHERE id = _agent_id;

  RETURN new_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.set_agent_token_expiry(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.set_agent_token_expiry(uuid, int) TO authenticated;