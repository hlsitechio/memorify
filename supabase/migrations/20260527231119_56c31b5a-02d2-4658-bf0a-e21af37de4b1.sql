-- Explicit deny SELECT on waitlist (PII protection). RLS already implicitly
-- denies, but making it explicit prevents accidental future policy mistakes.
CREATE POLICY "waitlist_no_select" ON public.waitlist
  FOR SELECT TO anon, authenticated
  USING (false);