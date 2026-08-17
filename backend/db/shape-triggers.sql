-- Shape Invalidation Triggers for Memorify
-- Run: psql "$NEON_DATABASE_URL" -f backend/db/shape-triggers.sql
-- These triggers fire pg_notify on INSERT/UPDATE/DELETE for real-time shape sync

-- ── Invalidation notification function ─────────────────────────────
CREATE OR REPLACE FUNCTION notify_shape_invalidation()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Skip notification for certain tables if needed
  -- (e.g., don't notify for internal audit tables)
  
  PERFORM pg_notify(
    'shape_invalidations',
    json_build_object(
      'table', TG_TABLE_NAME,
      'workspace_id', COALESCE(NEW.workspace_id, OLD.workspace_id),
      'op', TG_OP,
      'id', COALESCE(NEW.id, OLD.id),
      'ts', extract(epoch from now())::bigint
    )::text
  );
  RETURN NULL;
END $$;

-- ── Attach triggers to shape-enabled tables ────────────────────────

-- Memories (core knowledge)
DROP TRIGGER IF EXISTS trg_memories_shape_invalidate ON memories;
CREATE TRIGGER trg_memories_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON memories
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Documents (RAG sources)
DROP TRIGGER IF EXISTS trg_documents_shape_invalidate ON documents;
CREATE TRIGGER trg_documents_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Document chunks (vector search)
DROP TRIGGER IF EXISTS trg_document_chunks_shape_invalidate ON document_chunks;
CREATE TRIGGER trg_document_chunks_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Agents (connected agents status)
DROP TRIGGER IF EXISTS trg_agents_shape_invalidate ON agents;
CREATE TRIGGER trg_agents_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON agents
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Skills (copilot skills)
DROP TRIGGER IF EXISTS trg_skills_shape_invalidate ON skills;
CREATE TRIGGER trg_skills_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Events (activity log)
DROP TRIGGER IF EXISTS trg_events_shape_invalidate ON events;
CREATE TRIGGER trg_events_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- MCP servers (connected tools)
DROP TRIGGER IF EXISTS trg_mcp_servers_shape_invalidate ON mcp_servers;
CREATE TRIGGER trg_mcp_servers_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Config (workspace settings)
DROP TRIGGER IF EXISTS trg_config_shape_invalidate ON config;
CREATE TRIGGER trg_config_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON config
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Collections (database tab)
DROP TRIGGER IF EXISTS trg_collections_shape_invalidate ON collections;
CREATE TRIGGER trg_collections_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON collections
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- Collection items
DROP TRIGGER IF EXISTS trg_collection_items_shape_invalidate ON collection_items;
CREATE TRIGGER trg_collection_items_shape_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON collection_items
  FOR EACH ROW EXECUTE FUNCTION notify_shape_invalidation();

-- ── Helper: function to manually trigger invalidation (for bulk ops) ──
CREATE OR REPLACE FUNCTION invalidate_shape(
  p_table text,
  p_workspace_id text,
  p_op text DEFAULT 'UPDATE',
  p_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_notify(
    'shape_invalidations',
    json_build_object(
      'table', p_table,
      'workspace_id', p_workspace_id,
      'op', p_op,
      'id', p_id,
      'ts', extract(epoch from now())::bigint
    )::text
  );
END $$;

-- ── View: shape-enabled tables (for debugging) ────────────────────
CREATE OR REPLACE VIEW shape_enabled_tables AS
SELECT 
  t.table_name,
  obj_description(c.oid) as table_comment
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'memories', 'documents', 'document_chunks', 'agents', 
    'skills', 'events', 'mcp_servers', 'config',
    'collections', 'collection_items'
  )
ORDER BY t.table_name;

COMMENT ON FUNCTION notify_shape_invalidation() IS 
'Trigger function that fires pg_notify on shape_invalidations channel for real-time sync';