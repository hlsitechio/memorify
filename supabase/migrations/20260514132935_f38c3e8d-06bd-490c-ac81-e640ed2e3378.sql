ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vault_password_hash text,
  ADD COLUMN IF NOT EXISTS vault_password_salt text;