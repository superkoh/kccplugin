import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "session-start.mjs");

function runHook(stdinJson, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("node", [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", reject);
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

function killOnAfter(t, pidPath) {
  t.after(async () => {
    try {
      const pid = Number(await readFile(pidPath, "utf-8"));
      if (pid > 0) process.kill(pid, "SIGTERM");
    } catch { /* server already gone or pid file missing */ }
  });
}

test("SessionStart hook emits JSON with sentinel and URL", async (t) => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-test-"));
  t.after(() => rm(tmpRoot, { recursive: true, force: true }));
  killOnAfter(t, path.join(tmpRoot, "abc-123", "server.pid"));

  const { code, out } = await runHook(
    { session_id: "abc-123", cwd: process.cwd(), hook_event_name: "SessionStart" },
    { KCC_PREVIEW_ROOT: tmpRoot },
  );
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<!-- kcc-preview-sentinel: v1 -->/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /http:\/\/localhost:\d+/);
});

test("SessionStart creates session dir with server.port, server.pid, and content/", async (t) => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-test-"));
  t.after(() => rm(tmpRoot, { recursive: true, force: true }));
  killOnAfter(t, path.join(tmpRoot, "sess-xyz", "server.pid"));

  const { code, out } = await runHook(
    { session_id: "sess-xyz", cwd: process.cwd(), hook_event_name: "SessionStart" },
    { KCC_PREVIEW_ROOT: tmpRoot },
  );
  assert.equal(code, 0);

  const sessionDir = path.join(tmpRoot, "sess-xyz");
  const port = Number(await readFile(path.join(sessionDir, "server.port"), "utf-8"));
  assert.ok(port > 0);
  const pid = Number(await readFile(path.join(sessionDir, "server.pid"), "utf-8"));
  assert.ok(pid > 0);

  // Verify server really responds
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.sessionId, "sess-xyz");
});
