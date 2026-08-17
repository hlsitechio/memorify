// backend/routes/webhooks.ts — UptimeRobot Webhook Ingestion & Resend Email Dispatcher
import { json } from "../lib/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const DEFAULT_ALERT_EMAIL = "hlarosesurprenant@gmail.com";

export async function handleUptimeRobotWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // UptimeRobot sends parameters via query params or POST body
  let alertType = url.searchParams.get("alertType") || "";
  let monitorName = url.searchParams.get("monitorFriendlyName") || url.searchParams.get("monitor_name") || "Memorify Service";
  let monitorUrl = url.searchParams.get("monitorURL") || url.searchParams.get("url") || "https://memorify.dev";
  let alertDetails = url.searchParams.get("alertDetails") || url.searchParams.get("details") || "Automated probe triggered alert";
  let alertDuration = url.searchParams.get("alertDuration") || "";

  if (req.method === "POST") {
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await req.json();
        alertType = String(body.alertType || body.alert_type || alertType);
        monitorName = body.monitorFriendlyName || body.monitor_name || monitorName;
        monitorUrl = body.monitorURL || body.url || monitorUrl;
        alertDetails = body.alertDetails || body.details || alertDetails;
        alertDuration = String(body.alertDuration || body.duration || alertDuration);
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        alertType = String(formData.get("alertType") || alertType);
        monitorName = String(formData.get("monitorFriendlyName") || monitorName);
        monitorUrl = String(formData.get("monitorURL") || monitorUrl);
        alertDetails = String(formData.get("alertDetails") || alertDetails);
        alertDuration = String(formData.get("alertDuration") || alertDuration);
      }
    } catch (_e) {
      // Ignore body parsing error and fallback to query params
    }
  }

  // alertType: 1 = Down, 2 = Up, 0 = Paused
  const isDown = alertType === "1" || alertType.toLowerCase() === "down";
  const isUp = alertType === "2" || alertType.toLowerCase() === "up";

  if (!isDown && !isUp) {
    return json({
      status: "ignored",
      message: "alertType is neither Down (1) nor Up (2)",
      received: { alertType, monitorName, monitorUrl },
    });
  }

  try {
    const resendPayload: any = {
      from: "Memorify Operations <onboarding@resend.dev>",
      to: [DEFAULT_ALERT_EMAIL],
      reply_to: "memorify-ops@agentmail.to",
    };

    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toUTCString();

    if (isDown) {
      resendPayload.subject = `🚨 [Service Alert] Outage Detected on ${monitorName}`;
      resendPayload.html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:32px 16px;background-color:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;margin:0 auto;background-color:#0b0f19;border:1px solid #ef4444;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:26px 24px;background:#111827;border-bottom:1px solid #1e293b;text-align:center;">
        <span style="display:inline-block;padding:5px 12px;border-radius:9999px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:#fca5a5;font-size:11px;font-weight:700;text-transform:uppercase;">
          🚨 SERVICE OUTAGE DETECTED
        </span>
        <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;">${monitorName} is Down</h1>
        <p style="color:#94a3b8;font-size:12px;margin:0;">Incident Ref: <code style="color:#f87171;">${incidentId}</code></p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;color:#e2e8f0;font-size:13px;line-height:1.6;">
        <p style="margin-top:0;">Automated telemetry detected an outage on <strong>${monitorName}</strong>.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#111827;border:1px solid #1f2937;border-radius:8px;margin:16px 0;">
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Endpoint:</td><td style="padding:10px 14px;color:#38bdf8;font-family:monospace;font-size:11px;">${monitorUrl}</td></tr>
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Detected At:</td><td style="padding:10px 14px;color:#fff;font-size:12px;">${timestamp}</td></tr>
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Status:</td><td style="padding:10px 14px;color:#f87171;font-weight:700;font-size:12px;">Major Outage</td></tr>
        </table>
        <div style="background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;padding:12px;border-radius:4px;margin:16px 0;color:#fca5a5;font-size:12px;">
          <strong>Diagnostics:</strong> ${alertDetails}
        </div>
        <div style="text-align:center;margin-top:24px;">
          <a href="https://memorify.dev/dashboard/settings/status" style="background:#ef4444;color:#fff;font-weight:700;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;">
            View Live Telemetry →
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
      resendPayload.text = `[SERVICE OUTAGE DETECTED]\n${monitorName} is Down\nEndpoint: ${monitorUrl}\nDetected: ${timestamp}\nDetails: ${alertDetails}\n\nLive status: https://memorify.dev/dashboard/settings/status`;
    } else {
      resendPayload.subject = `🟢 [Service Resolved] ${monitorName} is Fully Operational`;
      resendPayload.html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:32px 16px;background-color:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;margin:0 auto;background-color:#0b0f19;border:1px solid #10b981;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:26px 24px;background:#111827;border-bottom:1px solid #1e293b;text-align:center;">
        <span style="display:inline-block;padding:5px 12px;border-radius:9999px;background:rgba(16,185,129,0.2);border:1px solid #10b981;color:#6ee7b7;font-size:11px;font-weight:700;text-transform:uppercase;">
          🟢 ALL SYSTEMS OPERATIONAL
        </span>
        <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;">${monitorName} has Recovered</h1>
        <p style="color:#94a3b8;font-size:12px;margin:0;">Incident Resolved: <code style="color:#34d399;">${incidentId}</code></p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;color:#e2e8f0;font-size:13px;line-height:1.6;">
        <p style="margin-top:0;">Verification probes confirm that <strong>${monitorName}</strong> has recovered and is fully operational.</p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#111827;border:1px solid #1f2937;border-radius:8px;margin:16px 0;">
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Endpoint:</td><td style="padding:10px 14px;color:#38bdf8;font-family:monospace;font-size:11px;">${monitorUrl}</td></tr>
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Resolved At:</td><td style="padding:10px 14px;color:#fff;font-size:12px;">${timestamp}</td></tr>
          <tr><td style="padding:10px 14px;color:#94a3b8;font-size:12px;">Duration:</td><td style="padding:10px 14px;color:#fff;font-size:12px;">${alertDuration || "Under 5 minutes"}</td></tr>
        </table>
        <div style="text-align:center;margin-top:24px;">
          <a href="https://memorify.dev/dashboard/settings/status" style="background:#10b981;color:#030712;font-weight:700;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;">
            View Live Telemetry →
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
      resendPayload.text = `[ALL SYSTEMS OPERATIONAL]\n${monitorName} has Recovered\nEndpoint: ${monitorUrl}\nResolved: ${timestamp}\n\nLive status: https://memorify.dev/dashboard/settings/status`;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    return json({
      stat: "ok",
      event: isDown ? "downtime_alert_dispatched" : "recovery_alert_dispatched",
      monitor: monitorName,
      recipient: DEFAULT_ALERT_EMAIL,
      resend: resendData,
    });
  } catch (err: any) {
    return json(
      {
        error: "webhook_dispatch_failed",
        message: err?.message ?? String(err),
      },
      500
    );
  }
}
