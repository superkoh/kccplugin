// End-to-end tests for scripts/post-tool-use.mjs. Drives the hook as a real
// subprocess and asserts that Write/Edit/MultiEdit envelopes land as JSONL
// lines in <sessionDir>/tool-writes.jsonl, with absolute paths and the
// original tool_name preserved. Silent on missing session / missing
// file_path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WRITE_SIDECAR } from "../../scripts/lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "post-tool-use.mjs");

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

async function scaffold(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ptu-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previewRoot = path.join(root, "preview");
  const sessionId = "sess-test";
  const sessionDir = path.join(previewRoot, sessionId);
  await mkdir(sessionDir, { recursive: true });
  return { root, previewRoot, sessionId, sessionDir };
}

test("Write tool -> appends JSONL line with abs path and tool name", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  const { code, out } = await runHook(
    {
      session_id: sessionId,
      cwd: "/work",
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/abs/plan.md", content: "..." },
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  assert.equal(out, "");  // PostToolUse entry is silent

  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tool, "Write");
  assert.equal(lines[0].file_path, path.normalize("/abs/plan.md"));
});

test("Edit with relative path resolves against cwd", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  await runHook(
    {
      session_id: sessionId,
      cwd: "/work",
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "src/foo.md" },
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );

  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const entry = JSON.parse(raw.trim());
  assert.equal(entry.file_path, path.normalize("/work/src/foo.md"));
});

test("missing file_path -> no sidecar write, exit 0", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  const { code } = await runHook(
    {
      session_id: sessionId,
      cwd: "/work",
      hook_event_name: "PostToolUse",
      tool_name: "SomethingElse",
      tool_input: {},
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  // Sidecar should not exist
  await assert.rejects(() => stat(path.join(sessionDir, WRITE_SIDECAR)));
});

test("missing session_id -> no sidecar, exit 0", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  const { code } = await runHook(
    {
      cwd: "/work",
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/abs/plan.md" },
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  await assert.rejects(() => stat(path.join(sessionDir, WRITE_SIDECAR)));
});

test("multiple calls accumulate lines in order", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  for (const f of ["/a.md", "/b.md", "/c.md"]) {
    await runHook(
      {
        session_id: sessionId,
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: f },
      },
      { KCC_PREVIEW_ROOT: previewRoot },
    );
  }

  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.file_path), ["/a.md", "/b.md", "/c.md"].map(path.normalize));
});

test("AskUserQuestion tool -> appends ask_user_question event, no file_path", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  const { code } = await runHook(
    {
      session_id: sessionId,
      cwd: "/work",
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "pick one" }] },
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  assert.equal(code, 0);
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path.join(sessionDir, "tool-writes.jsonl"), "utf-8");
  const line = JSON.parse(raw.trim());
  assert.equal(line.event, "ask_user_question");
  assert.equal(line.file_path, undefined);
});

test("AskUserQuestion with no tool_input -> still appends event", async (t) => {
  const { previewRoot, sessionId, sessionDir } = await scaffold(t);

  await runHook(
    {
      session_id: sessionId,
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
    },
    { KCC_PREVIEW_ROOT: previewRoot },
  );
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path.join(sessionDir, "tool-writes.jsonl"), "utf-8");
  assert.match(raw, /"event":"ask_user_question"/);
});
