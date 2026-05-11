#!/usr/bin/env node
// SessionStart hook entry.
// - Reads Claude Code session_id from stdin
// - mkdir $TMPDIR/kcc-preview/<sid>/{content,state}
// - Writes cc.pid (= process.ppid) — used by sweepStale to prove liveness
// - Runs sweepStale (ignores self via activeIds)
// - claimLeaderOrConnect: read pointer; if absent or stale, try-bind the
//   range; if we win, spawn detached daemon with KCC_PREVIEW_PORT set
// - Emits hookSpecificOutput.additionalContext with the rules block

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  sessionDirFor, sweepStale, writeCcPid, pingHealth,
  buildSessionStartContext, emitSessionStart,
} from "./lib/hook-core.mjs";
import { readUrlPointer } from "./lib/url-pointer.mjs";
import { tryBindFirstFreePort, resolvePortRange } from "./lib/leader-election.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");
const DAEMON_ENTRY = path.join(__dirname, "daemon.mjs");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function waitForPointerHealth(timeoutMs = 2500) {
  return new Promise(async (resolve) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const url = await readUrlPointer();
      if (url) {
        const port = Number(url.match(/:(\d+)$/)?.[1]);
        if (port && await pingHealth(port, 200)) return resolve(url);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    resolve(null);
  });
}

async function claimLeaderOrConnect() {
  const existing = await readUrlPointer();
  if (existing) {
    const port = Number(existing.match(/:(\d+)$/)?.[1]);
    if (port && await pingHealth(port, 200)) return existing;
  }

  let bound;
  try {
    bound = await tryBindFirstFreePort(resolvePortRange());
  } catch (err) {
    return null;  // range exhausted
  }
  const port = bound.port;
  await bound.release();  // free immediately so the daemon can re-bind it

  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, KCC_PREVIEW_PORT: String(port) },
  });
  child.unref();

  return waitForPointerHealth(2500);
}

function emitAndExit(ctx) {
  process.stdout.write(emitSessionStart(ctx));
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) {
    return emitAndExit(await buildSessionStartContext({ url: null, reason: "missing session_id" }));
  }

  await mkdir(ROOT, { recursive: true });
  const sessionDir = sessionDirFor(ROOT, sessionId);
  const contentDir = path.join(sessionDir, "content");
  const stateDir = path.join(sessionDir, "state");
  await mkdir(contentDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  await writeCcPid(sessionDir);
  await sweepStale(ROOT, new Set([sessionId]));

  const url = await claimLeaderOrConnect();
  if (!url) {
    return emitAndExit(await buildSessionStartContext({
      url: null,
      reason: "no free port in 51296-51305",
    }));
  }

  const labelFile = path.join(sessionDir, "label.txt");
  const ctx = await buildSessionStartContext({
    url, contentDir, vcStateDir: stateDir, labelFile,
  });
  emitAndExit(ctx);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.stdout.write(emitSessionStart(`<!-- kcc-preview: unavailable (${err?.message || "error"}) -->`));
  process.exit(0);
});
