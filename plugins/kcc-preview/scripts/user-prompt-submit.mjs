#!/usr/bin/env node
// UserPromptSubmit hook entry.
// - Reads URL pointer; on health miss, re-runs claimLeaderOrConnect by
//   spawning a fresh daemon (no peer is leader → we try to be).
// - Emits the reminder block (URL only).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildReminderContext, emitUserPromptSubmit, sessionDirFor,
  pingHealth,
} from "./lib/hook-core.mjs";
import { readUrlPointer } from "./lib/url-pointer.mjs";
import { tryBindFirstFreePort, resolvePortRange } from "./lib/leader-election.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_ENTRY = path.join(__dirname, "daemon.mjs");
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function portOf(url) { return Number(url?.match(/:(\d+)$/)?.[1] || 0); }

function emit(ctx) {
  process.stdout.write(emitUserPromptSubmit(ctx));
  process.exit(0);
}

async function reElect() {
  let bound;
  try { bound = await tryBindFirstFreePort(resolvePortRange()); }
  catch { return null; }
  const port = bound.port;
  await bound.release();
  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, KCC_PREVIEW_PORT: String(port) },
  });
  child.unref();
  // Wait briefly for daemon to write the pointer and answer /health
  const start = Date.now();
  while (Date.now() - start < 2500) {
    const u = await readUrlPointer();
    if (u && portOf(u) === port && await pingHealth(port, 200)) return u;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit("");

  const dir = sessionDirFor(ROOT, sessionId);
  if (!existsSync(dir)) return emit("");

  let url = await readUrlPointer();
  let port = portOf(url);
  let alive = port && await pingHealth(port);

  if (!alive) {
    url = await reElect();
    alive = !!url;
  }
  if (!alive) return emit(`<!-- kcc-preview: unavailable (server not responding) -->`);

  emit(await buildReminderContext({ url }));
}

main().catch(() => emit(""));
