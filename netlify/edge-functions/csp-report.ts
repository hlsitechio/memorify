/**
 * CSP Violation Reporter — Netlify Edge Function
 * Receives CSP violation reports and forwards to Neon for logging/analysis
 */

import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.4";

interface CSPViolationReport {
  "csp-report": {
    "document-uri": string;
    "referrer": string;
    "violated-directive": string;
    "effective-directive": string;
    "original-policy": string;
    "disposition": "enforce" | "report";
    "blocked-uri": string;
    "line-number": number;
    "column-number": number;
    "source-file": string;
    "status-code": number;
    "script-sample": string;
  };
}

export default async (request: Request): Promise<Response> => {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Verify content type
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json") && !contentType.includes("application/csp-report")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  try {
    const body = await request.json() as CSPViolationReport;

    // Extract violation details
    const violation = body["csp-report"];
    if (!violation) {
      return new Response("Invalid CSP report format", { status: 400 });
    }

    // Prepare log entry
    const logEntry = {
      type: "csp_violation",
      timestamp: new Date().toISOString(),
      documentUri: violation["document-uri"],
      referrer: violation["referrer"],
      violatedDirective: violation["violated-directive"],
      effectiveDirective: violation["effective-directive"],
      originalPolicy: violation["original-policy"],
      disposition: violation["disposition"],
      blockedUri: violation["blocked-uri"],
      lineNumber: violation["line-number"],
      columnNumber: violation["column-number"],
      sourceFile: violation["source-file"],
      statusCode: violation["status-code"],
      scriptSample: violation["script-sample"],
      userAgent: request.headers.get("user-agent"),
      clientIp: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
    };

    // Forward to Neon if DATABASE_URL is available
    const databaseUrl = Deno.env.get("NEON_DATABASE_URL") || Deno.env.get("DATABASE_URL");
    if (databaseUrl) {
      try {
        const sql = neon(databaseUrl.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, ""));
        await sql`
          INSERT INTO security_logs (event_type, payload, severity, created_at)
          VALUES ('csp_violation', ${JSON.stringify(logEntry)}::jsonb, 'warning', NOW())
        `;
      } catch (dbError) {
        console.error("Failed to write CSP violation to Neon:", dbError);
        // Don't fail the request — CSP reports must return 204
      }
    } else {
      console.log("CSP Violation (no DB):", JSON.stringify(logEntry, null, 2));
    }

    // CSP reports must return 204 No Content
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("CSP report handler error:", error);
    return new Response(null, { status: 204 }); // Still return 204 per spec
  }
};

export const config = {
  path: "/api/csp-report",
};