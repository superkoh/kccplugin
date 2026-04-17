#!/usr/bin/env node
// SessionStart hook entry.
// - Reads Claude Code JSON envelope from stdin
// - Sweeps stale kcc-preview session dirs
// - Creates a session dir under KCC_PREVIEW_ROOT (defaults to $TMPDIR/kcc-preview)
// - Spawns the detached server and waits for server.port to appear
// - Emits hookSpecificOutput.additionalContext with the rules block

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, emitHookJson,
} from "./lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");
const SERVER_ENTRY = path.join(__dirname, "server.mjs");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

// Existence of server.port is intentionally the only "live" signal — no
// extra GET /health probe here. SessionStart sits on the session-start
// critical path, so an extra round-trip would add latency on every session;
// UserPromptSubmit's per-turn /health ping is the backstop that catches a
// server that crashed between writing port and the first user turn.
function waitForFile(file, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (existsSync(file)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

function emitAndExit(ctx) {
  process.stdout.write(emitHookJson("SessionStart", ctx));
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) {
    return emitAndExit(await buildSessionStartContext({ url: null, reason: "missing session_id" }));
  }

  await mkdir(ROOT, { recursive: true });
  await sweepStale(ROOT, new Set([sessionId]));

  const sessionDir = sessionDirFor(ROOT, sessionId);
  const contentDir = path.join(sessionDir, "content");
  const stateDir = path.join(sessionDir, "state");
  await mkdir(contentDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, SESSION_ID: sessionId, SESSION_DIR: sessionDir },
  });
  child.unref();

  try {
    await waitForFile(path.join(sessionDir, "server.port"));
  } catch {
    return emitAndExit(await buildSessionStartContext({ url: null, reason: "server did not start" }));
  }

  const port = Number(await readFile(path.join(sessionDir, "server.port"), "utf-8"));
  const url = `http://localhost:${port}`;
  const ctx = await buildSessionStartContext({ url, contentDir, vcStateDir: stateDir });
  emitAndExit(ctx);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.stdout.write(emitHookJson("SessionStart", `<!-- kcc-preview: unavailable (${err?.message || "error"}) -->`));
  process.exit(0);
});
