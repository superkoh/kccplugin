import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, buildReminderContext,
} from "../../scripts/lib/hook-core.mjs";

test("sessionDirFor concatenates session_id under root", async () => {
  const root = "/tmp/x";
  assert.equal(sessionDirFor(root, "abc-123"), "/tmp/x/abc-123");
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
