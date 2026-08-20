#!/usr/bin/env node
// src/index.ts — `memorify` CLI: universal MCP onboarding for any AI client.
//
//   memorify pair                    detect clients, pair, write configs
//   memorify pair --client cursor    write config for one specific client
//   memorify pair --print            print token to stdout instead of configs
//   memorify mcp                     stdio⇄HTTP bridge (for Claude Desktop)
//   memorify whoami                  verify a stored/printed token

import { spawn } from "node:child_process";
import { DEFAULT_HOST, startPairing, pollUntilApproved, cancelPairing, PairingDenied } from "./pair.js";
import { CLIENTS, getClient, saveCredentials, loadToken, type ClientTarget } from "./clients.js";
import { runBridge } from "./bridge.js";

const log = (m = "") => process.stderr.write(m + "\n"); // keep stdout clean for --print

interface Args {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const flag = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, flag, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* user can open manually */
  }
}


async function cmdPair(args: Args): Promise<void> {
  const host = (args.host as string) || DEFAULT_HOST;
  const name = (args.name as string) || "memorify-cli";
  const printOnly = args.print === true;
  const clientIds = args.client ? String(args.client).split(",") : null;

  // Resolve which clients to configure before starting the flow.
  let targets: ClientTarget[] = [];
  if (!printOnly) {
    if (clientIds) {
      targets = clientIds.map((id) => getClient(id.trim()));
    } else {
      log("Detecting installed MCP clients…");
      const detected: ClientTarget[] = [];
      for (const c of CLIENTS) {
        if (await c.detect()) {
          detected.push(c);
          log(`  + ${c.label}`);
        }
      }
      if (detected.length === 0) {
        log("  (none detected — pass --client <id> explicitly; see `memorify clients`)");
        log("  falling back to project .mcp.json (Claude Code / Cline / Roo Code format)");
        detected.push(getClient("claude-code"));
      }
      if (detected.length > 1) {
        log(`Multiple clients detected — configuring all ${detected.length}.`);
      }
      targets = detected;
    }
  }

  log(`\nRequesting pairing code from ${host}…`);
  const start = await startPairing(host, name, "cli");
  log("");
  log("  +-----------------------------------------+");
  log(`  |  Your code:  ${start.user_code.padEnd(28)}|`);
  log("  +-----------------------------------------+");
  log(`  Open ${start.verification_uri} and approve the agent.\n`);
  if (args["no-open"] !== true) openBrowser(start.verification_uri);

  let token: string;
  let mcpUrl: string;
  try {
    const result = await pollUntilApproved(host, start.device_code, start, (m) => log(`  ... ${m}`));
    token = result.access_token;
    mcpUrl = result.mcp_url;
  } catch (e) {
    if (e instanceof PairingDenied) {
      await cancelPairing(host, start.device_code);
      log(`\n[FAIL] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  log("\nPaired! Token received.");
  const credFile = await saveCredentials(token);
  log(`  - Token saved to ${credFile}`);

  if (printOnly) {
    process.stdout.write(token + "\n");
    return;
  }

  for (const t of targets) {
    const file = await t.write(token, mcpUrl);
    const mode = t.stdioOnly ? "stdio bridge" : "native HTTP";
    log(`  - Configured ${t.label} [${mode}] -> ${file}`);
  }
  log(`\nDone. Restart your client and the "memorify" MCP server will be available.`);
  log("(Keep your token secret — revoke anytime at memorify.dev/dashboard/agents)");
}

async function cmdMcp(args: Args): Promise<void> {
  const url = (args.url as string) || `${(args.host as string) || DEFAULT_HOST}/mcp`;
  const token = (args.token as string) || process.env.MEMORIFY_TOKEN || (await loadToken());
  if (!token) {
    log("No token. Run `memorify pair` first, or set MEMORIFY_TOKEN / pass --token.");
    process.exit(1);
  }
  runBridge(url, token);
}

async function cmdWhoami(args: Args): Promise<void> {
  const host = (args.host as string) || DEFAULT_HOST;
  const token = (args.token as string) || process.env.MEMORIFY_TOKEN || (await loadToken());
  if (!token) {
    log("No token. Run `memorify pair` first.");
    process.exit(1);
  }
  const res = await fetch(`${host}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }),
  });
  const text = await res.text();
  if (!res.ok) {
    log(`[FAIL] ${res.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }
  log(text);
}

function cmdClients(): void {
  log("Supported MCP clients:");
  for (const c of CLIENTS) {
    log(`  ${c.id.padEnd(16)} ${c.label}${c.stdioOnly ? "  [stdio bridge — handled automatically]" : ""}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  try {
    if (cmd === "pair") await cmdPair(args);
    else if (cmd === "mcp") await cmdMcp(args);
    else if (cmd === "whoami") await cmdWhoami(args);
    else if (cmd === "clients") cmdClients();
    else {
      log("memorify — universal MCP onboarding (v0.1.0)");
      log("");
      log("  memorify pair [--client <id|id,id>] [--print] [--name <n>] [--host <url>] [--no-open]");
      log("      Run the device-flow pairing and write MCP config for detected clients.");
      log("  memorify mcp [--url <u>] [--token <t>]");
      log("      stdio<->HTTP bridge — lets stdio-only clients (Claude Desktop) connect.");
      log("  memorify whoami");
      log("      Verify the current token against the live server.");
      log("  memorify clients");
      log("      List supported clients.");
    }
  } catch (e: any) {
    log(`[FAIL] ${e.message}`);
    process.exit(1);
  }
}

main();
