// Self-hosted backend (memorify.dev VPS).
// Intentionally hardcoded — do NOT switch back to import.meta.env.VITE_SUPABASE_*,
// those point at the original Lovable Cloud project.
// All backend rules live in BACKEND.md. Service role key never ships to the client.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://api.memorify.dev';
const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc4Njg4MDMxLCJleHAiOjE5MzYzNjgwMzF9.SLhXSoO26PcgADVeIVPWy5_5jpLqsxHzyXsk-_O-YC4';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
