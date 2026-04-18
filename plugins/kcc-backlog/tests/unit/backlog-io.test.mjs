import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  listItems,
  readItem,
  addItem,
  updateItem,
  moveToArchive,
  mergeInto,
  deleteItem,
} from "../../scripts/lib/backlog-io.mjs";

async function tmpBacklog() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-backlog-"));
  await mkdir(path.join(dir, "items"), { recursive: true });
  await mkdir(path.join(dir, "archive"), { recursive: true });
  return dir;
}

test("listItems returns empty array when items/ is empty", async () => {
  const dir = await tmpBacklog();
  try {
    const items = await listItems({ root: dir });
    assert.deepEqual(items, []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("addItem writes YAML frontmatter + body and returns the new id", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({
      root: dir,
      title: "Refactor auth middleware",
      priority: "medium",
      tags: ["refactor", "auth"],
      body: "Compliance push.",
      now: new Date("2026-04-17T10:00:00Z"),
    });
    assert.equal(id, "2026-04-17-refactor-auth-middleware");
    const raw = await readFile(path.join(dir, "items", `${id}.md`), "utf-8");
    assert.match(raw, /^---\n/);
    assert.match(raw, /\ntitle: Refactor auth middleware\n/);
    assert.match(raw, /\nstatus: pending\n/);
    assert.match(raw, /\npriority: medium\n/);
    assert.match(raw, /\ntags:\n  - refactor\n  - auth\n/);
    assert.match(raw, /\nCompliance push\.\n?$/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("addItem defaults priority to medium and tags to empty", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({ root: dir, title: "x", body: "", now: new Date("2026-04-17") });
    const item = await readItem({ root: dir, id });
    assert.equal(item.frontmatter.priority, "medium");
    assert.deepEqual(item.frontmatter.tags, []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("addItem collisions append -2, -3", async () => {
  const dir = await tmpBacklog();
  try {
    const now = new Date("2026-04-17");
    const a = await addItem({ root: dir, title: "same", body: "", now });
    const b = await addItem({ root: dir, title: "same", body: "", now });
    const c = await addItem({ root: dir, title: "same", body: "", now });
    assert.equal(a, "2026-04-17-same");
    assert.equal(b, "2026-04-17-same-2");
    assert.equal(c, "2026-04-17-same-3");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("readItem parses frontmatter and returns { frontmatter, body }", async () => {
  const dir = await tmpBacklog();
  try {
    await writeFile(
      path.join(dir, "items", "2026-04-17-x.md"),
      "---\nid: 2026-04-17-x\ntitle: X\nstatus: pending\npriority: high\ntags:\n  - t1\ncreated_at: 2026-04-17T00:00:00Z\nupdated_at: 2026-04-17T00:00:00Z\nrelated_items: []\n---\n\nhello body\n",
      "utf-8"
    );
    const item = await readItem({ root: dir, id: "2026-04-17-x" });
    assert.equal(item.frontmatter.id, "2026-04-17-x");
    assert.equal(item.frontmatter.title, "X");
    assert.equal(item.frontmatter.priority, "high");
    assert.deepEqual(item.frontmatter.tags, ["t1"]);
    assert.equal(item.body.trim(), "hello body");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("listItems returns a summary sorted by in_progress → priority → created_at desc", async () => {
  const dir = await tmpBacklog();
  try {
    const now = new Date("2026-04-17");
    const later = new Date("2026-04-18");
    const a = await addItem({ root: dir, title: "low-old", body: "", priority: "low", now });
    const b = await addItem({ root: dir, title: "high-new", body: "", priority: "high", now: later });
    const c = await addItem({ root: dir, title: "medium-new", body: "", priority: "medium", now: later });
    const rawPath = path.join(dir, "items", `${a}.md`);
    const raw = await readFile(rawPath, "utf-8");
    await writeFile(rawPath, raw.replace("status: pending", "status: in_progress"), "utf-8");

    const items = await listItems({ root: dir });
    assert.deepEqual(
      items.map((i) => i.id),
      [a, b, c]
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("updateItem rewrites frontmatter and bumps updated_at", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({ root: dir, title: "x", body: "body", now: new Date("2026-04-17") });
    const later = new Date("2026-04-18T12:00:00Z");
    await updateItem({ root: dir, id, patch: { status: "in_progress", priority: "high" }, now: later });
    const item = await readItem({ root: dir, id });
    assert.equal(item.frontmatter.status, "in_progress");
    assert.equal(item.frontmatter.priority, "high");
    assert.equal(item.frontmatter.updated_at, later.toISOString());
    assert.equal(item.body.trim(), "body");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("moveToArchive flips status, stamps closed_at, moves the file", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({ root: dir, title: "x", body: "", now: new Date("2026-04-17") });
    const done = new Date("2026-04-20T09:00:00Z");
    await moveToArchive({ root: dir, id, status: "done", now: done });
    const itemsListing = await listItems({ root: dir });
    assert.deepEqual(itemsListing, []);
    const archived = await readItem({ root: dir, id, dir: "archive" });
    assert.equal(archived.frontmatter.status, "done");
    assert.equal(archived.frontmatter.closed_at, done.toISOString());
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("mergeInto appends source body and related_items ref, then deletes source", async () => {
  const dir = await tmpBacklog();
  try {
    const now = new Date("2026-04-17");
    const target = await addItem({ root: dir, title: "target", body: "target-body", now });
    const source = await addItem({ root: dir, title: "src", body: "src-body", now });
    const later = new Date("2026-04-18");
    await mergeInto({ root: dir, targetId: target, sourceId: source, now: later });

    const item = await readItem({ root: dir, id: target });
    assert.ok(item.frontmatter.related_items.includes(source));
    assert.match(item.body, new RegExp(`## Merged from ${source}`));
    assert.match(item.body, /target-body/);
    assert.match(item.body, /src-body/);

    const listing = (await listItems({ root: dir })).map((i) => i.id);
    assert.deepEqual(listing, [target]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("deleteItem removes a file from items/", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({ root: dir, title: "x", body: "", now: new Date("2026-04-17") });
    await deleteItem({ root: dir, id });
    const listing = await listItems({ root: dir });
    assert.deepEqual(listing, []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../scripts/lib/backlog-io.mjs", import.meta.url));

function runCli(args, env = {}) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

test("CLI `list` on empty dir prints []", async () => {
  const dir = await tmpBacklog();
  try {
    const res = runCli(["list"], { KCC_BACKLOG_ROOT: dir });
    assert.equal(res.status, 0);
    assert.deepEqual(JSON.parse(res.stdout), []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("CLI `add` writes an item and prints { id }", async () => {
  const dir = await tmpBacklog();
  try {
    const res = runCli(
      ["add", "--title", "Cli test item", "--priority", "low", "--body", "hello"],
      { KCC_BACKLOG_ROOT: dir, KCC_BACKLOG_NOW: "2026-04-17T10:00:00Z" }
    );
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.id, "2026-04-17-cli-test-item");
    const items = await listItems({ root: dir });
    assert.equal(items.length, 1);
    assert.equal(items[0].priority, "low");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("CLI `root` prints the resolved backlog root path", async () => {
  const dir = await tmpBacklog();
  try {
    const res = runCli(["root"], { KCC_BACKLOG_ROOT: dir });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), dir);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("CLI `update --tags` replaces the tag list (comma-split, trimmed)", async () => {
  const dir = await tmpBacklog();
  try {
    const id = await addItem({
      root: dir,
      title: "tag test",
      tags: ["old"],
      body: "",
      now: new Date("2026-04-17"),
    });
    const res = runCli(
      ["update", "--id", id, "--tags", "a, b ,c"],
      { KCC_BACKLOG_ROOT: dir, KCC_BACKLOG_NOW: "2026-04-18T00:00:00Z" },
    );
    assert.equal(res.status, 0);
    const item = await readItem({ root: dir, id });
    assert.deepEqual(item.frontmatter.tags, ["a", "b", "c"]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
