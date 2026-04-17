#!/usr/bin/env node
// SessionEnd hook entry — kill server pid and remove session dir.

import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitHookJson, sessionDirFor } from "./lib/hook-core.mjs";

const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function emit() {
  process.stdout.write(emitHookJson("SessionEnd", ""));
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit();

  const dir = sessionDirFor(ROOT, sessionId);
  if (!existsSync(dir)) return emit();

  // Kill pid if any
  try {
    const pid = Number(await readFile(path.join(dir, "server.pid"), "utf-8"));
    if (pid > 0) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  } catch {}

  await rm(dir, { recursive: true, force: true });
  emit();
}

main().catch(() => emit());
