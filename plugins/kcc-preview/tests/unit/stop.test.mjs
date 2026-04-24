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

async function seedSidecarWithEvents(sessionDir, events) {
  const body = events
    .map((e) => JSON.stringify({ ts: Date.now(), ...e }))
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

test("file under /specs/ path, no entry -> block (C signal)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir, contentDir } = await scaffold(t);
  const specDir = path.join(root, "docs", "specs");
  await mkdir(specDir, { recursive: true });
  const specPath = path.join(specDir, "plan.md");
  await writeFile(specPath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "write", tool: "Write", file_path: specPath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.equal(j.decision, "block");
  assert.match(j.reason, new RegExp(specPath.replace(/[.]/g, "\\.")));
});

test("file under /plans/ path, no entry -> block (C signal)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const planDir = path.join(root, "docs", "plans");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "impl.md");
  await writeFile(planPath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "write", tool: "Write", file_path: planPath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.equal(j.decision, "block");
  assert.match(j.reason, new RegExp(planPath.replace(/[.]/g, "\\.")));
});

test("non-review path without intent signal -> NOT block (core new behavior)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const readmePath = path.join(root, "README.md");
  await writeFile(readmePath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "write", tool: "Write", file_path: readmePath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "", "README write must not trigger Stop block under v0.2.0 semantics");
});

test("non-review path + intent signal (B) -> block", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const notePath = path.join(root, "docs", "notes", "log.md");
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "turn_start" },
    { event: "write", tool: "Write", file_path: notePath },
    { event: "ask_user_question" },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.equal(j.decision, "block");
  assert.match(j.reason, new RegExp(notePath.replace(/[.]/g, "\\.")));
});

test("ask_user_question BEFORE last turn_start -> treated as previous turn, no B signal", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const notePath = path.join(root, "docs", "notes", "log.md");
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "turn_start" },
    { event: "ask_user_question" },     // previous turn
    { event: "turn_start" },             // current turn boundary
    { event: "write", tool: "Write", file_path: notePath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "", "ask_user_question from a prior turn must not carry over");
});

test("CHANGELOG.md, no intent -> NOT block", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const chPath = path.join(root, "CHANGELOG.md");
  await writeFile(chPath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "write", tool: "Write", file_path: chPath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");
});

test("prior-turn unpushed plan + new turn with no writes -> NOT block (v0.2.1 windowing)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  // Turn 1: AI wrote a plan but the user said "ok done, move on". The file
  // stays on disk unpushed; under v0.2.0 this re-triggered Stop on every
  // subsequent turn. v0.2.1 scopes to the current turn.
  const planDir = path.join(root, "docs", "plans");
  await mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, "old.md");
  await writeFile(planPath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "turn_start" },
    { event: "write", tool: "Write", file_path: planPath },
    { event: "turn_start" },   // current turn — AI wrote nothing so far
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "", "a prior-turn unpushed plan must not re-trigger Stop");
});

test("prior-turn README + this-turn ask_user_question -> NOT block (B window scoped)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  // Turn 1 wrote a finished README. Turn 2 asks a clarifying AskUserQuestion
  // about something unrelated. Under v0.2.0 this would block on the stale
  // README because B had no turn window on the "unpushed files" side.
  const readmePath = path.join(root, "README.md");
  await writeFile(readmePath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "turn_start" },
    { event: "write", tool: "Write", file_path: readmePath },
    { event: "turn_start" },
    { event: "ask_user_question" },   // intent this turn, but the write was prior
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "", "AskUserQuestion must not drag in writes from earlier turns");
});

test("this-turn spec write + no intent -> C still blocks (windowed scan)", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const specDir = path.join(root, "docs", "specs");
  await mkdir(specDir, { recursive: true });
  const specPath = path.join(specDir, "new.md");
  await writeFile(specPath, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "turn_start" },
    { event: "turn_start" },   // explicit current-turn boundary
    { event: "write", tool: "Write", file_path: specPath },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.equal(j.decision, "block");
  assert.match(j.reason, new RegExp(specPath.replace(/[.]/g, "\\.")));
});

test("multiple unpushed files under /specs/ -> block reason lists all", async (t) => {
  const { root, previewRoot, sessionId, sessionDir } = await scaffold(t);
  const specDir = path.join(root, "docs", "specs");
  await mkdir(specDir, { recursive: true });
  const a = path.join(specDir, "a.md");
  const b = path.join(specDir, "b.md");
  await writeFile(a, longBody());
  await writeFile(b, longBody());
  await seedSidecarWithEvents(sessionDir, [
    { event: "write", tool: "Write", file_path: a },
    { event: "write", tool: "Write", file_path: b },
  ]);

  const { code, out } = await runHook(
    { session_id: sessionId, cwd: root, hook_event_name: "Stop" },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("Stop", out);
  assert.match(j.reason, new RegExp(a.replace(/[.]/g, "\\.")));
  assert.match(j.reason, new RegExp(b.replace(/[.]/g, "\\.")));
});
