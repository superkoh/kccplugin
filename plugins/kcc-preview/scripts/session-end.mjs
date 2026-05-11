#!/usr/bin/env node
// SessionEnd hook entry — rm the session dir. No pid kill: the daemon
// is shared and its lifecycle is managed by leader-election + idle-reaper.

import { rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { emitSessionEnd, sessionDirFor } from "./lib/hook-core.mjs";

const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function emit() {
  process.stdout.write(emitSessionEnd());
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit();
  await rm(sessionDirFor(ROOT, sessionId), { recursive: true, force: true });
  emit();
}

main().catch(() => emit());
