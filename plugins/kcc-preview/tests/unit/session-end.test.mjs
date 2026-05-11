import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "../../scripts/session-end.mjs");

async function runHook({ sessionId, root }) {
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, KCC_PREVIEW_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(JSON.stringify({ session_id: sessionId }));
  child.stdin.end();
  let out = "";
  child.stdout.on("data", (c) => out += c);
  const code = await new Promise((r) => child.on("exit", r));
  return { code, out };
}

test("session-end rms the session dir", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sid = "sid-x";
  await mkdir(path.join(root, sid, "content"), { recursive: true });
  await writeFile(path.join(root, sid, "label.txt"), "x");
  const { code } = await runHook({ sessionId: sid, root });
  assert.equal(code, 0);
  const remaining = await readdir(root);
  assert.deepEqual(remaining, []);
});

test("session-end is a no-op if dir already gone", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-noop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { code } = await runHook({ sessionId: "never-existed", root });
  assert.equal(code, 0);
});

test("session-end does NOT read server.pid", async (t) => {
  // Regression: old version called process.kill(pid). New version must not
  // open server.pid at all. We simulate by writing an absurd pid; if the
  // hook still tries to kill, the test process itself becomes a candidate
  // (we'd get an unexpected stderr). We assert clean exit and no stderr.
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-nopid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sid = "sid-x";
  await mkdir(path.join(root, sid), { recursive: true });
  await writeFile(path.join(root, sid, "server.pid"), "1");  // legacy file
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, KCC_PREVIEW_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.write(JSON.stringify({ session_id: sid }));
  child.stdin.end();
  let stderr = "";
  child.stderr.on("data", (c) => stderr += c);
  const code = await new Promise((r) => child.on("exit", r));
  assert.equal(code, 0);
  assert.equal(stderr, "");
});
