import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  listItems,
  readItem,
  addItem,
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
