import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "../../scripts/user-prompt-submit.mjs");
const TEST_RANGE = "53430-53439";

async function killSpawnedDaemon(home) {
  try {
    const raw = await readFile(path.join(home, ".kcc-preview", "daemon.pid"), "utf-8");
    const pid = Number(raw.trim());
    if (pid > 0) { try { process.kill(pid, "SIGTERM"); } catch {} }
  } catch { /* never started */ }
}

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-root-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-home-"));
  t.after(async () => {
    await killSpawnedDaemon(home);
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(home, { recursive: true, force: true }),
    ]);
  });
  return { root, home };
}

async function runHook({ sessionId, root, home, range = TEST_RANGE }) {
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

  // Hold the entire test range so reElect cannot spawn a real daemon —
  // the hook should still append turn_start before bailing out.
  const blockers = [];
  for (let port = 53450; port <= 53451; port++) {
    const srv = net.createServer();
    await new Promise((r) => srv.listen(port, "127.0.0.1", r));
    blockers.push(srv);
  }
  t.after(() => Promise.all(blockers.map((s) => new Promise((r) => s.close(r)))));

  await runHook({ sessionId: sid, root, home, range: "53450-53451" });
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
