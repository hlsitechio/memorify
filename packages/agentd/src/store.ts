// src/store.ts — persist the machine token + identity across restarts.
//
// A daemon must survive restarts without re-pairing (re-pairing burns the
// server's rate limit and requires a new human approval every time). We store
// the machine token in ~/.memorify/agentd.json (chmod 600 where supported),
// matching the CLI's ~/.memorify/credentials.json convention.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const home = () => os.homedir();
const file = () => path.join(home(), ".memorify", "agentd.json");

export interface AgentdState {
  machineToken?: string;
  machineName?: string;
  pairedAt?: string;
}

export async function loadState(): Promise<AgentdState> {
  try {
    const raw = await fs.readFile(file(), "utf8");
    return JSON.parse(raw) as AgentdState;
  } catch {
    return {};
  }
}

export async function saveState(state: AgentdState): Promise<void> {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(state, null, 2), "utf8");
  try {
    await fs.chmod(file(), 0o600);
  } catch {
    /* Windows / unsupported FS */
  }
}

export async function clearState(): Promise<void> {
  try {
    await fs.unlink(file());
  } catch {
    /* nothing to clear */
  }
}
