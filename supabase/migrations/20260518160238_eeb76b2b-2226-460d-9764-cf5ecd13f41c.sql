-- 1) Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS workspace_code text;

-- Lowercase enforcement + format check (citext alternative)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uniq
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_workspace_code_uniq
  ON public.profiles (workspace_code)
  WHERE workspace_code IS NOT NULL;

-- 2) Helper: sanitize a candidate handle
CREATE OR REPLACE FUNCTION public.sanitize_username(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  s := lower(_raw);
  s := regexp_replace(s, '[^a-z0-9_]+', '_', 'g');
  s := regexp_replace(s, '_+', '_', 'g');
  s := trim(both '_' from s);
  IF s = '' THEN s := 'user'; END IF;
  IF length(s) > 24 THEN s := substring(s from 1 for 24); END IF;
  IF length(s) < 3 THEN s := s || repeat('0', 3 - length(s)); END IF;
  RETURN s;
END;
$$;

-- 3) Helper: derive a deterministic short workspace code from a uuid
CREATE OR REPLACE FUNCTION public.workspace_code_for(_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT 'ws_' || substring(encode(extensions.digest(_user_id::text, 'sha256'), 'hex') from 1 for 12);
$$;

-- 4) Update handle_new_user trigger to populate username + workspace_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  suffix int := 0;
BEGIN
  -- Decide username: explicit meta > email local-part > 'user'
  base := public.sanitize_username(
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1)
    )
  );
  candidate := base;

  -- Avoid collisions
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(candidate)) LOOP
    suffix := suffix + 1;
    candidate := substring(base from 1 for 20) || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (user_id, display_name, avatar_url, username, workspace_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    candidate,
    public.workspace_code_for(NEW.id)
  );
  RETURN NEW;
END;
$$;

-- 5) Backfill existing profiles
DO $$
DECLARE
  r record;
  base text;
  candidate text;
  suffix int;
  user_email text;
BEGIN
  FOR r IN SELECT p.id, p.user_id FROM public.profiles p WHERE p.username IS NULL LOOP
    SELECT email INTO user_email FROM auth.users WHERE id = r.user_id;
    base := public.sanitize_username(COALESCE(split_part(user_email, '@', 1), 'user'));
    candidate := base;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(candidate)) LOOP
      suffix := suffix + 1;
      candidate := substring(base from 1 for 20) || suffix::text;
    END LOOP;
    UPDATE public.profiles
       SET username = candidate,
           workspace_code = COALESCE(workspace_code, public.workspace_code_for(r.user_id))
     WHERE id = r.id;
  END LOOP;

  UPDATE public.profiles
     SET workspace_code = public.workspace_code_for(user_id)
   WHERE workspace_code IS NULL;
END $$;

-- 6) Claim/change username (authenticated user, own profile only)
CREATE OR REPLACE FUNCTION public.claim_username(_handle text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  clean  text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  clean := public.sanitize_username(_handle);
  IF length(clean) < 3 OR length(clean) > 24 THEN
    RAISE EXCEPTION 'username must be 3-24 chars';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE lower(username) = lower(clean) AND user_id <> caller
  ) THEN
    RAISE EXCEPTION 'username already taken';
  END IF;
  UPDATE public.profiles SET username = clean, updated_at = now() WHERE user_id = caller;
  RETURN clean;
END;
$$;

-- 7) Public resolver: handle -> { email, workspace_code, display_name }
-- Used by /ws/:username route to pre-fill the sign-in form.
CREATE OR REPLACE FUNCTION public.resolve_workspace_handle(_handle text)
RETURNS TABLE(email text, workspace_code text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  clean text;
  uid uuid;
BEGIN
  clean := lower(COALESCE(_handle, ''));
  IF clean = '' THEN RETURN; END IF;

  SELECT p.user_id, p.workspace_code, p.display_name
    INTO uid, workspace_code, display_name
    FROM public.profiles p
   WHERE lower(p.username) = clean
   LIMIT 1;

  IF uid IS NULL THEN RETURN; END IF;

  SELECT u.email INTO email FROM auth.users u WHERE u.id = uid;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_workspace_handle(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_username(text) TO authenticated;