import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "../../scripts/user-prompt-submit.mjs");

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-root-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-home-"));
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
  ]));
  return { root, home };
}

async function runHook({ sessionId, root, home }) {
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, KCC_PREVIEW_ROOT: root, HOME: home },
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

test("emits empty additionalContext when session dir is missing", async (t) => {
  const { root, home } = await setup(t);
  const r = await runHook({ sessionId: "ghost", root, home });
  const env = JSON.parse(r.out);
  assert.equal(env.hookSpecificOutput.additionalContext, "");
});

test("appends turn_start when session dir exists, even if no daemon", async (t) => {
  const { root, home } = await setup(t);
  const sid = "sid-tu";
  await mkdir(path.join(root, sid), { recursive: true });
  await runHook({ sessionId: sid, root, home });
  const sidecar = await readFile(path.join(root, sid, "tool-writes.jsonl"), "utf-8");
  assert.match(sidecar, /"event":"turn_start"/);
});

test("emits reminder when daemon is reachable via pointer", async (t) => {
  const { root, home } = await setup(t);
  const sid = "sid-live";
  await mkdir(path.join(root, sid), { recursive: true });
  // Stand up a fake daemon answering /health
  const srv = http.createServer((req, res) => {
    if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  t.after(() => new Promise((r) => srv.close(r)));
  await mkdir(path.join(home, ".kcc-preview"), { recursive: true });
  await writeFile(path.join(home, ".kcc-preview", "url"), `http://localhost:${port}`);
  const r = await runHook({ sessionId: sid, root, home });
  const env = JSON.parse(r.out);
  assert.match(env.hookSpecificOutput.additionalContext, new RegExp(`http://localhost:${port}`));
});
