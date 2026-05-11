import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "../../scripts/session-start.mjs");

// All tests use a high test-only port range to keep the actually-running
// production daemon (on 51296) untouched, and to avoid colliding with the
// user's other services.
const TEST_RANGE = "53400-53409";

async function runHook(t, { sessionId, root, home, range = TEST_RANGE }) {
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      KCC_PREVIEW_ROOT: root,
      HOME: home,
      KCC_PREVIEW_PORT_RANGE: range,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(JSON.stringify({ session_id: sessionId }));
  child.stdin.end();
  let out = "", err = "";
  child.stdout.on("data", (c) => out += c);
  child.stderr.on("data", (c) => err += c);
  const code = await new Promise((r) => child.on("exit", r));
  return { code, out, err };
}

async function killSpawnedDaemon(home) {
  // The daemon writes its own pid into <HOME>/.kcc-preview/daemon.pid on
  // startup; reading it gives us a precise cleanup target instead of grep.
  try {
    const raw = await readFile(path.join(home, ".kcc-preview", "daemon.pid"), "utf-8");
    const pid = Number(raw.trim());
    if (pid > 0) { try { process.kill(pid, "SIGTERM"); } catch {} }
  } catch { /* never started or already gone */ }
}

async function setupRoots(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-root-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-home-"));
  t.after(async () => {
    await killSpawnedDaemon(home);
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(home, { recursive: true, force: true }),
    ]);
  });
  return { root, home };
}

test("session-start writes cc.pid", async (t) => {
  const { root, home } = await setupRoots(t);
  const sid = "sid-pid";
  const r = await runHook(t, { sessionId: sid, root, home });
  assert.equal(r.code, 0);
  const pidRaw = await readFile(path.join(root, sid, "cc.pid"), "utf-8");
  // ppid of the spawned child = pid of this test process
  assert.equal(Number(pidRaw.trim()), process.pid);
  // url pointer should exist after a successful leader-election
  const url = (await readFile(path.join(home, ".kcc-preview", "url"), "utf-8")).trim();
  assert.match(url, /^http:\/\/localhost:534\d{2}$/);
});

test("session-start emits URL in additionalContext", async (t) => {
  const { root, home } = await setupRoots(t);
  const r = await runHook(t, { sessionId: "sid-ctx", root, home });
  const env = JSON.parse(r.out);
  assert.equal(env.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(env.hookSpecificOutput.additionalContext, /http:\/\/localhost:534\d{2}/);
});

test("session-start emits unavailable when range is exhausted", async (t) => {
  const { root, home } = await setupRoots(t);
  const net = await import("node:net");
  const blockers = [];
  for (let port = 53420; port <= 53421; port++) {
    const srv = net.createServer();
    await new Promise((r) => srv.listen(port, "127.0.0.1", r));
    blockers.push(srv);
  }
  t.after(() => Promise.all(blockers.map((s) => new Promise((r) => s.close(r)))));

  const r = await runHook(t, {
    sessionId: "sid-exhausted", root, home, range: "53420-53421",
  });
  const env = JSON.parse(r.out);
  assert.match(env.hookSpecificOutput.additionalContext, /unavailable/);
});
