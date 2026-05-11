#!/usr/bin/env node
// Detached server entry. Reads SESSION_ID and SESSION_DIR from env, starts
// the HTTP server on a random free port, starts the directory watcher,
// writes server.port and server.pid into SESSION_DIR, and stays running
// until SIGTERM.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "./lib/server.mjs";
import { createMultiStore } from "./lib/item-store.mjs";
import { watchContentDir } from "./lib/watcher.mjs";

const SESSION_ID = process.env.SESSION_ID;
const SESSION_DIR = process.env.SESSION_DIR;

if (!SESSION_ID || !SESSION_DIR) {
  console.error("server.mjs requires SESSION_ID and SESSION_DIR env vars");
  process.exit(2);
}

const contentDir = path.join(SESSION_DIR, "content");
const stateDir = path.join(SESSION_DIR, "state");

// Transitional bridge: this entry point still serves a single CC session.
// Task 8 will rename this file to daemon.mjs and run a single shared
// process across all sessions, where each session is added via root-watcher.
const multiStore = createMultiStore();
const sessionLabels = new Map([[SESSION_ID, SESSION_ID]]);
const { port, stop } = await createServer({
  multiStore,
  sessionLabels,
  vcEventsPathFor: () => path.join(stateDir, "events"),
});

const unwatch = watchContentDir(contentDir, {
  onEntry: (entry) => multiStore.add(SESSION_ID, entry),
  onError: (err) => console.error("[kcc-preview watcher]", err.message),
});

await writeFile(path.join(SESSION_DIR, "server.port"), String(port));
await writeFile(path.join(SESSION_DIR, "server.pid"), String(process.pid));
await writeFile(path.join(stateDir, "server-info"), JSON.stringify({
  sessionId: SESSION_ID,
  url: `http://localhost:${port}`,
  port,
  screen_dir: contentDir,
  state_dir: stateDir,
}, null, 2));

async function shutdown() {
  unwatch();
  try { await stop(); } catch { /* ignore */ }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Detached-process error discipline: an unhandled rejection here would
// otherwise produce confusing "port file never appeared" symptoms in the
// SessionStart hook polling for it. Exit 2 matches the bad-env exit above.
process.on("unhandledRejection", (err) => {
  console.error("[kcc-preview server] fatal:", err?.stack || err);
  process.exit(2);
});
process.on("uncaughtException", (err) => {
  console.error("[kcc-preview server] fatal:", err?.stack || err);
  process.exit(2);
});
