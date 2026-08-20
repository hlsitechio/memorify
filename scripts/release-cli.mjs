#!/usr/bin/env node
// scripts/release-cli.mjs — runs AFTER vite build (dist/ already exists).
// Repacks packages/cli from source and injects the fresh tarball + SHA-256
// into dist/, so memorify.dev/cli/memorify.tgz can never go stale.
//
// Fail-safe: if anything fails (no network, npm error…), we keep the
// committed fallback tarball that vite already copied from public/cli/.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const cliDir = join(root, "packages", "cli");
const distCli = join(root, "dist", "cli");
const distTarball = join(distCli, "memorify.tgz");
const distLlms = join(root, "dist", "llms.txt");

const log = (m) => console.log(`[release-cli] ${m}`);

try {
  log("installing + building packages/cli…");
  execSync("npm install --no-audit --no-fund", { cwd: cliDir, stdio: "pipe" });
  execSync("npm run build", { cwd: cliDir, stdio: "pipe" });
  execSync("npm pack --json", { cwd: cliDir, stdio: "pipe" });

  // find the freshly packed tgz (name may change with version bumps)
  const tgz = readdirSync(cliDir).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("npm pack produced no tarball");
  const packed = join(cliDir, tgz);

  const hash = createHash("sha256").update(readFileSync(packed)).digest("hex");
  copyFileSync(packed, distTarball);
  // don't leave the tgz lying around to be accidentally committed
  try { unlinkSync(packed); } catch { /* best effort */ }
  log(`tarball deployed → dist/cli/memorify.tgz (${readFileSync(distTarball).length} bytes)`);

  // Patch the pinned hash in the BUILT llms.txt (source stays untouched)
  if (existsSync(distLlms)) {
    let llms = readFileSync(distLlms, "utf8");
    const before = llms;
    llms = llms.replace(/SHA-256 `[a-f0-9]{64}`/, `SHA-256 \`${hash}\``);
    if (llms !== before) {
      writeFileSync(distLlms, llms);
      log(`llms.txt hash pinned → ${hash.slice(0, 16)}…`);
    } else {
      // hash line missing (llms.txt reworded?) — fail loudly, not silently
      throw new Error("could not find SHA-256 pin line in dist/llms.txt to update");
    }
  }
  console.log(`[release-cli] OK — sha256:${hash}`);
} catch (e) {
  if (existsSync(distTarball)) {
    console.warn(`[release-cli] FAILED (${e.message}) — serving committed fallback tarball from public/cli/`);
    process.exit(0); // fallback is already in dist via vite public copy
  }
  console.error(`[release-cli] FAILED and no fallback present: ${e.message}`);
  process.exit(1);
}
