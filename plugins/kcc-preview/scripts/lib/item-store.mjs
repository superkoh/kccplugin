// In-memory item store with FIFO cap, path-based dedup for kind:file, and
// a simple pub-sub for change notifications. Server SSE subscribes here.

import { randomUUID } from "node:crypto";

export function createItemStore({ cap = 200 } = {}) {
  const items = new Map();     // id -> item
  const order = [];            // newest first, holds ids
  const subscribers = new Set();

  function emit(ev) {
    // Snapshot subscribers before iteration so subscribing-during-emit is safe,
    // and isolate failures so one throwing subscriber does not break fan-out.
    for (const fn of [...subscribers]) {
      try { fn(ev); } catch { /* intentionally swallowed */ }
    }
  }

  function evict() {
    while (order.length > cap) {
      const id = order.pop();
      items.delete(id);
      emit({ type: "evicted", id });
    }
  }

  function findByPath(path) {
    for (const id of order) {
      const it = items.get(id);
      if (it.kind === "file" && it.path === path) return it;
    }
    return null;
  }

  return {
    add(entry) {
      if (entry.kind === "file" && entry.path) {
        const existing = findByPath(entry.path);
        if (existing) {
          Object.assign(existing, entry, { updatedAt: Date.now() });
          emit({ type: "updated", item: existing });
          return existing;
        }
      }
      const id = randomUUID();
      const item = { id, createdAt: Date.now(), ...entry };
      items.set(id, item);
      order.unshift(id);
      evict();
      emit({ type: "added", item });
      return item;
    },
    get(id) { return items.get(id); },
    list() {
      return order.map(id => items.get(id)).filter(Boolean);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
