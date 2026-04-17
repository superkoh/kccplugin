#!/usr/bin/env node
// UserPromptSubmit hook entry.
// - Reads session_id from stdin
// - Finds session dir under KCC_PREVIEW_ROOT; if absent, emits empty context
// - Pings /health with 300ms timeout
// - On success, emits the reminder block
// - On failure, tries to respawn the detached server once; on that failure,
//   emits an "unavailable" marker so Claude stops trying this session.

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildReminderContext, emitUserPromptSubmit, sessionDirFor } from "./lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "server.mjs");
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function pingHealth(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function emit(ctx) {
  process.stdout.write(emitUserPromptSubmit(ctx));
  process.exit(0);
}

async function respawnServer(sessionDir, sessionId) {
  // Capture the existing port file's mtime BEFORE spawning so we can
  // distinguish "old port file from the dead server still on disk" from
  // "new port file written by the fresh server we just spawned." Without
  // this baseline we'd happily ping the dead port forever.
  const portFile = path.join(sessionDir, "server.port");
  let baselineMtime = 0;
  try { baselineMtime = (await stat(portFile)).mtimeMs; } catch {}

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, SESSION_ID: sessionId, SESSION_DIR: sessionDir },
  });
  child.unref();

  return new Promise((resolve) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const s = await stat(portFile);
        if (s.mtimeMs > baselineMtime) {
          const p = Number(await readFile(portFile, "utf-8"));
          if (p > 0 && await pingHealth(p, 200)) return resolve(p);
        }
      } catch {}
      if (Date.now() - start > 2500) return resolve(0);
      setTimeout(tick, 40);
    };
    tick();
  });
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit("");

  const dir = sessionDirFor(ROOT, sessionId);
  const portFile = path.join(dir, "server.port");
  if (!existsSync(portFile)) return emit("");

  let port = Number(await readFile(portFile, "utf-8"));
  let alive = await pingHealth(port);

  if (!alive) {
    const newPort = await respawnServer(dir, sessionId);
    if (newPort > 0) {
      port = newPort;
      alive = true;
    }
  }

  if (!alive) return emit(`<!-- kcc-preview: unavailable (server not responding) -->`);

  const url = `http://localhost:${port}`;
  const ctx = await buildReminderContext({ url });
  emit(ctx);
}

main().catch(() => emit(""));
