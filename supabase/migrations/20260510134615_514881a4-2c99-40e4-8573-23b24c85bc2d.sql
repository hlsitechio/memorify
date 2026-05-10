-- MCP servers
CREATE TABLE public.mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  transport text NOT NULL DEFAULT 'http',
  auth jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_handshake_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_servers_all_own ON public.mcp_servers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER mcp_servers_set_updated_at BEFORE UPDATE ON public.mcp_servers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MCP tools
CREATE TABLE public.mcp_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcp_server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mcp_server_id, name)
);
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_tools_all_own ON public.mcp_tools FOR ALL
  USING (EXISTS (SELECT 1 FROM public.mcp_servers s WHERE s.id = mcp_server_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mcp_servers s WHERE s.id = mcp_server_id AND s.user_id = auth.uid()));

-- Skills
CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  prompt text NOT NULL DEFAULT '',
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY skills_all_own ON public.skills FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER skills_set_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Plugins
CREATE TABLE public.plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  ref_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;
CREATE POLICY plugins_all_own ON public.plugins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER plugins_set_updated_at BEFORE UPDATE ON public.plugins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();