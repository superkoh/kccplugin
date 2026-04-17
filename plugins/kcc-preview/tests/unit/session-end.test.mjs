import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "session-end.mjs");

function runHook(stdinJson, env) {
  return new Promise((resolve) => {
    const p = spawn("node", [ENTRY], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => out += d);
    p.on("close", (code) => resolve({ code, out }));
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

test("SessionEnd kills server pid and removes session dir", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  // Spawn a long-running sleeper we can assert is killed
  const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore", detached: true,
  });
  sleeper.unref();

  const sessionDir = path.join(root, "end-test");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, "server.pid"), String(sleeper.pid));
  await writeFile(path.join(sessionDir, "server.port"), "1");

  const { code, out } = await runHook(
    { session_id: "end-test", hook_event_name: "SessionEnd" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.hookSpecificOutput.hookEventName, "SessionEnd");

  // Session dir is gone
  assert.equal(existsSync(sessionDir), false);

  // Sleeper process is dead — give SIGTERM a moment
  await new Promise(r => setTimeout(r, 200));
  let alive;
  try { process.kill(sleeper.pid, 0); alive = true; } catch { alive = false; }
  assert.equal(alive, false);
});

test("SessionEnd is a no-op when session dir does not exist", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "never-started", hook_event_name: "SessionEnd" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  assert.match(out, /SessionEnd/);
});
