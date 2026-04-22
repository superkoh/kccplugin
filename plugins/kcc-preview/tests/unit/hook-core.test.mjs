import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, buildReminderContext,
  emitSessionStart, emitUserPromptSubmit, emitSessionEnd,
  appendWriteSidecar, scanSidecarForPushableFiles,
  listPushedEntryPaths, buildStopBlockReason,
  emitStopBlock, isSuperpowersInstalled,
  PUSHABLE_MIN_LINES, WRITE_SIDECAR,
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

function longBody(lines = PUSHABLE_MIN_LINES + 5) {
  return Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n");
}

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

// -- Stop-hook helpers -------------------------------------------------------

test("appendWriteSidecar creates file and appends JSONL line with abs path", async (t) => {
  const sessionDir = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(sessionDir, { recursive: true, force: true }));

  await appendWriteSidecar(sessionDir, { tool: "Write", filePath: "/abs/one.md" });
  await appendWriteSidecar(sessionDir, { tool: "Edit", filePath: "relative.md", cwd: "/work" });

  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].tool, "Write");
  assert.equal(lines[0].file_path, path.normalize("/abs/one.md"));
  assert.equal(lines[1].tool, "Edit");
  assert.equal(lines[1].file_path, path.normalize("/work/relative.md"));
  assert.ok(typeof lines[0].ts === "number" && lines[0].ts > 0);
});

test("appendWriteSidecar silently no-ops on empty session/file", async () => {
  // Must never throw — production hook swallows errors but relies on helper
  // tolerating bad inputs without crashing the caller's upstream tool.
  await appendWriteSidecar(null, { tool: "Write", filePath: "/x.md" });
  await appendWriteSidecar("/tmp", { tool: "Write", filePath: "" });
});

test("scanSidecarForPushableFiles finds a pushable write", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = path.join(root, "plan.md");
  await writeFile(plan, longBody());

  await appendWriteSidecar(root, { tool: "Write", filePath: plan });

  const found = await scanSidecarForPushableFiles(root, { contentDir: path.join(root, "content") });
  assert.deepEqual(found, [plan]);
});

test("scanSidecarForPushableFiles deduplicates repeated writes to same path", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = path.join(root, "plan.md");
  await writeFile(plan, longBody());

  // Same file touched by multiple Edits in the same session
  for (let i = 0; i < 3; i++) {
    await appendWriteSidecar(root, { tool: "Edit", filePath: plan });
  }

  const found = await scanSidecarForPushableFiles(root, { contentDir: null });
  assert.deepEqual(found, [plan]);
});

test("scanSidecarForPushableFiles excludes files under contentDir", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = path.join(root, "content");
  await mkdir(contentDir, { recursive: true });
  const entry = path.join(contentDir, "entry.md");
  await writeFile(entry, longBody());

  await appendWriteSidecar(root, { tool: "Write", filePath: entry });

  const found = await scanSidecarForPushableFiles(root, { contentDir });
  assert.deepEqual(found, []);
});

test("scanSidecarForPushableFiles filters below-threshold files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tiny = path.join(root, "tiny.md");
  await writeFile(tiny, "one line");

  await appendWriteSidecar(root, { tool: "Write", filePath: tiny });

  const found = await scanSidecarForPushableFiles(root, { contentDir: null });
  assert.deepEqual(found, []);
});

test("scanSidecarForPushableFiles filters non-pushable extensions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ts = path.join(root, "impl.ts");
  await writeFile(ts, longBody());

  await appendWriteSidecar(root, { tool: "Write", filePath: ts });

  const found = await scanSidecarForPushableFiles(root, { contentDir: null });
  assert.deepEqual(found, []);
});

test("scanSidecarForPushableFiles returns [] when sidecar missing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const found = await scanSidecarForPushableFiles(root, { contentDir: null });
  assert.deepEqual(found, []);
});

test("scanSidecarForPushableFiles skips malformed JSONL lines but keeps valid ones", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = path.join(root, "plan.md");
  await writeFile(plan, longBody());

  const sidecar = path.join(root, WRITE_SIDECAR);
  await writeFile(sidecar, [
    "not valid json",
    JSON.stringify({ ts: 1, tool: "Write", file_path: plan }),
    "{broken",
  ].join("\n"));

  const found = await scanSidecarForPushableFiles(root, { contentDir: null });
  assert.deepEqual(found, [plan]);
});

test("listPushedEntryPaths collects kind:file paths only", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-list-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, "1.md"), `---
title: "a"
kind: file
path: "/abs/one.md"
---
`);
  await writeFile(path.join(root, "2.md"), `---
title: "b"
kind: inline
---
some body`);
  await writeFile(path.join(root, "3.md"), `---
title: "c"
kind: file
path: /abs/three.md
---
`);

  const set = await listPushedEntryPaths(root);
  assert.equal(set.size, 2);
  assert.ok(set.has(path.normalize("/abs/one.md")));
  assert.ok(set.has(path.normalize("/abs/three.md")));
});

test("listPushedEntryPaths returns empty set for missing dir", async () => {
  const set = await listPushedEntryPaths("/no/such/content");
  assert.equal(set.size, 0);
});

test("buildStopBlockReason includes every missing path + kind:file example", () => {
  const r = buildStopBlockReason({
    missingPaths: ["/a/plan.md", "/b/spec.md"],
    contentDir: "/tmp/cc/content",
  });
  assert.match(r, /\/a\/plan\.md/);
  assert.match(r, /\/b\/spec\.md/);
  assert.match(r, /\/tmp\/cc\/content/);
  assert.match(r, /kind: file/);
  assert.match(r, /title:\s*"plan"/);
});

test("emitStopBlock output passes Stop schema", async () => {
  const j = await assertHookOutput("Stop", emitStopBlock("please push"));
  assert.equal(j.decision, "block");
  assert.equal(j.reason, "please push");
});

test("appendWriteSidecar line now carries event:write", async (t) => {
  const sessionDir = await mkdtemp(path.join(os.tmpdir(), "kcc-sc-"));
  t.after(() => rm(sessionDir, { recursive: true, force: true }));
  await appendWriteSidecar(sessionDir, { tool: "Write", filePath: "/abs/one.md" });
  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const line = JSON.parse(raw.trim().split("\n")[0]);
  assert.equal(line.event, "write");
  assert.equal(line.tool, "Write");
  assert.equal(line.file_path, path.normalize("/abs/one.md"));
});

test("appendTurnStart appends event:turn_start line", async (t) => {
  const sessionDir = await mkdtemp(path.join(os.tmpdir(), "kcc-ts-"));
  t.after(() => rm(sessionDir, { recursive: true, force: true }));
  const { appendTurnStart } = await import("../../scripts/lib/hook-core.mjs");
  await appendTurnStart(sessionDir);
  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const line = JSON.parse(raw.trim().split("\n")[0]);
  assert.equal(line.event, "turn_start");
  assert.ok(typeof line.ts === "number" && line.ts > 0);
});

test("appendAskUserQuestionEvent appends event:ask_user_question line", async (t) => {
  const sessionDir = await mkdtemp(path.join(os.tmpdir(), "kcc-aq-"));
  t.after(() => rm(sessionDir, { recursive: true, force: true }));
  const { appendAskUserQuestionEvent } = await import("../../scripts/lib/hook-core.mjs");
  await appendAskUserQuestionEvent(sessionDir);
  const raw = await readFile(path.join(sessionDir, WRITE_SIDECAR), "utf-8");
  const line = JSON.parse(raw.trim().split("\n")[0]);
  assert.equal(line.event, "ask_user_question");
});

test("appendTurnStart and appendAskUserQuestionEvent silently no-op on empty sessionDir", async () => {
  const { appendTurnStart, appendAskUserQuestionEvent } =
    await import("../../scripts/lib/hook-core.mjs");
  await appendTurnStart(null);
  await appendTurnStart("");
  await appendAskUserQuestionEvent(null);
  await appendAskUserQuestionEvent("");
});

test("matchReviewPath matches /specs/ and /plans/ substrings case-insensitively", async () => {
  const { matchReviewPath } = await import("../../scripts/lib/hook-core.mjs");
  assert.equal(matchReviewPath("/x/docs/specs/a.md"), true);
  assert.equal(matchReviewPath("/x/docs/plans/b.md"), true);
  assert.equal(matchReviewPath("/x/docs/feature-specs/c.md"), true);
  assert.equal(matchReviewPath("/x/archives/Plans/d.md"), true);  // case-insensitive
  assert.equal(matchReviewPath("/x/SPECS/e.md"), true);
  assert.equal(matchReviewPath("/x/docs/notes/f.md"), false);
  assert.equal(matchReviewPath("/x/README.md"), false);
  assert.equal(matchReviewPath("/x/CHANGELOG.md"), false);
  assert.equal(matchReviewPath("/x/specifications/g.md"), false);  // "specifications" lacks trailing "s" in "specs"
  assert.equal(matchReviewPath(""), false);
  assert.equal(matchReviewPath(null), false);
  assert.equal(matchReviewPath(undefined), false);
});

test("hasAskUserQuestionThisTurn finds event after last turn_start only", async (t) => {
  const { hasAskUserQuestionThisTurn, appendTurnStart, appendAskUserQuestionEvent, appendWriteSidecar } =
    await import("../../scripts/lib/hook-core.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-has-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  // Empty sidecar -> false
  assert.equal(await hasAskUserQuestionThisTurn(root), false);

  // Turn 1: turn_start + write + ask_user_question
  await appendTurnStart(root);
  await appendWriteSidecar(root, { tool: "Write", filePath: "/x/a.md" });
  await appendAskUserQuestionEvent(root);
  assert.equal(await hasAskUserQuestionThisTurn(root), true);

  // Turn 2: new turn_start, no ask_user_question after it -> false
  await appendTurnStart(root);
  await appendWriteSidecar(root, { tool: "Write", filePath: "/x/b.md" });
  assert.equal(await hasAskUserQuestionThisTurn(root), false);

  // Turn 3: new turn_start + ask_user_question -> true
  await appendTurnStart(root);
  await appendAskUserQuestionEvent(root);
  assert.equal(await hasAskUserQuestionThisTurn(root), true);
});

test("hasAskUserQuestionThisTurn without any turn_start -> false", async (t) => {
  const { hasAskUserQuestionThisTurn, appendAskUserQuestionEvent } =
    await import("../../scripts/lib/hook-core.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-has-nots-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  // If turn markers never came in (legacy session), we conservatively return false.
  await appendAskUserQuestionEvent(root);
  assert.equal(await hasAskUserQuestionThisTurn(root), false);
});
