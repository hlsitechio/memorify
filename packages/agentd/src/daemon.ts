// src/daemon.ts — Memorify Remote daemon core (Electron-independent).
//
// Responsibilities:
//   1. Pair with the Memorify backend (device-flow: start → show code → poll).
//   2. Heartbeat + command pickup via /api/machine/poll.
//   3. Execute allowlisted commands and post results via /api/machine/result.
//
// This module has NO Electron imports so it can be unit-tested and reused by
// the future screen/input layers. The Electron main process owns the tray UI
// and calls these functions.

import { spawn } from "node:child_process";
import { checkCommand, MAX_EXEC_SECONDS } from "./allowlist.js";

export const DEFAULT_HOST = "https://memorify.dev";

export interface PairStartResponse {
  user_code: string;
  machine_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface PairPollResponse {
  status: "pending" | "approved" | "already_issued" | "denied";
  machine_token?: string;
}

export interface MachineCommand {
  id: string;
  command: string;
}

export interface PollResponse {
  interval: number;
  commands: MachineCommand[];
}

export interface ExecResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

export type DaemonStatus =
  | "unpaired"
  | "pairing"
  | "waiting_approval"
  | "connected"
  | "revoked"
  | "error";

export interface DaemonState {
  status: DaemonStatus;
  host: string;
  machineName: string;
  platform: string;
  userCode?: string;
  machineToken?: string;
  lastError?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PairingDenied extends Error {
  constructor(public reason: string) {
    super(`pairing ended: ${reason}`);
  }
}

export class MachineRevokedError extends Error {
  constructor(public reason: string) {
    super(`machine revoked: ${reason}`);
  }
}

/** POST /api/machine/pair/start — request a pairing code. */
export async function startPairing(
  host: string,
  machineName: string,
  platform: string,
): Promise<PairStartResponse> {
  const res = await fetch(`${host}/api/machine/pair/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machine_name: machineName, platform }),
  });
  if (!res.ok) {
    throw new Error(`pair/start failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PairStartResponse;
}

/** POST /api/machine/pair/poll — wait for human approval (one-time token). */
export async function pollPairing(
  host: string,
  machineCode: string,
): Promise<PairPollResponse> {
  const res = await fetch(`${host}/api/machine/pair/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machine_code: machineCode }),
  });
  if (!res.ok) {
    throw new Error(`pair/poll failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PairPollResponse;
}

/** POST /api/machine/poll — heartbeat + command pickup (Bearer machine token). */
export async function pollCommands(
  host: string,
  machineToken: string,
): Promise<PollResponse> {
  const res = await fetch(`${host}/api/machine/poll`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${machineToken}`,
    },
  });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new MachineRevokedError((body as any).error ?? "machine_revoked");
  }
  if (!res.ok) {
    throw new Error(`poll failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PollResponse;
}

/** POST /api/machine/result — report a command's outcome. */
export async function postResult(
  host: string,
  machineToken: string,
  commandId: string,
  result: ExecResult,
): Promise<boolean> {
  const res = await fetch(`${host}/api/machine/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${machineToken}`,
    },
    body: JSON.stringify({ command_id: commandId, ...result }),
  });
  if (!res.ok) return false;
  const body = await res.json().catch(() => ({}));
  return (body as any).success === true;
}

/**
 * Execute a single command on this machine.
 * Returns the result; NEVER throws for a blocked command (blocked is a
 * normal, reportable outcome). Enforces the allowlist + a hard time cap.
 */
export async function executeCommand(command: string): Promise<ExecResult> {
  const verdict = checkCommand(command);
  if (!verdict.allowed) {
    return { exit_code: null, stdout: "", stderr: "", error: verdict.reason };
  }

  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs =
    process.platform === "win32" ? ["/c", command] : ["-c", command];

  return await new Promise<ExecResult>((resolve) => {
    const child = spawn(shell, shellArgs, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGKILL");
        settled = true;
        resolve({
          exit_code: null,
          stdout,
          stderr,
          error: `command exceeded ${MAX_EXEC_SECONDS}s cap and was killed`,
        });
      }
    }, MAX_EXEC_SECONDS * 1000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > 20_000) stdout = stdout.slice(0, 20_000);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(0, 20_000);
    });
    child.on("error", (e) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        resolve({ exit_code: null, stdout, stderr, error: e.message });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        resolve({ exit_code: code, stdout, stderr, error: null });
      }
    });
  });
}

/**
 * Full pairing flow: start → (caller shows user_code) → poll until approved.
 * Returns the one-time machine token, or throws PairingDenied.
 */
export async function pairUntilApproved(
  host: string,
  machineName: string,
  platform: string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  const start = await startPairing(host, machineName, platform);
  onStatus?.(`code ${start.user_code} — open ${start.verification_uri} and approve`);

  let interval = (start.interval || 3) * 1000;
  const deadline = Date.now() + start.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    let res: PairPollResponse;
    try {
      res = await pollPairing(host, start.machine_code);
    } catch (e: any) {
      onStatus?.(`network error, retrying: ${e.message}`);
      interval = Math.min(interval * 2, 30_000);
      continue;
    }

    if (res.status === "approved" && res.machine_token) {
      return res.machine_token;
    }
    if (res.status === "pending") {
      onStatus?.("waiting for approval…");
      interval = (start.interval || 3) * 1000;
      continue;
    }
    if (res.status === "already_issued") {
      throw new PairingDenied("token already issued — re-pair required");
    }
    if (res.status === "denied") {
      throw new PairingDenied("denied by the human approver");
    }
    onStatus?.(`unexpected status: ${res.status}`);
    interval = Math.min(interval * 2, 30_000);
  }
  throw new PairingDenied("timed out");
}

