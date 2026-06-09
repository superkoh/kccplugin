import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { watchContentDir } from "../../scripts/lib/watcher.mjs";

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test("watcher fires callback when a new .md file appears", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-watch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const entries = [];
  const unwatch = watchContentDir(dir, {
    onEntry: (e) => entries.push(e),
    onError: () => {},
  });
  t.after(() => unwatch());

  await writeFile(path.join(dir, "a.md"), `---
title: "A"
kind: inline
---
hi`);

  await waitFor(() => entries.length >= 1);
  assert.equal(entries[0].title, "A");
  assert.equal(entries[0].kind, "inline");
});

test("watcher debounces rapid writes to same filename", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-watch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const entries = [];
  const unwatch = watchContentDir(dir, {
    onEntry: (e) => entries.push(e),
    onError: () => {},
    debounceMs: 100,
  });
  t.after(() => unwatch());

  const file = path.join(dir, "b.md");
  for (let i = 0; i < 5; i++) {
    await writeFile(file, `---
title: "B${i}"
kind: inline
---
v${i}`);
  }

  await new Promise(r => setTimeout(r, 250));
  // At most a couple of debounced entries — exact count depends on fs event
  // coalescing, but the last one must be the final write.
  assert.ok(entries.length >= 1 && entries.length <= 5);
  assert.equal(entries[entries.length - 1].title, "B4");
});

test("watcher fires onRemove when a tracked entry file is deleted", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-watch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const entries = [], removed = [];
  const unwatch = watchContentDir(dir, {
    onEntry: (e) => entries.push(e),
    onRemove: (name) => removed.push(name),
    onError: () => {},
  });
  t.after(() => unwatch());

  const file = path.join(dir, "gone.md");
  await writeFile(file, `---
title: "Gone"
kind: inline
---
bye`);
  await waitFor(() => entries.length >= 1);

  await rm(file);
  await waitFor(() => removed.length >= 1);
  assert.equal(removed[0], "gone.md");
});

test("watcher does not fire onRemove twice for one deletion", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-watch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const removed = [];
  const unwatch = watchContentDir(dir, {
    onEntry: () => {},
    onRemove: (name) => removed.push(name),
    onError: () => {},
    pollIntervalMs: 100,
  });
  t.after(() => unwatch());

  const file = path.join(dir, "once.md");
  await writeFile(file, `---
title: "Once"
kind: inline
---
hi`);
  await new Promise((r) => setTimeout(r, 250));
  await rm(file);

  // Let both the fs.watch event and several poll ticks elapse — onRemove
  // must still have fired exactly once.
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(removed, ["once.md"]);
});

test("watcher skips files with parse errors but continues", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-watch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const entries = [], errors = [];
  const unwatch = watchContentDir(dir, {
    onEntry: (e) => entries.push(e),
    onError: (err) => errors.push(err),
  });
  t.after(() => unwatch());

  await writeFile(path.join(dir, "bad.md"), `not even frontmatter`);
  await writeFile(path.join(dir, "good.md"), `---
title: "Good"
kind: inline
---
hi`);

  await waitFor(() => entries.length >= 1 && errors.length >= 1);
  assert.equal(entries[0].title, "Good");
  assert.match(errors[0].message, /no frontmatter/);
});
