#!/usr/bin/env node
// Shared daemon. Spawned detached by SessionStart's leader-election winner.
// Env contract:
//   KCC_PREVIEW_PORT   — the resolved leader port to listen on (required)
//   KCC_PREVIEW_ROOT   — session root (defaults to $TMPDIR/kcc-preview)
// Writes the URL pointer after binding, watches the root for session
// add/remove/label, runs idle-reaper to exit after 60s of zero labeled
// sessions. Owns one watchContentDir per discovered session.

import path from "node:path";
import os from "node:os";
import { createServer } from "./lib/server.mjs";
import { createMultiStore } from "./lib/item-store.mjs";
import { createRootWatcher } from "./lib/root-watcher.mjs";
import { createIdleReaper } from "./lib/idle-reaper.mjs";
import { watchContentDir } from "./lib/watcher.mjs";
import { writeUrlPointer, clearUrlPointer } from "./lib/url-pointer.mjs";
import { writeFile, rm as rmFile } from "node:fs/promises";

const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");
const PORT = Number(process.env.KCC_PREVIEW_PORT);
if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error("daemon.mjs requires KCC_PREVIEW_PORT");
  process.exit(2);
}

// Daemon writes its own pid so tests and ops scripts can target it for
// cleanup without grep-ing `ps`. Lives next to the URL pointer.
const DAEMON_PID_PATH = path.join(
  process.env.HOME || os.homedir(),
  ".kcc-preview",
  "daemon.pid",
);

const multiStore = createMultiStore();
const sessionLabels = new Map();
const contentUnwatch = new Map();  // sid -> unwatch fn

const reaper = createIdleReaper({
  idleMs: 60_000,
  onExit: async () => {
    try { await stop(); } catch {}
    try { await clearUrlPointer(); } catch {}
    process.exit(0);
  },
});

const { port, stop, broadcast } = await createServer({
  multiStore,
  sessionLabels,
  port: PORT,
  vcEventsPathFor: (sid) => path.join(ROOT, sid, "state", "events"),
});

await writeUrlPointer(`http://localhost:${port}`);
try { await writeFile(DAEMON_PID_PATH, String(process.pid)); } catch {}

const stopWatcher = createRootWatcher(ROOT, {
  tickMs: 5000,
  onEvent: (e) => {
    if (e.type === "session-discovered") {
      const u = watchContentDir(path.join(ROOT, e.sid, "content"), {
        onEntry: (entry) => multiStore.add(e.sid, entry),
        onError: (err) => console.error("[kcc-preview watcher]", err.message),
      });
      contentUnwatch.set(e.sid, u);
    } else if (e.type === "session-labeled") {
      sessionLabels.set(e.sid, e.label);
      reaper.onLabeled(e.sid);
      broadcast("session-added", { sid: e.sid, label: e.label });
    } else if (e.type === "session-relabeled") {
      sessionLabels.set(e.sid, e.label);
      broadcast("session-relabeled", { sid: e.sid, label: e.label });
    } else if (e.type === "session-removed") {
      const u = contentUnwatch.get(e.sid);
      if (u) { u(); contentUnwatch.delete(e.sid); }
      multiStore.removeSession(e.sid);
      const wasLabeled = sessionLabels.delete(e.sid);
      if (wasLabeled) reaper.onRemoved(e.sid);
      broadcast("session-removed", { sid: e.sid });
    }
  },
});

async function shutdown() {
  stopWatcher();
  for (const u of contentUnwatch.values()) try { u(); } catch {}
  try { await stop(); } catch {}
  try { await clearUrlPointer(); } catch {}
  try { await rmFile(DAEMON_PID_PATH); } catch {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (err) => {
  console.error("[kcc-preview daemon] fatal:", err?.stack || err);
  process.exit(2);
});
process.on("uncaughtException", (err) => {
  console.error("[kcc-preview daemon] fatal:", err?.stack || err);
  process.exit(2);
});
