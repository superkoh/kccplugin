import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { spawn as _spawn2 } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, buildReminderContext,
  emitSessionStart, emitUserPromptSubmit, emitSessionEnd,
  isSuperpowersInstalled,
  writeCcPid, pingHealth,
} from "../../scripts/lib/hook-core.mjs";

async function fakeClaudeHome(t, { superpowers } = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ch-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const cacheRoot = path.join(home, "plugins", "cache", "some-marketplace");
  await mkdir(cacheRoot, { recursive: true });
  if (superpowers) {
    await mkdir(path.join(cacheRoot, "superpowers"), { recursive: true });
  } else {
    await mkdir(path.join(cacheRoot, "other-plugin"), { recursive: true });
  }
  return home;
}
import { assertHookOutput, validateHookOutput } from "../../../../test/lib/hook-output.mjs";

test("sessionDirFor concatenates session_id under root", async () => {
  const root = "/tmp/x";
  assert.equal(sessionDirFor(root, "abc-123"), "/tmp/x/abc-123");
});

// NOTE: Legacy sweepStale tests that asserted on `server.pid` were removed
// when the helper was rewired to read `cc.pid` instead. Their anti-regression
// intent (alive sibling pid -> don't delete; dead pid -> delete; activeIds
// protected) is covered by the four "sweepStale ... cc.pid" cases further
// down this file.

test("buildSessionStartContext (no superpowers) substitutes URL + CONTENT_DIR and omits appendix", async (t) => {
  const claudeHome = await fakeClaudeHome(t, { superpowers: false });
  const ctx = await buildSessionStartContext({
    url: "http://localhost:12345",
    contentDir: "/tmp/s1/content",
    vcStateDir: "/tmp/s1/state",
    claudeHome,
  });
  assert.match(ctx, /<!-- kcc-preview-sentinel: v1 -->/);
  assert.match(ctx, /http:\/\/localhost:12345/);
  assert.match(ctx, /\/tmp\/s1\/content/);
  assert.ok(!ctx.includes("{{URL}}"));
  assert.ok(!ctx.includes("{{CONTENT_DIR}}"));
  // VC_STATE_DIR placeholder lives only in the superpowers appendix, so its
  // substituted value must not appear in a no-superpowers context — and the
  // appendix header itself must be absent. If either shows up, the conditional
  // split regressed and users without superpowers are paying for dead weight.
  assert.ok(!ctx.includes("/tmp/s1/state"),
    "VC_STATE_DIR is appendix-only; should not appear without superpowers");
  assert.ok(!ctx.includes("superpowers brainstorming compatibility"),
    "superpowers appendix must be omitted when not installed");
});

test("buildSessionStartContext appends superpowers section only when installed", async (t) => {
  const noSp = await fakeClaudeHome(t, { superpowers: false });
  const withSp = await fakeClaudeHome(t, { superpowers: true });
  const common = { url: "http://localhost:1", contentDir: "/c", vcStateDir: "/s" };

  const ctxWithout = await buildSessionStartContext({ ...common, claudeHome: noSp });
  const ctxWith = await buildSessionStartContext({ ...common, claudeHome: withSp });

  assert.ok(!ctxWithout.includes("superpowers brainstorming compatibility"));
  assert.ok(ctxWith.includes("superpowers brainstorming compatibility"));
  // The appendix also uses template placeholders; substitution pass must
  // cover the concatenated text, not just the core. If it didn't, users
  // would see raw {{URL}} / {{VC_STATE_DIR}} tokens in their sidebar.
  assert.ok(ctxWith.includes("http://localhost:1"));
  assert.ok(ctxWith.includes("/s"), "VC_STATE_DIR should be substituted in appendix");
  assert.ok(!ctxWith.includes("{{URL}}"));
  assert.ok(!ctxWith.includes("{{VC_STATE_DIR}}"));
  assert.ok(ctxWith.length > ctxWithout.length,
    "with-superpowers context must be strictly larger");
});

test("isSuperpowersInstalled returns false when plugins cache dir is missing", async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ch-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  assert.equal(await isSuperpowersInstalled({ claudeHome: home }), false);
});

test("isSuperpowersInstalled finds superpowers under any marketplace name", async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), "kcc-ch-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  // Mimic the real-world path ~/.claude/plugins/cache/<marketplace>/<plugin>
  await mkdir(path.join(home, "plugins", "cache", "a-non-standard-marketplace", "superpowers", "9.9.9"), { recursive: true });
  assert.equal(await isSuperpowersInstalled({ claudeHome: home }), true);
});

test("buildReminderContext substitutes URL", async () => {
  const r = await buildReminderContext({ url: "http://localhost:5000" });
  assert.match(r, /<!-- kcc-preview-reminder: v1 -->/);
  assert.match(r, /http:\/\/localhost:5000/);
});

test("buildSessionStartContext returns unavailable marker when url is null", async () => {
  const ctx = await buildSessionStartContext({ url: null, reason: "port bind failed" });
  assert.match(ctx, /kcc-preview: unavailable \(port bind failed\)/);
});

// Claude Code's hook-output schema is event-specific. SessionStart /
// UserPromptSubmit accept hookSpecificOutput.additionalContext, SessionEnd
// rejects hookSpecificOutput entirely. These three tests also exercise the
// shared assertHookOutput helper, which is what new hook tests should use.
test("emitSessionStart output passes SessionStart schema", async () => {
  const j = await assertHookOutput("SessionStart", emitSessionStart("CTX"));
  assert.equal(j.hookSpecificOutput.additionalContext, "CTX");
});

test("emitUserPromptSubmit output passes UserPromptSubmit schema", async () => {
  const j = await assertHookOutput("UserPromptSubmit", emitUserPromptSubmit("R"));
  assert.equal(j.hookSpecificOutput.additionalContext, "R");
});

test("emitSessionEnd output passes SessionEnd schema (no hookSpecificOutput)", async () => {
  const j = await assertHookOutput("SessionEnd", emitSessionEnd());
  assert.equal(j.continue, true);
  assert.equal(j.suppressOutput, true);
});

// Negative sanity: the helper must actually fail on the regression shape
// (SessionEnd emitting hookSpecificOutput). Without this we're trusting that
// the helper "works" without proof that it catches the exact bug that
// slipped through to production.
test("validateHookOutput rejects SessionEnd with hookSpecificOutput (regression guard)", async () => {
  const bad = JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionEnd", additionalContext: "" },
    suppressOutput: false,
  });
  const { ok, errors } = await validateHookOutput("SessionEnd", bad);
  assert.equal(ok, false);
  assert.ok(errors.some(e => /must not emit hookSpecificOutput/.test(e)),
    `expected SessionEnd rejection, got: ${errors.join("; ")}`);
});

test("validateHookOutput rejects mismatched hookEventName", async () => {
  const bad = JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" },
  });
  const { ok, errors } = await validateHookOutput("UserPromptSubmit", bad);
  assert.equal(ok, false);
  assert.ok(errors.some(e => /hookEventName/.test(e)));
});

// -- Session-dir sweep + pid bookkeeping ------------------------------------

test("sweepStale removes dirs whose cc.pid is dead", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-cc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const orphan = path.join(root, "dead-sid");
  await mkdir(orphan);
  await writeFile(path.join(orphan, "cc.pid"), "999999");  // unlikely-alive pid
  await sweepStale(root, new Set());
  const left = await readdir(root);
  assert.deepEqual(left, []);
});

test("sweepStale leaves dirs whose cc.pid is alive", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-cc-alive-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sleeper = _spawn2(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore", detached: true,
  });
  sleeper.unref();
  t.after(() => { try { process.kill(sleeper.pid, "SIGKILL"); } catch {} });
  const live = path.join(root, "live-sid");
  await mkdir(live);
  await writeFile(path.join(live, "cc.pid"), String(sleeper.pid));
  await sweepStale(root, new Set());
  const left = await readdir(root);
  assert.deepEqual(left, ["live-sid"]);
});

test("sweepStale leaves dirs missing cc.pid (legacy 0.2.x upgrade)", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-legacy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = path.join(root, "legacy-sid");
  await mkdir(legacy);
  // No cc.pid at all
  await sweepStale(root, new Set());
  const left = await readdir(root);
  assert.deepEqual(left, ["legacy-sid"]);
});

test("sweepStale respects activeIds even with stale cc.pid", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-active-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "self-sid");
  await mkdir(dir);
  await writeFile(path.join(dir, "cc.pid"), "999999");
  await sweepStale(root, new Set(["self-sid"]));
  const left = await readdir(root);
  assert.deepEqual(left, ["self-sid"]);
});

test("writeCcPid records process.ppid by default", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-ccpid-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeCcPid(dir);
  const got = (await readFile(path.join(dir, "cc.pid"), "utf-8")).trim();
  assert.equal(got, String(process.ppid));
});

test("writeCcPid accepts explicit pid", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-ccpid-exp-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeCcPid(dir, 12345);
  const got = (await readFile(path.join(dir, "cc.pid"), "utf-8")).trim();
  assert.equal(got, "12345");
});

test("pingHealth returns true for a 200 OK server", async (t) => {
  const srv = http.createServer((_, res) => { res.writeHead(200); res.end("ok"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  t.after(() => new Promise((r) => srv.close(r)));
  assert.equal(await pingHealth(port, 300), true);
});

test("pingHealth returns false for a non-listening port", async () => {
  // Port chosen unlikely-to-be-bound; verify by attempting bind first
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  assert.equal(await pingHealth(port, 200), false);
});
