import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, buildReminderContext,
  emitSessionStart, emitUserPromptSubmit, emitSessionEnd,
} from "../../scripts/lib/hook-core.mjs";
import { assertHookOutput, validateHookOutput } from "../../../../test/lib/hook-output.mjs";

test("sessionDirFor concatenates session_id under root", async () => {
  const root = "/tmp/x";
  assert.equal(sessionDirFor(root, "abc-123"), "/tmp/x/abc-123");
});

// Regression for the concurrent-session bug: when a second Claude Code
// session runs SessionStart, sweepStale used to SIGTERM + rm any dir
// whose id wasn't in activeIds — wiping the peer session's live server.
// Now it must leave alive siblings alone.
test("sweepStale leaves alive sibling sessions untouched", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-alive-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore", detached: true,
  });
  sleeper.unref();
  t.after(() => { try { process.kill(sleeper.pid, "SIGKILL"); } catch {} });

  const siblingDir = path.join(root, "sibling-session");
  await mkdir(siblingDir, { recursive: true });
  await writeFile(path.join(siblingDir, "server.pid"), String(sleeper.pid));

  // activeIds contains only the *current* session — the sibling is NOT in it.
  // Before the fix, this would kill the sleeper and remove siblingDir.
  await sweepStale(root, new Set(["my-own-session"]));

  const remaining = await readdir(root);
  assert.ok(remaining.includes("sibling-session"),
    "alive sibling session dir must survive sweepStale");

  let stillAlive;
  try { process.kill(sleeper.pid, 0); stillAlive = true; } catch { stillAlive = false; }
  assert.equal(stillAlive, true,
    "sweepStale must not SIGTERM an alive sibling session's server");
});

test("sweepStale removes dirs with dead pids", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sweep-"));
  t.after(() => import("node:fs/promises").then(m => m.rm(root, { recursive: true, force: true })));

  // Create a dir with a clearly-dead pid
  const deadDir = path.join(root, "dead-session");
  await mkdir(deadDir, { recursive: true });
  await writeFile(path.join(deadDir, "server.pid"), "99999999");

  // Create a dir belonging to our own process (must be preserved when activeIds includes it)
  const liveDir = path.join(root, "live-session");
  await mkdir(liveDir, { recursive: true });
  await writeFile(path.join(liveDir, "server.pid"), String(process.pid));

  await sweepStale(root, new Set(["live-session"]));

  const remaining = await readdir(root);
  assert.ok(!remaining.includes("dead-session"));
  assert.ok(remaining.includes("live-session"));
});

test("buildSessionStartContext substitutes URL, CONTENT_DIR, VC_STATE_DIR", async () => {
  const ctx = await buildSessionStartContext({
    url: "http://localhost:12345",
    contentDir: "/tmp/s1/content",
    vcStateDir: "/tmp/s1/state",
  });
  assert.match(ctx, /<!-- kcc-preview-sentinel: v1 -->/);
  assert.match(ctx, /http:\/\/localhost:12345/);
  assert.match(ctx, /\/tmp\/s1\/content/);
  assert.match(ctx, /\/tmp\/s1\/state/);
  assert.ok(!ctx.includes("{{URL}}"));
  assert.ok(!ctx.includes("{{CONTENT_DIR}}"));
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
