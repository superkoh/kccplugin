import { test } from "node:test";
import assert from "node:assert/strict";
import { createItemStore } from "../../scripts/lib/item-store.mjs";

test("add assigns sequential ids", () => {
  const s = createItemStore();
  const a = s.add({ kind: "inline", title: "A", body: "a" });
  const b = s.add({ kind: "inline", title: "B", body: "b" });
  assert.equal(typeof a.id, "string");
  assert.notEqual(a.id, b.id);
});

test("list returns newest first", () => {
  const s = createItemStore();
  s.add({ kind: "inline", title: "A", body: "a" });
  s.add({ kind: "inline", title: "B", body: "b" });
  const items = s.list();
  assert.equal(items[0].title, "B");
  assert.equal(items[1].title, "A");
});

test("get returns item by id", () => {
  const s = createItemStore();
  const a = s.add({ kind: "inline", title: "A", body: "a" });
  assert.equal(s.get(a.id).title, "A");
});

test("file kind dedupes by path", () => {
  const s = createItemStore();
  s.add({ kind: "file", title: "Old", path: "/x/y.md" });
  s.add({ kind: "file", title: "New", path: "/x/y.md" });
  const items = s.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "New");
});

test("inline kinds do not dedupe", () => {
  const s = createItemStore();
  s.add({ kind: "inline", title: "A", body: "v1" });
  s.add({ kind: "inline", title: "A", body: "v2" });
  assert.equal(s.list().length, 2);
});

test("FIFO cap at 200", () => {
  const s = createItemStore({ cap: 3 });
  s.add({ kind: "inline", title: "1", body: "" });
  s.add({ kind: "inline", title: "2", body: "" });
  s.add({ kind: "inline", title: "3", body: "" });
  s.add({ kind: "inline", title: "4", body: "" });
  const items = s.list();
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => i.title), ["4", "3", "2"]);
});

test("subscribe fires on add", () => {
  const s = createItemStore();
  const seen = [];
  s.subscribe((ev) => seen.push(ev));
  s.add({ kind: "inline", title: "A", body: "a" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, "added");
  assert.equal(seen[0].item.title, "A");
});

test("subscribe fires 'updated' on file dedup", () => {
  const s = createItemStore();
  s.add({ kind: "file", title: "Old", path: "/x/y.md" });
  const seen = [];
  s.subscribe((ev) => seen.push(ev));
  s.add({ kind: "file", title: "New", path: "/x/y.md" });
  assert.equal(seen[0].type, "updated");
});

test("unsubscribe stops events", () => {
  const s = createItemStore();
  const seen = [];
  const off = s.subscribe((ev) => seen.push(ev));
  off();
  s.add({ kind: "inline", title: "A", body: "a" });
  assert.equal(seen.length, 0);
});

test("subscriber throw does not break fan-out to other subscribers", () => {
  const s = createItemStore();
  const seen = [];
  s.subscribe(() => { throw new Error("boom"); });
  s.subscribe((ev) => seen.push(ev.item.title));
  s.add({ kind: "inline", title: "A", body: "" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0], "A");
});

test("subscribing during emit does not throw or corrupt iteration", () => {
  const s = createItemStore();
  const seen = [];
  s.subscribe(() => {
    s.subscribe((ev) => seen.push(ev.item.title));
  });
  s.add({ kind: "inline", title: "A", body: "" });
  s.add({ kind: "inline", title: "B", body: "" });
  // At least the second add's event reached the subscribe-during-emit-added listener.
  assert.ok(seen.includes("B"));
});
