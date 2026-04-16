#!/usr/bin/env node
// Detached server entry. Reads SESSION_ID and SESSION_DIR from env, starts
// the HTTP server on a random free port, starts the directory watcher,
// writes server.port and server.pid into SESSION_DIR, and stays running
// until SIGTERM.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "./lib/server.mjs";
import { createItemStore } from "./lib/item-store.mjs";
import { watchContentDir } from "./lib/watcher.mjs";

const SESSION_ID = process.env.SESSION_ID;
const SESSION_DIR = process.env.SESSION_DIR;

if (!SESSION_ID || !SESSION_DIR) {
  console.error("server.mjs requires SESSION_ID and SESSION_DIR env vars");
  process.exit(2);
}

const contentDir = path.join(SESSION_DIR, "content");
const stateDir = path.join(SESSION_DIR, "state");
const vcEventsPath = path.join(stateDir, "events");

const store = createItemStore();
const { port, stop } = await createServer({ store, sessionId: SESSION_ID, vcEventsPath });

const unwatch = watchContentDir(contentDir, {
  onEntry: (entry) => store.add(entry),
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
