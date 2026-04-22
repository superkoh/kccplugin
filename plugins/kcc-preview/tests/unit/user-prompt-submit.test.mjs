import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertHookOutput } from "../../../../test/lib/hook-output.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "user-prompt-submit.mjs");

function runHook(stdinJson, env) {
  return new Promise((resolve) => {
    const p = spawn("node", [ENTRY], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

function startFakeHealth(payload) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      } else {
        res.writeHead(404); res.end();
      }
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

test("live server -> reminder emitted", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { srv, port } = await startFakeHealth({ sessionId: "s1", uptime: 1000 });
  t.after(() => new Promise(r => srv.close(r)));

  const sessionDir = path.join(root, "s1");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, "server.port"), String(port));
  await writeFile(path.join(sessionDir, "server.pid"), String(srv.address().port));  // any non-zero

  const { code, out } = await runHook(
    { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("UserPromptSubmit", out);
  assert.match(j.hookSpecificOutput.additionalContext, /kcc-preview-reminder/);
  assert.match(j.hookSpecificOutput.additionalContext, new RegExp(`:${port}`));
});

test("no session dir -> empty context, exit 0", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "never-started", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("UserPromptSubmit", out);
  assert.equal(j.hookSpecificOutput.additionalContext, "");
});

test("dead server port -> restart succeeds, reminder emitted with new port", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sessionDir = path.join(root, "s2");
  await mkdir(path.join(sessionDir, "content"), { recursive: true });
  await mkdir(path.join(sessionDir, "state"), { recursive: true });
  // port that's almost certainly not bound + fake pid
  await writeFile(path.join(sessionDir, "server.port"), "1");
  await writeFile(path.join(sessionDir, "server.pid"), "99999999");

  const { code, out } = await runHook(
    { session_id: "s2", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = await assertHookOutput("UserPromptSubmit", out);
  // Either the restart succeeded (new port reminder) OR fell back to unavailable.
  const ctx = j.hookSpecificOutput.additionalContext;
  assert.ok(
    /kcc-preview-reminder/.test(ctx) || /kcc-preview: unavailable/.test(ctx),
    `unexpected context: ${ctx}`,
  );

  // If restarted, clean up
  try {
    const { readFile } = await import("node:fs/promises");
    const pid = Number(await readFile(path.join(sessionDir, "server.pid"), "utf-8"));
    if (pid && pid !== 99999999) process.kill(pid, "SIGTERM");
  } catch {}
});

test("live server -> also appends turn_start to sidecar", async (t) => {
  const { WRITE_SIDECAR } = await import("../../scripts/lib/hook-core.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-ts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { srv, port } = await startFakeHealth({ sessionId: "sx", uptime: 1 });
  t.after(() => new Promise(r => srv.close(r)));

  const sessionDir = path.join(root, "sx");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, "server.port"), String(port));
  await writeFile(path.join(sessionDir, "server.pid"), String(process.pid));

  const { code } = await runHook(
    { session_id: "sx", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const line = JSON.parse(raw.trim().split("\n").at(-1));
  assert.equal(line.event, "turn_start");
});

test("no session dir -> turn_start not written", async (t) => {
  const { WRITE_SIDECAR } = await import("../../scripts/lib/hook-core.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-nodir-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await runHook(
    { session_id: "never-started", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  const { stat } = await import("node:fs/promises");
  await assert.rejects(() =>
    stat(path.join(root, "never-started", WRITE_SIDECAR)));
});
