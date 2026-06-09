import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saveSelection, loadSelection, pickSession, pickItem,
} from "../../scripts/frontend/selection.mjs";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test("saveSelection then loadSelection round-trips sid + itemId", () => {
  const s = fakeStorage();
  saveSelection(s, { sid: "abc", itemId: "item-1" });
  assert.deepEqual(loadSelection(s), { sid: "abc", itemId: "item-1" });
});

test("saveSelection persists null itemId (session with no items)", () => {
  const s = fakeStorage();
  saveSelection(s, { sid: "abc", itemId: null });
  assert.deepEqual(loadSelection(s), { sid: "abc", itemId: null });
});

test("saveSelection with no sid clears any stored selection", () => {
  const s = fakeStorage();
  saveSelection(s, { sid: "abc", itemId: "x" });
  saveSelection(s, { sid: null, itemId: null });
  assert.equal(loadSelection(s), null);
});

test("loadSelection returns null for empty / malformed / sid-less storage", () => {
  assert.equal(loadSelection(fakeStorage()), null);
  assert.equal(loadSelection(fakeStorage({ "kcc-preview:selection": "not json" })), null);
  assert.equal(loadSelection(fakeStorage({ "kcc-preview:selection": '{"itemId":"x"}' })), null);
});

test("save/load swallow storage exceptions (private mode / quota)", () => {
  const throwing = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => saveSelection(throwing, { sid: "a", itemId: "b" }));
  assert.equal(loadSelection(throwing), null);
});

test("pickSession keeps the saved session when it still exists", () => {
  const list = [{ sid: "new" }, { sid: "saved" }];
  assert.equal(pickSession({ sid: "saved", itemId: "x" }, list), "saved");
});

test("pickSession falls back to first session when saved one is gone", () => {
  const list = [{ sid: "new" }, { sid: "other" }];
  assert.equal(pickSession({ sid: "saved", itemId: "x" }, list), "new");
  assert.equal(pickSession(null, list), "new");
});

test("pickSession returns null when there are no sessions", () => {
  assert.equal(pickSession({ sid: "saved" }, []), null);
  assert.equal(pickSession(null, []), null);
});

test("pickItem keeps the saved item when it still exists", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(pickItem("b", items), "b");
});

test("pickItem falls back to the first (newest) item when saved one is gone", () => {
  const items = [{ id: "a" }, { id: "b" }];
  assert.equal(pickItem("gone", items), "a");
  assert.equal(pickItem(null, items), "a");
});

test("pickItem returns null for an empty session", () => {
  assert.equal(pickItem("a", []), null);
  assert.equal(pickItem(null, []), null);
});
