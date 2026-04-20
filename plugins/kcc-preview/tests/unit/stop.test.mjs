// End-to-end tests for scripts/stop.mjs, driven as a real subprocess so the
// full stdin/stdout/exit contract is exercised — not just the helper
// functions. Each test builds a fake session dir + sidecar under a per-test
// tmpdir, pipes a JSON envelope to the hook, and asserts the exact
// stdout/exit behavior documented in the Stop hook spec.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertHookOutput } from "../../../../test/lib/hook-output.mjs";
import { PUSHABLE_MIN_LINES, WRITE_SIDECAR } from "../../scripts/lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "stop.mjs");

function runHook(stdinJson, env = {}) {
  return new Promise((resolve) => {
    const p = spawn("node", [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

function longBody(n = PUSHABLE_MIN_LINES + 5) {
  return Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
}

async function scaffold(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-stop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previewRoot = path.join(root, "preview");
  const sessionId = "sess-test";
  const sessionDir = path.join(previewRoot, sessionId);
  const contentDir = path.join(sessionDir, "content");
  await mkdir(contentDir, { recursive: true });
  return { root, previewRoot, sessionId, sessionDir, contentDir };
}

async function seedSidecar(sessionDir, filePaths) {
  const body = filePaths
    .map((fp) => JSON.stringify({ ts: Date.now(), tool: "Write", file_path: fp }))
    .join("\n") + "\n";
  await writeFile(path.join(sessionDir, WRITE_SIDECAR), body);
}

test("stop_hook_active=true -> exit silently", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);

  // Even if there's a clear gap, the anti-loop gate must win. Seed a missing
  // file write in the sidecar to prove we don't block on re-entry.
  const targetPath = path.join(root, "plan.md");
  await writeFile(targetPath, longBody());
  await seedSidecar(sessionDir, [targetPath]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop", stop_hook_active: true },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("no session_id -> exit silently", async (t) => {
  const { previewRoot } = await scaffold(t);
  const { code, out } = await runHook(
    { cwd: "/tmp", hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("no sidecar -> exit silently (nothing written this session)", async (t) => {
  const { previewRoot, sessionId } = await scaffold(t);
  const { code, out } = await runHook(
    { session_id: sessionId, cwd: "/tmp", hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("pushable file written but no entry -> emit Stop block JSON", async (t) => {
  const { root, previewRoot, sessionId, sessionDir, contentDir } = await scaffold(t);

  const planPath = path.join(root, "plan.md");
  await writeFile(planPath, longBody());
  await seedSidecar(sessionDir, [planPath]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.equal(j.decision, "block");
  assert.match(j.reason, new RegExp(planPath.replace(/[.]/g, "\\.")));
  assert.match(j.reason, /kind: file/);
  assert.match(j.reason, new RegExp(contentDir.replace(/[.]/g, "\\.")));
});

test("pushable file with matching kind:file entry -> exit silently", async (t) => {
  const { root, previewRoot, sessionId, sessionDir, contentDir } = await scaffold(t);

  const planPath = path.join(root, "plan.md");
  await writeFile(planPath, longBody());
  await seedSidecar(sessionDir, [planPath]);

  // AI already pushed an entry — stop hook must NOT block.
  await writeFile(path.join(contentDir, "entry.md"),
    `---\ntitle: "plan"\nkind: file\npath: "${planPath}"\n---\n`);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("sub-threshold file written -> exit silently", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);

  const tinyPath = path.join(root, "tiny.md");
  await writeFile(tinyPath, "one line only");
  await seedSidecar(sessionDir, [tinyPath]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("multiple unpushed files -> block reason lists all of them", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);

  const a = path.join(root, "a.md");
  const b = path.join(root, "b.md");
  await writeFile(a, longBody());
  await writeFile(b, longBody());
  await seedSidecar(sessionDir, [a, b]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.match(j.reason, new RegExp(a.replace(/[.]/g, "\\.")));
  assert.match(j.reason, new RegExp(b.replace(/[.]/g, "\\.")));
});
