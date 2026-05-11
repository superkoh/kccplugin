import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRootWatcher } from "../../scripts/lib/root-watcher.mjs";

function once(ms) { return new Promise((r) => setTimeout(r, ms)); }

test("emits session-discovered when a sid dir appears", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-rw-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const events = [];
  const stop = createRootWatcher(root, {
    onEvent: (e) => events.push(e),
    tickMs: 50,
  });
  t.after(stop);

  await mkdir(path.join(root, "sid-x", "content"), { recursive: true });
  await once(120);
  assert.ok(events.some((e) => e.type === "session-discovered" && e.sid === "sid-x"));
});

test("emits session-labeled only after label.txt + content present", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-rw-lab-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const events = [];
  const stop = createRootWatcher(root, { onEvent: (e) => events.push(e), tickMs: 50 });
  t.after(stop);

  const sd = path.join(root, "sid-y");
  await mkdir(path.join(sd, "content"), { recursive: true });
  await once(80);
  assert.equal(events.filter((e) => e.type === "session-labeled").length, 0);

  await writeFile(path.join(sd, "content", "0001.md"), "---\ntitle: Hi\nkind: inline\n---\nbody\n");
  await writeFile(path.join(sd, "label.txt"), "My session");
  await once(120);
  const lab = events.filter((e) => e.type === "session-labeled");
  assert.equal(lab.length, 1);
  assert.equal(lab[0].sid, "sid-y");
  assert.equal(lab[0].label, "My session");
});

test("ignores empty or oversize label.txt", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-rw-bad-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const events = [];
  const stop = createRootWatcher(root, { onEvent: (e) => events.push(e), tickMs: 50 });
  t.after(stop);

  const sd = path.join(root, "sid-z");
  await mkdir(path.join(sd, "content"), { recursive: true });
  await writeFile(path.join(sd, "content", "0001.md"), "---\ntitle: X\nkind: inline\n---\nbody\n");
  await writeFile(path.join(sd, "label.txt"), "");
  await once(120);
  assert.equal(events.filter((e) => e.type === "session-labeled").length, 0);

  await writeFile(path.join(sd, "label.txt"), "x".repeat(100));
  await once(120);
  assert.equal(events.filter((e) => e.type === "session-labeled").length, 0);
});

test("emits session-removed when sid dir disappears", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-rw-rem-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const events = [];
  const stop = createRootWatcher(root, { onEvent: (e) => events.push(e), tickMs: 50 });
  t.after(stop);

  const sd = path.join(root, "sid-r");
  await mkdir(path.join(sd, "content"), { recursive: true });
  await once(80);
  await rm(sd, { recursive: true, force: true });
  await once(120);
  assert.ok(events.some((e) => e.type === "session-removed" && e.sid === "sid-r"));
});
