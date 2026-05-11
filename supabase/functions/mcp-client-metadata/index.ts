// Public Client ID Metadata Document for Synapse MCP client.
// Lovable (and any OAuth server supporting client_id_metadata_document) accepts
// the URL of this document AS the client_id — no Dynamic Client Registration needed.
// Spec: draft-ietf-oauth-client-id-metadata-document
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((req) => {
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const redirectUri = `${origin}/functions/v1/mcp-oauth-callback`;
  const selfUrl = `${origin}/functions/v1/mcp-client-metadata`;

  const doc = {
    client_id: selfUrl,
    client_name: "Synapse",
    client_uri: "https://synapse.lovable.app",
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    scope: "offline openid email profile projects:create projects:read projects:write workspaces:read workspaces:write",
  };

  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
