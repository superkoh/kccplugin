// In-memory item store with FIFO cap, dedup by path (kind=file) or by
// watched filename (any kind), and a simple pub-sub for change notifications.
// Server SSE subscribes here. Same-filename re-add updates in place — when
// Claude rewrites the same content/foo.md (or fs.watch fires twice on a
// single Write outside the watcher's debounce window), the sidebar shows
// one row whose body and updatedAt change, not two rows.

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

  function findBySource(source) {
    for (const id of order) {
      const it = items.get(id);
      if (it.source && it.source === source) return it;
    }
    return null;
  }

  return {
    add(entry) {
      let existing = null;
      if (entry.kind === "file" && entry.path) {
        existing = findByPath(entry.path);
      } else if (entry.source) {
        existing = findBySource(entry.source);
      }
      if (existing) {
        Object.assign(existing, entry, { updatedAt: Date.now() });
        emit({ type: "updated", item: existing });
        return existing;
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

export function createMultiStore() {
  const perSid = new Map();
  const listeners = new Set();

  function storeFor(sid) {
    let s = perSid.get(sid);
    if (!s) {
      s = createItemStore();
      // Forward per-sid events with sid annotation. Snapshot listeners before
      // iteration so subscribing-during-emit is safe (mirrors createItemStore).
      s.subscribe((ev) => {
        const out = { ...ev, sid };
        for (const fn of [...listeners]) {
          try { fn(out); } catch { /* ignore listener errors */ }
        }
      });
      perSid.set(sid, s);
    }
    return s;
  }

  return {
    add(sid, entry) { return storeFor(sid).add(entry); },
    get(sid, id) {
      const s = perSid.get(sid);
      return s ? s.get(id) : undefined;
    },
    list(sid) {
      const s = perSid.get(sid);
      return s ? s.list() : [];
    },
    listSessions() { return [...perSid.keys()]; },
    removeSession(sid) { perSid.delete(sid); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
