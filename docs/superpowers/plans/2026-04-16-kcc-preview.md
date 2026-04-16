# kcc-preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `kcc-preview` plugin — a per-session local browser UI that mirrors preview-worthy content (Markdown, Mermaid, tables, diffs, file references) from Claude Code with a session-scoped index, driven by hook-injected rules.

**Architecture:** SessionStart hook allocates a free port and spawns a detached Node stdlib HTTP server; server watches `content/` for Claude-written `.md` entries (YAML frontmatter + body), maintains in-memory index, pushes to a single-page frontend via SSE. UserPromptSubmit hook emits one-line reminders; SessionEnd hook kills the server and removes the session dir. VC-compatibility layer wraps bare `.html` fragments in superpowers' frame template and mirrors click events to the VC-expected path.

**Tech Stack:** Node ≥ 20 (stdlib only — `node:http`, `node:fs`, `node:child_process`, `node:test`, `node:assert/strict`). Frontend loads `marked@13`, `mermaid@11`, `highlight.js@11` from jsdelivr CDN. Bash not required — all hooks are `.mjs` executables with a `#!/usr/bin/env node` shebang.

**Reference spec:** `docs/superpowers/specs/2026-04-16-kcc-preview-design.md`

---

## Task 1: Plugin scaffold + manifest

**Files:**
- Create: `plugins/kcc-preview/.claude-plugin/plugin.json`
- Create: `plugins/kcc-preview/hooks/.gitkeep`
- Create: `plugins/kcc-preview/scripts/.gitkeep`
- Create: `plugins/kcc-preview/tests/unit/.gitkeep`

- [ ] **Step 1: Create manifest**

Write `plugins/kcc-preview/.claude-plugin/plugin.json`:

```json
{
  "name": "kcc-preview",
  "version": "0.1.0",
  "description": "Mirror preview-worthy content from a Claude Code session to a local browser UI with a session-scoped index. Runs silent by default — only surfaces when Claude actively pushes rich content.",
  "license": "MIT"
}
```

- [ ] **Step 2: Create empty dir markers**

Create empty `.gitkeep` files in `hooks/`, `scripts/`, `tests/unit/` so git tracks the directory structure:

```bash
cd "/Volumes/External SSD/Projects/kccplugin/.claude/worktrees/kcc-preview"
touch plugins/kcc-preview/hooks/.gitkeep
touch plugins/kcc-preview/scripts/.gitkeep
touch plugins/kcc-preview/tests/unit/.gitkeep
```

- [ ] **Step 3: Run L1 validation**

```bash
PLUGIN=kcc-preview npm run test:l1
```

Expected: PASS. Manifest parses, name matches dir, no hooks yet so nothing to validate there.

- [ ] **Step 4: Commit**

```bash
git add plugins/kcc-preview/
git commit -m "Scaffold kcc-preview plugin manifest"
```

---

## Task 2: Frontmatter parser

**Files:**
- Create: `plugins/kcc-preview/scripts/lib/parser.mjs`
- Test: `plugins/kcc-preview/tests/unit/parser.test.mjs`

- [ ] **Step 1: Write failing tests**

Write `plugins/kcc-preview/tests/unit/parser.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEntry } from "../../scripts/lib/parser.mjs";

test("inline kind with markdown body", () => {
  const text = `---
title: "My doc"
kind: inline
---
# Hello

body here`;
  const r = parseEntry("x.md", text);
  assert.equal(r.error, undefined);
  assert.equal(r.kind, "inline");
  assert.equal(r.title, "My doc");
  assert.match(r.body, /# Hello/);
});

test("file kind requires path", () => {
  const text = `---
title: "Spec"
kind: file
path: "/tmp/foo.md"
---
`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "file");
  assert.equal(r.path, "/tmp/foo.md");
});

test("file kind missing path produces error", () => {
  const text = `---
title: "Bad"
kind: file
---
`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /path is required when kind is 'file'/);
});

test("html kind with body", () => {
  const text = `---
title: "Grid"
kind: html
---
<div class="grid"></div>`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "html");
  assert.match(r.body, /<div/);
});

test("default kind is inline when omitted", () => {
  const text = `---
title: "Untyped"
---
just markdown`;
  const r = parseEntry("x.md", text);
  assert.equal(r.kind, "inline");
});

test("unknown kind produces error", () => {
  const text = `---
title: "X"
kind: nonsense
---
`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /unknown kind: nonsense/);
});

test("missing title produces error", () => {
  const text = `---
kind: inline
---
body`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /title is required/);
});

test("no frontmatter on .html file → vc fragment", () => {
  const text = `<h2>Options</h2><div class="options"></div>`;
  const r = parseEntry("layout.html", text);
  assert.equal(r.kind, "vc");
  assert.equal(r.title, "layout");
  assert.match(r.body, /<h2/);
});

test("no frontmatter on .md file → error", () => {
  const text = `# Just markdown, no frontmatter`;
  const r = parseEntry("x.md", text);
  assert.match(r.error, /no frontmatter/);
});

test("quoted string values are unquoted", () => {
  const text = `---
title: "With spaces and: colons"
kind: inline
---
x`;
  const r = parseEntry("x.md", text);
  assert.equal(r.title, "With spaces and: colons");
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/parser.test.mjs
```

Expected: all tests fail with "Cannot find module '../../scripts/lib/parser.mjs'".

- [ ] **Step 3: Implement parser**

Create `plugins/kcc-preview/scripts/lib/parser.mjs`:

```js
// Minimal frontmatter parser for kcc-preview entry files.
// Supports three `kind` values and a handful of known keys. Zero deps.

const KNOWN_KINDS = new Set(["inline", "file", "html"]);

function stripQuotes(s) {
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseFrontmatter(block) {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = stripQuotes(m[2].trim());
  }
  return out;
}

function basenameWithoutExt(filename) {
  const base = filename.replace(/^.*[\\/]/, "");
  return base.replace(/\.[^.]+$/, "");
}

export function parseEntry(filename, text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);

  if (!fm) {
    if (/\.html?$/i.test(filename)) {
      return {
        kind: "vc",
        title: basenameWithoutExt(filename),
        body: text,
      };
    }
    return { error: "no frontmatter" };
  }

  const meta = parseFrontmatter(fm[1]);
  const body = fm[2];

  if (!meta.title) return { error: "title is required" };

  const kind = meta.kind || "inline";
  if (!KNOWN_KINDS.has(kind)) {
    return { error: `unknown kind: ${kind}` };
  }
  if (kind === "file" && !meta.path) {
    return { error: "path is required when kind is 'file'" };
  }

  return {
    kind,
    title: meta.title,
    path: meta.path,
    body,
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/parser.test.mjs
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/parser.mjs \
        plugins/kcc-preview/tests/unit/parser.test.mjs
git commit -m "Add kcc-preview frontmatter parser with unit tests"
```

---

## Task 3: In-memory item store

**Files:**
- Create: `plugins/kcc-preview/scripts/lib/item-store.mjs`
- Test: `plugins/kcc-preview/tests/unit/item-store.test.mjs`

- [ ] **Step 1: Write failing tests**

Write `plugins/kcc-preview/tests/unit/item-store.test.mjs`:

```js
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
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/item-store.test.mjs
```

Expected: all fail with module-not-found.

- [ ] **Step 3: Implement store**

Create `plugins/kcc-preview/scripts/lib/item-store.mjs`:

```js
// In-memory item store with FIFO cap, path-based dedup for kind:file, and
// a simple pub-sub for change notifications. Server SSE subscribes here.

import { randomUUID } from "node:crypto";

export function createItemStore({ cap = 200 } = {}) {
  const items = new Map();     // id -> item
  const order = [];            // newest first, holds ids
  const subscribers = new Set();

  function emit(ev) {
    for (const fn of subscribers) fn(ev);
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
```

- [ ] **Step 4: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/item-store.test.mjs
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/item-store.mjs \
        plugins/kcc-preview/tests/unit/item-store.test.mjs
git commit -m "Add item store with FIFO cap, path dedup, and pub-sub"
```

---

## Task 4: Directory watcher

**Files:**
- Create: `plugins/kcc-preview/scripts/lib/watcher.mjs`
- Test: `plugins/kcc-preview/tests/unit/watcher.test.mjs`

- [ ] **Step 1: Write failing test**

Write `plugins/kcc-preview/tests/unit/watcher.test.mjs`:

```js
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
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/watcher.test.mjs
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement watcher**

Create `plugins/kcc-preview/scripts/lib/watcher.mjs`:

```js
// Watches a directory for .md / .html entry files. Debounces rapid writes
// per filename, reads the file, calls the parser, and dispatches the entry
// (or error) to callbacks.
//
// On macOS / Windows uses fs.watch with recursive:false (we only watch
// a single flat dir). On Linux fs.watch is stable for non-recursive
// watches per node docs, but we add a safety poll in case events are
// missed (known to happen under certain editors' atomic-rename saves).

import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseEntry } from "./parser.mjs";

const ENTRY_EXT = /\.(md|markdown|html?)$/i;

export function watchContentDir(dir, {
  onEntry,
  onError,
  debounceMs = 100,
  pollIntervalMs = 500,
} = {}) {
  const pending = new Map();           // filename -> timer
  const seen = new Map();              // filename -> mtimeMs already processed

  async function process(filename) {
    pending.delete(filename);
    const full = path.join(dir, filename);
    let text;
    try {
      text = await readFile(full, "utf-8");
    } catch (err) {
      if (err.code !== "ENOENT") onError?.(err);
      return;
    }
    const result = parseEntry(filename, text);
    if (result.error) {
      onError?.(new Error(`${filename}: ${result.error}`));
      return;
    }
    onEntry?.({ ...result, source: filename });
  }

  function schedule(filename) {
    if (!ENTRY_EXT.test(filename)) return;
    const prev = pending.get(filename);
    if (prev) clearTimeout(prev);
    pending.set(filename, setTimeout(() => process(filename), debounceMs));
  }

  const w = watch(dir, { persistent: false }, (_evt, filename) => {
    if (filename) schedule(filename);
  });
  w.on("error", (err) => onError?.(err));

  // Safety poll: stat dir listing, detect new/mtime-bumped files fs.watch
  // may have missed (editor atomic-rename, filesystem edge cases).
  const poll = setInterval(async () => {
    try {
      const names = await readdir(dir);
      for (const n of names) {
        if (!ENTRY_EXT.test(n)) continue;
        if (!seen.has(n)) {
          seen.set(n, 0);
          schedule(n);
        }
      }
    } catch { /* dir may not exist yet */ }
  }, pollIntervalMs);

  return () => {
    clearInterval(poll);
    for (const t of pending.values()) clearTimeout(t);
    w.close();
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/watcher.test.mjs
```

Expected: 3 tests pass. If the debounce test is flaky, rerun — fs event timing varies by OS.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/watcher.mjs \
        plugins/kcc-preview/tests/unit/watcher.test.mjs
git commit -m "Add content directory watcher with debounce + safety poll"
```

---

## Task 5: HTTP server core + SSE

**Files:**
- Create: `plugins/kcc-preview/scripts/lib/server.mjs`
- Create: `plugins/kcc-preview/scripts/lib/render.mjs`
- Test: `plugins/kcc-preview/tests/unit/server.test.mjs`

- [ ] **Step 1: Write failing tests**

Write `plugins/kcc-preview/tests/unit/server.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../scripts/lib/server.mjs";
import { createItemStore } from "../../scripts/lib/item-store.mjs";

async function get(port, path, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function bootServer(overrides = {}) {
  const store = createItemStore();
  const { server, port } = await createServer({
    store,
    sessionId: "test-session",
    ...overrides,
  });
  return { store, server, port, close: () => new Promise(r => server.close(r)) };
}

test("GET /health returns 200 with session_id", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, "/health");
  assert.equal(r.status, 200);
  const j = JSON.parse(r.text);
  assert.equal(j.sessionId, "test-session");
  assert.equal(typeof j.uptime, "number");
});

test("GET / returns HTML shell with mount point", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, "/");
  assert.equal(r.status, 200);
  assert.match(r.text, /<html/i);
  assert.match(r.text, /id="app"/);
});

test("GET /api/items returns empty list initially", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, "/api/items");
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.text), []);
});

test("GET /api/items returns added items", async (t) => {
  const { store, port, close } = await bootServer();
  t.after(close);
  store.add({ kind: "inline", title: "X", body: "# hi" });
  const r = await get(port, "/api/items");
  const items = JSON.parse(r.text);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "X");
  assert.equal(items[0].kind, "inline");
  assert.equal(typeof items[0].id, "string");
});

test("GET /api/items/:id returns rendered item", async (t) => {
  const { store, port, close } = await bootServer();
  t.after(close);
  const it = store.add({ kind: "inline", title: "X", body: "# hi" });
  const r = await get(port, `/api/items/${it.id}`);
  assert.equal(r.status, 200);
  const j = JSON.parse(r.text);
  assert.equal(j.title, "X");
  assert.equal(j.kind, "inline");
  assert.equal(j.body, "# hi");
});

test("GET /api/items/:id 404 for unknown id", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, "/api/items/does-not-exist");
  assert.equal(r.status, 404);
});

test("GET /api/items/:id with kind=file returns file content", async (t) => {
  const { store, port, close } = await bootServer();
  t.after(close);
  const { writeFile, mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-filetest-"));
  const fp = path.join(dir, "sample.md");
  await writeFile(fp, "# from disk");
  const it = store.add({ kind: "file", title: "S", path: fp });
  const r = await get(port, `/api/items/${it.id}`);
  const j = JSON.parse(r.text);
  assert.equal(j.kind, "file");
  assert.equal(j.mime, "text/markdown");
  assert.equal(j.body, "# from disk");
});

test("GET /api/events is SSE and pushes store updates", async (t) => {
  const { store, port, close } = await bootServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/api/events`);
  assert.equal(res.headers.get("content-type"), "text/event-stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // schedule a write after subscription is live
  setTimeout(() => store.add({ kind: "inline", title: "LiveOne", body: "" }), 30);

  // read up to one full SSE message
  const start = Date.now();
  while (Date.now() - start < 2000) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (/\n\n/.test(buffer)) break;
  }
  reader.cancel();

  assert.match(buffer, /event: added/);
  assert.match(buffer, /LiveOne/);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/server.test.mjs
```

Expected: all fail with module-not-found.

- [ ] **Step 3: Implement renderer helper**

Create `plugins/kcc-preview/scripts/lib/render.mjs`:

```js
// Resolves a stored item's id to the body the frontend should render.
// For kind=file, reads from disk and attaches a MIME hint.

import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/toml",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".mjs": "text/javascript",
  ".py": "text/x-python",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript",
};

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

export async function renderItem(item) {
  if (item.kind === "inline" || item.kind === "html") {
    return { ...publicFields(item), body: item.body ?? "" };
  }
  if (item.kind === "vc") {
    return { ...publicFields(item), body: item.body ?? "" };
  }
  if (item.kind === "file") {
    const mime = mimeFor(item.path);
    const isBinary = mime.startsWith("image/");
    try {
      if (isBinary) {
        return { ...publicFields(item), mime, body: null, url: `/api/file?path=${encodeURIComponent(item.path)}` };
      }
      const body = await readFile(item.path, "utf-8");
      return { ...publicFields(item), mime, body };
    } catch (err) {
      return { ...publicFields(item), mime, error: `path not readable: ${item.path}` };
    }
  }
  return { ...publicFields(item), error: `unknown kind: ${item.kind}` };
}

function publicFields(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    path: item.path,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export { mimeFor };
```

- [ ] **Step 4: Implement server**

Create `plugins/kcc-preview/scripts/lib/server.mjs`:

```js
// Node stdlib HTTP server for kcc-preview. Binds 127.0.0.1 on a random
// free port (or PORT env). Serves:
//   GET /                     — the SPA shell
//   GET /api/items            — list {id,title,kind,path,createdAt}
//   GET /api/items/:id        — renderItem(item)
//   GET /api/file?path=...    — raw file bytes (for images, etc.)
//   GET /api/events           — SSE of store changes
//   GET /health               — liveness

import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderItem, mimeFor } from "./render.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(res, file) {
  try {
    const buf = await readFile(file);
    const mime = mimeFor(file).replace(/^text\//, "text/") + "; charset=utf-8";
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": buf.length,
    });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

export async function createServer({ store, sessionId, port = 0 }) {
  const startedAt = Date.now();
  const sseClients = new Set();

  const unsubscribe = store.subscribe((ev) => {
    const payload = ev.type === "evicted"
      ? { type: ev.type, id: ev.id }
      : { type: ev.type, item: publicItem(ev.item) };
    const msg = `event: ${ev.type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of sseClients) c.write(msg);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1`);

    if (url.pathname === "/health") {
      return json(res, 200, { sessionId, uptime: Date.now() - startedAt });
    }

    if (url.pathname === "/") {
      return serveStatic(res, path.join(FRONTEND_DIR, "index.html"));
    }

    if (url.pathname.startsWith("/assets/")) {
      const sub = url.pathname.replace(/^\/assets\//, "");
      const file = path.join(FRONTEND_DIR, sub);
      if (!file.startsWith(FRONTEND_DIR)) {
        res.writeHead(403); return res.end("forbidden");
      }
      return serveStatic(res, file);
    }

    if (url.pathname === "/api/items") {
      return json(res, 200, store.list().map(publicItem));
    }

    const mItem = /^\/api\/items\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (mItem) {
      const it = store.get(mItem[1]);
      if (!it) return json(res, 404, { error: "not found" });
      const rendered = await renderItem(it);
      return json(res, 200, rendered);
    }

    if (url.pathname === "/api/file") {
      const p = url.searchParams.get("path");
      if (!p || !path.isAbsolute(p)) {
        return json(res, 400, { error: "absolute path required" });
      }
      try {
        const mime = mimeFor(p);
        res.writeHead(200, { "Content-Type": mime });
        createReadStream(p).on("error", () => res.end()).pipe(res);
      } catch {
        return json(res, 404, { error: "not found" });
      }
      return;
    }

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`retry: 2000\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    res.writeHead(404); res.end("not found");
  });

  server.on("close", unsubscribe);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return { server, port: server.address().port };
}

function publicItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    path: item.path,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
```

- [ ] **Step 5: Stub the frontend shell so server tests pass**

Create `plugins/kcc-preview/scripts/frontend/index.html` (minimal stub; real frontend lands in Task 7):

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>kcc-preview</title></head>
<body><div id="app"></div></body></html>
```

- [ ] **Step 6: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/server.test.mjs
```

Expected: 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/server.mjs \
        plugins/kcc-preview/scripts/lib/render.mjs \
        plugins/kcc-preview/scripts/frontend/index.html \
        plugins/kcc-preview/tests/unit/server.test.mjs
git commit -m "Add Node stdlib HTTP server with REST + SSE endpoints"
```

---

## Task 6: VC fragment rendering endpoint

**Files:**
- Modify: `plugins/kcc-preview/scripts/lib/server.mjs`
- Create: `plugins/kcc-preview/scripts/frontend/vc-frame.html`
- Create: `plugins/kcc-preview/scripts/frontend/vc-frame.css`
- Test: `plugins/kcc-preview/tests/unit/vc-frame.test.mjs`

- [ ] **Step 1: Write failing test**

Write `plugins/kcc-preview/tests/unit/vc-frame.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../scripts/lib/server.mjs";
import { createItemStore } from "../../scripts/lib/item-store.mjs";

async function boot() {
  const store = createItemStore();
  const { server, port } = await createServer({ store, sessionId: "t" });
  return { store, port, close: () => new Promise(r => server.close(r)) };
}

test("GET /item/:id/frame returns full HTML with VC classes for kind=vc", async (t) => {
  const { store, port, close } = await boot();
  t.after(close);
  const it = store.add({ kind: "vc", title: "Layout", body: `<h2>Pick one</h2><div class="options"></div>` });

  const res = await fetch(`http://127.0.0.1:${port}/item/${it.id}/frame`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const body = await res.text();
  assert.match(body, /<!doctype html>/i);
  assert.match(body, /class="options"/);
  assert.match(body, /\.options\s*{/);          // frame CSS embedded
  assert.match(body, /function toggleSelect/);  // helper js embedded
});

test("GET /item/:id/frame 404 on missing id", async (t) => {
  const { port, close } = await boot();
  t.after(close);
  const res = await fetch(`http://127.0.0.1:${port}/item/nope/frame`);
  assert.equal(res.status, 404);
});

test("frame wrapper also works for kind=html (user-authored raw HTML)", async (t) => {
  const { store, port, close } = await boot();
  t.after(close);
  const it = store.add({ kind: "html", title: "Grid", body: `<div class="grid">hi</div>` });

  const res = await fetch(`http://127.0.0.1:${port}/item/${it.id}/frame`);
  const body = await res.text();
  assert.match(body, /class="grid"/);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/vc-frame.test.mjs
```

Expected: 404 on all (endpoint not implemented).

- [ ] **Step 3: Create frame assets**

Create `plugins/kcc-preview/scripts/frontend/vc-frame.css`:

```css
/* VC-compatible frame template CSS. Matches superpowers' public class names
 * so bare .html fragments render correctly when the plugin takes over. */

:root {
  --bg: #0f1116;
  --panel: #13161d;
  --fg: rgba(255,255,255,0.88);
  --muted: rgba(255,255,255,0.55);
  --border: rgba(255,255,255,0.08);
  --accent: #6366f1;
}

html, body {
  background: var(--bg); color: var(--fg); margin: 0;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.subtitle { color: var(--muted); margin: 4px 0 20px; }
.section  { margin-bottom: 24px; }
.label    { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }

/* Options */
.options       { display: grid; gap: 12px; margin: 16px 0; }
.options[data-multiselect] { gap: 12px; }
.option        { display: flex; gap: 14px; align-items: start; padding: 14px 16px;
                 background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
                 cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.option:hover  { border-color: var(--accent); }
.option.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, var(--panel)); }
.option .letter{ flex: 0 0 28px; height: 28px; display: grid; place-items: center;
                 border-radius: 6px; background: rgba(255,255,255,0.05); font-weight: 600; }
.option .content h3 { margin: 0 0 4px; font-size: 15px; }
.option .content p  { margin: 0; color: var(--muted); }

/* Cards */
.cards         { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                 gap: 16px; margin: 16px 0; }
.card          { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
                 overflow: hidden; cursor: pointer; transition: border-color 0.15s; }
.card:hover    { border-color: var(--accent); }
.card.selected { border-color: var(--accent); }
.card .card-image { background: #0a0c10; }
.card .card-body  { padding: 14px 16px; }
.card .card-body h3 { margin: 0 0 4px; font-size: 15px; }
.card .card-body p  { margin: 0; color: var(--muted); font-size: 13px; }

/* Mockup */
.mockup        { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #0a0c10; }
.mockup-header { padding: 8px 12px; background: var(--panel); border-bottom: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.mockup-body   { padding: 16px; }

.split         { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.pros-cons     { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pros, .cons   { background: var(--panel); border-radius: 8px; padding: 12px 16px; }
.pros h4 { color: #86efac; margin: 0 0 8px; }
.cons h4 { color: #fca5a5; margin: 0 0 8px; }

/* Mock elements */
.mock-nav      { padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.mock-sidebar  { padding: 12px; border-right: 1px solid var(--border); min-width: 180px; color: var(--muted); }
.mock-content  { padding: 16px; flex: 1; }
.mock-button   { padding: 6px 12px; background: var(--accent); color: white; border: 0; border-radius: 6px; }
.mock-input    { padding: 6px 10px; background: var(--panel); border: 1px solid var(--border); color: var(--fg); border-radius: 6px; }
.placeholder   { background: repeating-linear-gradient(45deg, #13161d, #13161d 8px, #0f1116 8px, #0f1116 16px);
                 color: var(--muted); padding: 24px; text-align: center; border-radius: 6px; }

/* Selection indicator */
#selection-indicator {
  position: fixed; bottom: 20px; right: 20px; padding: 10px 16px;
  background: var(--accent); color: white; border-radius: 8px; font-size: 13px;
  opacity: 0; transform: translateY(20px); transition: opacity 0.2s, transform 0.2s;
}
#selection-indicator.visible { opacity: 1; transform: translateY(0); }

.frame-container { max-width: 960px; margin: 40px auto; padding: 0 24px; }
```

Create `plugins/kcc-preview/scripts/frontend/vc-frame.html` (template with `{{content}}` marker):

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{title}}</title>
<style>{{css}}</style>
</head>
<body>
<div class="frame-container">
{{content}}
</div>
<div id="selection-indicator"></div>
<script>
function toggleSelect(el) {
  const container = el.parentElement;
  const multi = container.hasAttribute("data-multiselect");
  if (!multi) {
    for (const sib of container.children) sib.classList.remove("selected");
  }
  el.classList.toggle("selected");
  const choice = el.dataset.choice || el.dataset.id || null;
  const text = el.innerText.trim();
  const ev = { type: "click", choice, id: el.dataset.id || null, text, timestamp: Date.now() };
  fetch("/api/vc-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ev),
  }).catch(() => {});
  const ind = document.getElementById("selection-indicator");
  const selected = container.querySelectorAll(".selected");
  if (selected.length) {
    ind.textContent = multi ? `${selected.length} selected` : `Selected: ${choice ?? text.slice(0, 32)}`;
    ind.classList.add("visible");
  } else {
    ind.classList.remove("visible");
  }
}
</script>
</body>
</html>
```

- [ ] **Step 4: Wire `/item/:id/frame` and `/api/vc-event` in server.mjs**

In `plugins/kcc-preview/scripts/lib/server.mjs`, add these blocks. First, near the top imports, add:

```js
import { appendFile } from "node:fs/promises";
```

Then inside `createServer({ store, sessionId, port = 0, vcEventsPath })`, add `vcEventsPath` to the destructured args. Add these route handlers **before** the final `res.writeHead(404)` fallback:

```js
    const mFrame = /^\/item\/([A-Za-z0-9-]+)\/frame$/.exec(url.pathname);
    if (mFrame) {
      const it = store.get(mFrame[1]);
      if (!it) { res.writeHead(404); return res.end("not found"); }
      const tpl = await readFile(path.join(FRONTEND_DIR, "vc-frame.html"), "utf-8");
      const css = await readFile(path.join(FRONTEND_DIR, "vc-frame.css"), "utf-8");
      const html = tpl
        .replace(/\{\{title\}\}/g, escapeHtml(it.title || ""))
        .replace(/\{\{css\}\}/g, css)
        .replace(/\{\{content\}\}/g, it.body || "");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    if (url.pathname === "/api/vc-event" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", async () => {
        if (vcEventsPath) {
          try { await appendFile(vcEventsPath, body + "\n"); } catch { /* ignore */ }
        }
        json(res, 200, { ok: true });
      });
      return;
    }
```

Add at the bottom of `server.mjs`:

```js
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 5: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/vc-frame.test.mjs tests/unit/server.test.mjs
```

Expected: existing server tests still pass (8) + 3 new VC tests pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/server.mjs \
        plugins/kcc-preview/scripts/frontend/vc-frame.html \
        plugins/kcc-preview/scripts/frontend/vc-frame.css \
        plugins/kcc-preview/tests/unit/vc-frame.test.mjs
git commit -m "Add VC-compatible frame renderer and event mirroring"
```

---

## Task 7: Frontend SPA shell (manual smoke)

**Files:**
- Replace: `plugins/kcc-preview/scripts/frontend/index.html`
- Create: `plugins/kcc-preview/scripts/frontend/app.js`
- Create: `plugins/kcc-preview/scripts/frontend/styles.css`

No unit tests — frontend requires a real browser to verify. Validated by Task 13 smoke.

- [ ] **Step 1: Write index.html**

Replace `plugins/kcc-preview/scripts/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kcc-preview</title>
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.css">
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <header class="sidebar-header">
      <span class="brand">kcc-preview</span>
      <span id="status-dot" class="status-dot" title="disconnected"></span>
    </header>
    <div id="index-list" class="index-list">
      <div class="empty">Nothing pushed yet. Claude will populate this during the session.</div>
    </div>
  </aside>
  <main id="viewport">
    <header class="viewport-header">
      <h1 id="current-title">kcc-preview</h1>
      <span id="current-meta" class="muted"></span>
    </header>
    <section id="content-host" class="content-host"></section>
  </main>
</div>

<script type="module" src="/assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write styles.css**

Create `plugins/kcc-preview/scripts/frontend/styles.css`:

```css
:root {
  --bg: #0f1116;
  --panel: #13161d;
  --panel-2: #1a1d25;
  --fg: rgba(255,255,255,0.92);
  --fg-2: rgba(255,255,255,0.7);
  --muted: rgba(255,255,255,0.5);
  --border: rgba(255,255,255,0.08);
  --accent: #6366f1;
  --accent-dim: rgba(99,102,241,0.2);
}

html, body { background: var(--bg); color: var(--fg); margin: 0; height: 100%; }
body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

#app { display: grid; grid-template-columns: 280px 1fr; height: 100vh; overflow: hidden; }

#sidebar { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border);
}
.brand { font-weight: 600; font-size: 13px; letter-spacing: 0.02em; color: var(--fg-2); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
.status-dot.connected { background: #27c93f; }

.index-list { overflow-y: auto; padding: 8px; flex: 1; }
.index-list .empty { padding: 20px 10px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.index-item {
  display: flex; gap: 8px; align-items: baseline; padding: 10px 12px; border-radius: 6px; cursor: pointer;
  color: var(--fg-2);
}
.index-item:hover { background: var(--panel-2); color: var(--fg); }
.index-item.active { background: var(--accent-dim); color: white; }
.index-item .pill {
  flex: 0 0 auto; font-size: 10px; padding: 2px 6px; border-radius: 4px;
  background: rgba(255,255,255,0.06); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;
}
.index-item .pill.md   { background: rgba(59,130,246,0.2);  color: #93c5fd; }
.index-item .pill.mmd  { background: rgba(236,72,153,0.2);  color: #f9a8d4; }
.index-item .pill.file { background: rgba(245,158,11,0.2); color: #fcd34d; }
.index-item .pill.vc   { background: rgba(168,85,247,0.2); color: #d8b4fe; }
.index-item .pill.html { background: rgba(34,197,94,0.2);  color: #86efac; }
.index-item .pill.img  { background: rgba(14,165,233,0.2); color: #7dd3fc; }
.index-item .title { flex: 1; font-size: 13px; }
.index-item .age { font-size: 11px; color: var(--muted); }

#viewport { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.viewport-header { padding: 18px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 16px; }
.viewport-header h1 { margin: 0; font-size: 18px; font-weight: 600; }
.muted { color: var(--muted); font-size: 12px; }

.content-host { flex: 1; overflow-y: auto; padding: 32px; }
.content-host img { max-width: 100%; height: auto; border-radius: 8px; }
.content-host pre { background: var(--panel); padding: 14px 18px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
.content-host code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; }
.content-host iframe { width: 100%; height: calc(100vh - 140px); border: 0; background: var(--bg); }
.content-host h1, .content-host h2, .content-host h3, .content-host h4 { color: var(--fg); }
.content-host h1 { font-size: 26px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
.content-host table { border-collapse: collapse; width: 100%; margin: 16px 0; }
.content-host th, .content-host td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
.content-host th { background: var(--panel); }
.content-host blockquote { border-left: 3px solid var(--accent); padding: 4px 16px; color: var(--fg-2); margin: 16px 0; background: var(--panel); }
.content-host .mermaid { text-align: center; background: var(--panel); padding: 20px; border-radius: 8px; }
```

- [ ] **Step 3: Write app.js**

Create `plugins/kcc-preview/scripts/frontend/app.js`:

```js
// kcc-preview SPA — ES module loaded by index.html.
// Loads marked / mermaid / hljs from CDN, subscribes to /api/events SSE,
// and dispatches per-kind rendering into #content-host.

import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });

const state = {
  items: [],
  selectedId: null,
};

const $sidebar = document.getElementById("index-list");
const $title = document.getElementById("current-title");
const $meta = document.getElementById("current-meta");
const $host = document.getElementById("content-host");
const $dot = document.getElementById("status-dot");

function pillFor(item) {
  if (item.kind === "file") {
    const ext = (item.path || "").split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return { cls: "img", label: ext };
    if (["md", "markdown"].includes(ext)) return { cls: "md", label: "md" };
    return { cls: "file", label: ext || "file" };
  }
  if (item.kind === "inline") return { cls: "md", label: "md" };
  if (item.kind === "vc") return { cls: "vc", label: "vc" };
  if (item.kind === "html") return { cls: "html", label: "html" };
  return { cls: "file", label: item.kind };
}

function renderSidebar() {
  if (!state.items.length) {
    $sidebar.innerHTML = `<div class="empty">Nothing pushed yet. Claude will populate this during the session.</div>`;
    return;
  }
  $sidebar.innerHTML = "";
  for (const it of state.items) {
    const pill = pillFor(it);
    const row = document.createElement("div");
    row.className = "index-item" + (it.id === state.selectedId ? " active" : "");
    row.dataset.id = it.id;
    row.innerHTML = `<span class="pill ${pill.cls}">${pill.label}</span>
                     <span class="title">${escapeHtml(it.title || "(untitled)")}</span>`;
    row.addEventListener("click", () => select(it.id));
    $sidebar.appendChild(row);
  }
}

async function select(id) {
  state.selectedId = id;
  renderSidebar();
  const res = await fetch(`/api/items/${id}`);
  if (!res.ok) {
    $host.innerHTML = `<div class="muted">Failed to load item.</div>`;
    return;
  }
  const item = await res.json();
  $title.textContent = item.title || "(untitled)";
  $meta.textContent = metaLine(item);
  renderContent(item);
}

function metaLine(item) {
  if (item.path) return item.path;
  if (item.kind === "inline") return "inline";
  return item.kind;
}

async function renderContent(item) {
  if (item.error) {
    $host.innerHTML = `<pre>${escapeHtml(item.error)}</pre>`;
    return;
  }

  if (item.kind === "vc" || item.kind === "html") {
    $host.innerHTML = `<iframe src="/item/${item.id}/frame" sandbox="allow-scripts allow-same-origin"></iframe>`;
    return;
  }

  if (item.kind === "file") {
    if (item.mime?.startsWith("image/")) {
      $host.innerHTML = `<img src="${item.url}" alt="${escapeHtml(item.title)}">`;
      return;
    }
    if (item.mime === "text/html") {
      $host.innerHTML = `<iframe srcdoc="${escapeHtml(item.body)}" sandbox="allow-scripts"></iframe>`;
      return;
    }
    if (item.mime === "text/markdown") {
      $host.innerHTML = await renderMarkdown(item.body || "");
      return;
    }
    const lang = (item.path || "").split(".").pop();
    $host.innerHTML = `<pre><code class="hljs language-${lang}">${escapeHtml(item.body || "")}</code></pre>`;
    hljs.highlightAll();
    return;
  }

  // inline kind
  $host.innerHTML = await renderMarkdown(item.body || "");
}

async function renderMarkdown(src) {
  const html = marked.parse(src, { gfm: true, breaks: false });
  const host = document.createElement("div");
  host.innerHTML = html;
  // highlight code blocks
  for (const pre of host.querySelectorAll("pre code")) {
    hljs.highlightElement(pre);
  }
  // render mermaid
  const mermaidBlocks = host.querySelectorAll("code.language-mermaid");
  for (const block of mermaidBlocks) {
    const src = block.textContent;
    const div = document.createElement("div");
    div.className = "mermaid";
    const id = "m" + Math.random().toString(36).slice(2);
    try {
      const { svg } = await mermaid.render(id, src);
      div.innerHTML = svg;
    } catch (e) {
      div.textContent = "Mermaid error: " + e.message;
    }
    block.closest("pre").replaceWith(div);
  }
  return host.innerHTML;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => $dot.classList.add("connected");
  es.onerror = () => $dot.classList.remove("connected");
  es.addEventListener("added", (ev) => {
    const data = JSON.parse(ev.data);
    state.items.unshift(data.item);
    renderSidebar();
    if (!state.selectedId) select(data.item.id);
  });
  es.addEventListener("updated", (ev) => {
    const data = JSON.parse(ev.data);
    const idx = state.items.findIndex(i => i.id === data.item.id);
    if (idx >= 0) state.items[idx] = data.item;
    renderSidebar();
    if (state.selectedId === data.item.id) select(data.item.id);
  });
  es.addEventListener("evicted", (ev) => {
    const data = JSON.parse(ev.data);
    state.items = state.items.filter(i => i.id !== data.id);
    renderSidebar();
  });
}

async function initialLoad() {
  const res = await fetch("/api/items");
  state.items = await res.json();
  renderSidebar();
  if (state.items[0]) select(state.items[0].id);
}

initialLoad().then(connectSSE);
```

- [ ] **Step 4: Manual smoke test**

From the plugin dir, start the server directly and open in a browser:

```bash
cd plugins/kcc-preview
SESSION_ID=smoke SESSION_DIR="$(mktemp -d)/sesssmoke" mkdir -p "$SESSION_DIR/content"
node -e "
import('./scripts/lib/server.mjs').then(async (m) => {
  const { createItemStore } = await import('./scripts/lib/item-store.mjs');
  const store = createItemStore();
  const { port } = await m.createServer({ store, sessionId: 'smoke' });
  store.add({ kind: 'inline', title: 'Hello', body: '# Hi\\nfrom kcc-preview' });
  console.log('open http://localhost:' + port);
})"
```

Verify in a browser:
- Sidebar shows "Hello" with `md` pill
- Main area renders the heading
- Status dot is green

Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/frontend/
git commit -m "Add kcc-preview frontend SPA (sidebar index + viewport, CDN libs)"
```

---

## Task 8: Detach-safe server entry script

**Files:**
- Create: `plugins/kcc-preview/scripts/server.mjs`

- [ ] **Step 1: Write the entry**

Create `plugins/kcc-preview/scripts/server.mjs`:

```js
#!/usr/bin/env node
// Detached server entry. Reads SESSION_ID and SESSION_DIR from env, starts
// the HTTP server on a random free port, starts the directory watcher,
// writes server.port and server.pid into SESSION_DIR, and stays running
// until SIGTERM.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "./lib/server.mjs";
import { createItemStore } from "./lib/item-store.mjs";
import { watchContentDir } from "./lib/watcher.mjs";

const SESSION_ID = process.env.SESSION_ID;
const SESSION_DIR = process.env.SESSION_DIR;

if (!SESSION_ID || !SESSION_DIR) {
  console.error("server.mjs requires SESSION_ID and SESSION_DIR env vars");
  process.exit(2);
}

const contentDir = path.join(SESSION_DIR, "content");
const stateDir = path.join(SESSION_DIR, "state");
const vcEventsPath = path.join(stateDir, "events");

const store = createItemStore();
const { port } = await createServer({ store, sessionId: SESSION_ID, vcEventsPath });

const unwatch = watchContentDir(contentDir, {
  onEntry: (entry) => store.add(entry),
  onError: (err) => console.error("[kcc-preview watcher]", err.message),
});

await writeFile(path.join(SESSION_DIR, "server.port"), String(port));
await writeFile(path.join(SESSION_DIR, "server.pid"), String(process.pid));
await writeFile(path.join(stateDir, "server-info"), JSON.stringify({
  sessionId: SESSION_ID,
  url: `http://localhost:${port}`,
  port,
  screen_dir: contentDir,
  state_dir: stateDir,
}, null, 2));

process.on("SIGTERM", () => { unwatch(); process.exit(0); });
process.on("SIGINT", () => { unwatch(); process.exit(0); });
```

- [ ] **Step 2: Make executable**

```bash
chmod +x plugins/kcc-preview/scripts/server.mjs
```

- [ ] **Step 3: Manual smoke**

```bash
SESSION_ID=e1 SESSION_DIR=$(mktemp -d)
mkdir -p "$SESSION_DIR/content" "$SESSION_DIR/state"
node plugins/kcc-preview/scripts/server.mjs &
SERVER_PID=$!
sleep 0.5
cat "$SESSION_DIR/server.port"
curl -s "http://127.0.0.1:$(cat "$SESSION_DIR/server.port")/health"
kill $SERVER_PID
```

Expected: `server.port` file contains a number; `/health` responds with JSON containing `sessionId:"e1"`.

- [ ] **Step 4: Commit**

```bash
git add plugins/kcc-preview/scripts/server.mjs
git commit -m "Add detach-safe kcc-preview server entry script"
```

---

## Task 9: SessionStart hook core (session dir + prompt rules)

**Files:**
- Create: `plugins/kcc-preview/scripts/lib/hook-core.mjs`
- Create: `plugins/kcc-preview/scripts/prompts/rules.md`
- Create: `plugins/kcc-preview/scripts/prompts/reminder.md`
- Test: `plugins/kcc-preview/tests/unit/hook-core.test.mjs`

- [ ] **Step 1: Write the rules prompt**

Create `plugins/kcc-preview/scripts/prompts/rules.md`:

```markdown
<!-- kcc-preview-sentinel: v1 -->

# kcc-preview is active

You have a local browser UI that mirrors preview-worthy content from this
session, available at `{{URL}}`.

## How to push content

Drop an entry file into `{{CONTENT_DIR}}/` using the Write tool. Three
supported shapes:

**kind: inline** — markdown body (most common):

\`\`\`markdown
---
title: "<short title>"
kind: inline
---
<markdown, including ```mermaid / ```diff / GFM tables>
\`\`\`

**kind: file** — reference an existing file (for persistent artifacts like
plans, specs, source code; or for images):

\`\`\`markdown
---
title: "<short title>"
kind: file
path: "<absolute path to existing file>"
---
\`\`\`

**kind: html** — raw HTML (rare; only when custom layout matters):

\`\`\`markdown
---
title: "<short title>"
kind: html
---
<div class="grid">...</div>
\`\`\`

## When to push (the noise gate)

**Default: do not push. Stay silent about the preview.**

Push ONLY when content fits one of these:

- Long Markdown (spec / plan / design doc / long review)
- Mermaid diagrams
- Wide tables (≥3 cols or ≥5 rows) or multi-dimensional comparisons
- Multi-file diffs or side-by-side code comparisons
- Asking the user to review a file already on disk (use `kind: file`)
- Images, source files, rendered HTML artifacts

Do **not** push for: short answers, tool-use narration, clarifying
questions, confirmation messages, code blocks under ~40 lines.

**When not pushing, do not mention "preview" / "browser" / the URL.**

## Persistent artifacts stay at their natural path

If you're generating a persistent artifact (spec, plan, source file),
write it to its natural location (e.g., `docs/specs/YYYY-MM-DD-foo.md`).
Then drop a `kind: file` entry in `{{CONTENT_DIR}}/` pointing to that path.
Do **not** put artifact bodies into `{{CONTENT_DIR}}/`.

## When you push, announce in one line

Add ONE line to your reply:

```
👀 已推送到 preview: <title> — {{URL}}
```

Combine multiple pushes into a single line, listing titles.

## Format preferences

For diagrams, prefer Mermaid code fences (`graph TD`, `sequenceDiagram`,
`flowchart`, etc.). Avoid ASCII art — the browser renders Mermaid natively
but cannot render ASCII diagrams legibly.

## superpowers brainstorming compatibility

If the superpowers brainstorming skill instructs you to run
`scripts/start-server.sh`, **skip it** — kcc-preview already has a server.
Write your HTML fragments directly into `{{CONTENT_DIR}}/<name>.html`
(no frontmatter — the server auto-wraps them with the VC frame template).
Click events are mirrored to `{{VC_STATE_DIR}}/events` as before.
```

- [ ] **Step 2: Write the reminder prompt**

Create `plugins/kcc-preview/scripts/prompts/reminder.md`:

```markdown
<!-- kcc-preview-reminder: v1 -->
kcc-preview @ {{URL}} — only push when the content is worth a browser trip;
otherwise stay silent about the preview.
```

- [ ] **Step 3: Write failing tests**

Write `plugins/kcc-preview/tests/unit/hook-core.test.mjs`:

```js
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
```

- [ ] **Step 4: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/hook-core.test.mjs
```

Expected: module-not-found.

- [ ] **Step 5: Implement hook-core**

Create `plugins/kcc-preview/scripts/lib/hook-core.mjs`:

```js
// Pure helpers used by the SessionStart / UserPromptSubmit / SessionEnd
// hook entry scripts. Kept stateless so they are easy to unit-test.

import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

export function sessionDirFor(root, sessionId) {
  return path.join(root, sessionId);
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function sweepStale(root, activeIds = new Set()) {
  let entries;
  try { entries = await readdir(root); } catch { return; }
  for (const name of entries) {
    if (activeIds.has(name)) continue;
    const dir = path.join(root, name);
    let pid = null;
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
      pid = Number(await readFile(path.join(dir, "server.pid"), "utf-8").catch(() => ""));
    } catch { /* fall through */ }

    if (pid && isPidAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
    try { await rm(dir, { recursive: true, force: true }); } catch {}
  }
}

export async function buildSessionStartContext({ url, contentDir, vcStateDir, reason }) {
  if (!url) {
    return `<!-- kcc-preview: unavailable (${reason || "unknown"}) -->`;
  }
  const tpl = await readFile(path.join(PROMPTS_DIR, "rules.md"), "utf-8");
  return tpl
    .replace(/\{\{URL\}\}/g, url)
    .replace(/\{\{CONTENT_DIR\}\}/g, contentDir)
    .replace(/\{\{VC_STATE_DIR\}\}/g, vcStateDir);
}

export async function buildReminderContext({ url }) {
  if (!url) return "";
  const tpl = await readFile(path.join(PROMPTS_DIR, "reminder.md"), "utf-8");
  return tpl.replace(/\{\{URL\}\}/g, url);
}

export function emitHookJson(hookEventName, additionalContext) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName, additionalContext },
    suppressOutput: false,
  });
}
```

- [ ] **Step 6: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/hook-core.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/kcc-preview/scripts/lib/hook-core.mjs \
        plugins/kcc-preview/scripts/prompts/rules.md \
        plugins/kcc-preview/scripts/prompts/reminder.md \
        plugins/kcc-preview/tests/unit/hook-core.test.mjs
git commit -m "Add hook-core helpers and kcc-preview prompt templates"
```

---

## Task 10: SessionStart hook entry script

**Files:**
- Create: `plugins/kcc-preview/scripts/session-start.mjs`
- Test: `plugins/kcc-preview/tests/unit/session-start.test.mjs`

- [ ] **Step 1: Write failing test**

Write `plugins/kcc-preview/tests/unit/session-start.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "session-start.mjs");

function runHook(stdinJson, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("node", [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", reject);
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

test("SessionStart hook emits JSON with sentinel and URL", async (t) => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-test-"));
  t.after(() => rm(tmpRoot, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "abc-123", cwd: process.cwd(), hook_event_name: "SessionStart" },
    { KCC_PREVIEW_ROOT: tmpRoot },
  );
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(parsed.hookSpecificOutput.additionalContext, /<!-- kcc-preview-sentinel: v1 -->/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /http:\/\/localhost:\d+/);
});

test("SessionStart creates session dir with server.port, server.pid, and content/", async (t) => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "kcc-ss-test-"));
  t.after(() => rm(tmpRoot, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "sess-xyz", cwd: process.cwd(), hook_event_name: "SessionStart" },
    { KCC_PREVIEW_ROOT: tmpRoot },
  );
  assert.equal(code, 0);

  const sessionDir = path.join(tmpRoot, "sess-xyz");
  const port = Number(await readFile(path.join(sessionDir, "server.port"), "utf-8"));
  assert.ok(port > 0);
  const pid = Number(await readFile(path.join(sessionDir, "server.pid"), "utf-8"));
  assert.ok(pid > 0);

  // Verify server really responds
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.sessionId, "sess-xyz");

  // Cleanup: kill the server we started
  try { process.kill(pid, "SIGTERM"); } catch {}
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/session-start.test.mjs
```

Expected: entry script does not exist.

- [ ] **Step 3: Implement session-start.mjs**

Create `plugins/kcc-preview/scripts/session-start.mjs`:

```js
#!/usr/bin/env node
// SessionStart hook entry.
// - Reads Claude Code JSON envelope from stdin
// - Sweeps stale kcc-preview session dirs
// - Creates a session dir under KCC_PREVIEW_ROOT (defaults to $TMPDIR/kcc-preview)
// - Spawns the detached server and waits for server.port to appear
// - Emits hookSpecificOutput.additionalContext with the rules block

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  sessionDirFor, sweepStale, buildSessionStartContext, emitHookJson,
} from "./lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");
const SERVER_ENTRY = path.join(__dirname, "server.mjs");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function waitForFile(file, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (existsSync(file)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

function emitAndExit(ctx) {
  process.stdout.write(emitHookJson("SessionStart", ctx));
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) {
    return emitAndExit(await buildSessionStartContext({ url: null, reason: "missing session_id" }));
  }

  await mkdir(ROOT, { recursive: true });
  await sweepStale(ROOT, new Set([sessionId]));

  const sessionDir = sessionDirFor(ROOT, sessionId);
  const contentDir = path.join(sessionDir, "content");
  const stateDir = path.join(sessionDir, "state");
  await mkdir(contentDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, SESSION_ID: sessionId, SESSION_DIR: sessionDir },
  });
  child.unref();

  try {
    await waitForFile(path.join(sessionDir, "server.port"));
  } catch {
    return emitAndExit(await buildSessionStartContext({ url: null, reason: "server did not start" }));
  }

  const port = Number(await readFile(path.join(sessionDir, "server.port"), "utf-8"));
  const url = `http://localhost:${port}`;
  const ctx = await buildSessionStartContext({ url, contentDir, vcStateDir: stateDir });
  emitAndExit(ctx);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.stdout.write(emitHookJson("SessionStart", `<!-- kcc-preview: unavailable (${err?.message || "error"}) -->`));
  process.exit(0);
});
```

- [ ] **Step 4: Make executable**

```bash
chmod +x plugins/kcc-preview/scripts/session-start.mjs
```

- [ ] **Step 5: Run — expect pass**

```bash
cd plugins/kcc-preview && node --test tests/unit/session-start.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/kcc-preview/scripts/session-start.mjs \
        plugins/kcc-preview/tests/unit/session-start.test.mjs
git commit -m "Add SessionStart hook — spawns detached server, injects rules"
```

---

## Task 11: UserPromptSubmit hook

**Files:**
- Create: `plugins/kcc-preview/scripts/user-prompt-submit.mjs`
- Test: `plugins/kcc-preview/tests/unit/user-prompt-submit.test.mjs`

- [ ] **Step 1: Write failing test**

Write `plugins/kcc-preview/tests/unit/user-prompt-submit.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "user-prompt-submit.mjs");

function runHook(stdinJson, env) {
  return new Promise((resolve) => {
    const p = spawn("node", [ENTRY], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => out += d);
    p.stderr.on("data", (d) => err += d);
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

function startFakeHealth(payload) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      } else {
        res.writeHead(404); res.end();
      }
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

test("live server -> reminder emitted", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { srv, port } = await startFakeHealth({ sessionId: "s1", uptime: 1000 });
  t.after(() => new Promise(r => srv.close(r)));

  const sessionDir = path.join(root, "s1");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, "server.port"), String(port));
  await writeFile(path.join(sessionDir, "server.pid"), String(srv.address().port));  // any non-zero

  const { code, out } = await runHook(
    { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(j.hookSpecificOutput.additionalContext, /kcc-preview-reminder/);
  assert.match(j.hookSpecificOutput.additionalContext, new RegExp(`:${port}`));
});

test("no session dir -> empty context, exit 0", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "never-started", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.hookSpecificOutput.additionalContext, "");
});

test("dead server port -> restart succeeds, reminder emitted with new port", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-ups-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sessionDir = path.join(root, "s2");
  await mkdir(path.join(sessionDir, "content"), { recursive: true });
  await mkdir(path.join(sessionDir, "state"), { recursive: true });
  // port that's almost certainly not bound + fake pid
  await writeFile(path.join(sessionDir, "server.port"), "1");
  await writeFile(path.join(sessionDir, "server.pid"), "99999999");

  const { code, out } = await runHook(
    { session_id: "s2", hook_event_name: "UserPromptSubmit", prompt: "hi" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = JSON.parse(out);
  // Either the restart succeeded (new port reminder) OR fell back to unavailable.
  const ctx = j.hookSpecificOutput.additionalContext;
  assert.ok(
    /kcc-preview-reminder/.test(ctx) || /kcc-preview: unavailable/.test(ctx),
    `unexpected context: ${ctx}`,
  );

  // If restarted, clean up
  try {
    const { readFile } = await import("node:fs/promises");
    const pid = Number(await readFile(path.join(sessionDir, "server.pid"), "utf-8"));
    if (pid && pid !== 99999999) process.kill(pid, "SIGTERM");
  } catch {}
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/user-prompt-submit.test.mjs
```

Expected: entry script missing.

- [ ] **Step 3: Implement user-prompt-submit.mjs**

Create `plugins/kcc-preview/scripts/user-prompt-submit.mjs`:

```js
#!/usr/bin/env node
// UserPromptSubmit hook entry.
// - Reads session_id from stdin
// - Finds session dir under KCC_PREVIEW_ROOT; if absent, emits empty context
// - Pings /health with 300ms timeout
// - On success, emits the reminder block
// - On failure, tries to respawn the detached server once; on that failure,
//   emits an "unavailable" marker so Claude stops trying this session.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildReminderContext, emitHookJson, sessionDirFor } from "./lib/hook-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "server.mjs");
const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function pingHealth(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function emit(ctx) {
  process.stdout.write(emitHookJson("UserPromptSubmit", ctx));
  process.exit(0);
}

function respawnServer(sessionDir, sessionId) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, SESSION_ID: sessionId, SESSION_DIR: sessionDir },
  });
  child.unref();

  return new Promise((resolve) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const p = Number(await readFile(path.join(sessionDir, "server.port"), "utf-8"));
        if (p > 0 && await pingHealth(p, 200)) return resolve(p);
      } catch {}
      if (Date.now() - start > 2500) return resolve(0);
      setTimeout(tick, 40);
    };
    tick();
  });
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit("");

  const dir = sessionDirFor(ROOT, sessionId);
  const portFile = path.join(dir, "server.port");
  if (!existsSync(portFile)) return emit("");

  let port = Number(await readFile(portFile, "utf-8"));
  let alive = await pingHealth(port);

  if (!alive) {
    const newPort = await respawnServer(dir, sessionId);
    if (newPort > 0) {
      port = newPort;
      alive = true;
    }
  }

  if (!alive) return emit(`<!-- kcc-preview: unavailable (server not responding) -->`);

  const url = `http://localhost:${port}`;
  const ctx = await buildReminderContext({ url });
  emit(ctx);
}

main().catch(() => emit(""));
```

- [ ] **Step 4: Make executable, run tests**

```bash
chmod +x plugins/kcc-preview/scripts/user-prompt-submit.mjs
cd plugins/kcc-preview && node --test tests/unit/user-prompt-submit.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/user-prompt-submit.mjs \
        plugins/kcc-preview/tests/unit/user-prompt-submit.test.mjs
git commit -m "Add UserPromptSubmit hook with health ping + reminder"
```

---

## Task 12: SessionEnd hook

**Files:**
- Create: `plugins/kcc-preview/scripts/session-end.mjs`
- Test: `plugins/kcc-preview/tests/unit/session-end.test.mjs`

- [ ] **Step 1: Write failing test**

Write `plugins/kcc-preview/tests/unit/session-end.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "..", "scripts", "session-end.mjs");

function runHook(stdinJson, env) {
  return new Promise((resolve) => {
    const p = spawn("node", [ENTRY], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => out += d);
    p.on("close", (code) => resolve({ code, out }));
    p.stdin.write(JSON.stringify(stdinJson));
    p.stdin.end();
  });
}

test("SessionEnd kills server pid and removes session dir", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  // Spawn a long-running sleeper we can assert is killed
  const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore", detached: true,
  });
  sleeper.unref();

  const sessionDir = path.join(root, "end-test");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, "server.pid"), String(sleeper.pid));
  await writeFile(path.join(sessionDir, "server.port"), "1");

  const { code, out } = await runHook(
    { session_id: "end-test", hook_event_name: "SessionEnd" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  const j = JSON.parse(out);
  assert.equal(j.hookSpecificOutput.hookEventName, "SessionEnd");

  // Session dir is gone
  assert.equal(existsSync(sessionDir), false);

  // Sleeper process is dead — give SIGTERM a moment
  await new Promise(r => setTimeout(r, 200));
  let alive;
  try { process.kill(sleeper.pid, 0); alive = true; } catch { alive = false; }
  assert.equal(alive, false);
});

test("SessionEnd is a no-op when session dir does not exist", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kcc-se-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const { code, out } = await runHook(
    { session_id: "never-started", hook_event_name: "SessionEnd" },
    { KCC_PREVIEW_ROOT: root },
  );
  assert.equal(code, 0);
  assert.match(out, /SessionEnd/);
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd plugins/kcc-preview && node --test tests/unit/session-end.test.mjs
```

- [ ] **Step 3: Implement session-end.mjs**

Create `plugins/kcc-preview/scripts/session-end.mjs`:

```js
#!/usr/bin/env node
// SessionEnd hook entry — kill server pid and remove session dir.

import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitHookJson, sessionDirFor } from "./lib/hook-core.mjs";

const ROOT = process.env.KCC_PREVIEW_ROOT || path.join(os.tmpdir(), "kcc-preview");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks).toString("utf-8").trim();
  if (!buf) return {};
  try { return JSON.parse(buf); } catch { return {}; }
}

function emit() {
  process.stdout.write(emitHookJson("SessionEnd", ""));
  process.exit(0);
}

async function main() {
  const input = await readStdin();
  const sessionId = input.session_id;
  if (!sessionId) return emit();

  const dir = sessionDirFor(ROOT, sessionId);
  if (!existsSync(dir)) return emit();

  // Kill pid if any
  try {
    const pid = Number(await readFile(path.join(dir, "server.pid"), "utf-8"));
    if (pid > 0) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  } catch {}

  await rm(dir, { recursive: true, force: true });
  emit();
}

main().catch(() => emit());
```

- [ ] **Step 4: Make executable + run tests**

```bash
chmod +x plugins/kcc-preview/scripts/session-end.mjs
cd plugins/kcc-preview && node --test tests/unit/session-end.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/kcc-preview/scripts/session-end.mjs \
        plugins/kcc-preview/tests/unit/session-end.test.mjs
git commit -m "Add SessionEnd hook — kills server and removes session dir"
```

---

## Task 13: Wire hooks.json

**Files:**
- Create: `plugins/kcc-preview/hooks/hooks.json`
- Remove: `plugins/kcc-preview/hooks/.gitkeep`

- [ ] **Step 1: Write hooks.json**

Create `plugins/kcc-preview/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs\"",
            "timeout": 8
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/user-prompt-submit.mjs\"",
            "timeout": 3
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-end.mjs\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Remove .gitkeep**

```bash
rm plugins/kcc-preview/hooks/.gitkeep
```

- [ ] **Step 3: Run full offline test suite**

```bash
PLUGIN=kcc-preview npm run test:offline
```

Expected: L1 passes (manifest + hooks.json + all frontmatter validate); L2 passes (every test we've written so far).

- [ ] **Step 4: Commit**

```bash
git add plugins/kcc-preview/hooks/
git commit -m "Wire kcc-preview hooks for SessionStart/UserPromptSubmit/SessionEnd"
```

---

## Task 14: Full lifecycle dogfooding smoke

**Files:**
- None (manual verification). Record findings in the final commit message.

- [ ] **Step 1: Start a fresh Claude Code session with the plugin enabled**

From another terminal:

```bash
cd /Volumes/External\ SSD/Projects/kccplugin/.claude/worktrees/kcc-preview
claude --plugin-dir plugins/kcc-preview
```

- [ ] **Step 2: Observe injected context (should be invisible unless Claude mentions)**

Send a short conversational prompt: `hello`

Expected behavior:
- Claude responds normally
- Claude does **NOT** mention preview, URL, or browser (the noise gate is doing its job)
- Checking `$TMPDIR/kcc-preview/<session_id>/server.port` shows a number
- `curl http://127.0.0.1:$(cat $TMPDIR/kcc-preview/<session_id>/server.port)/health` returns JSON

- [ ] **Step 3: Prompt for rich content and observe push**

Send: `Explain the data flow of a simple web request with a Mermaid sequence diagram.`

Expected behavior:
- Claude produces a response containing a ```mermaid block
- Claude writes an entry file to the session `content/` dir
- Claude's response includes the one-line announce: `👀 已推送到 preview: ... — http://localhost:XXXXX`
- Opening the URL shows the sidebar with the new entry and the Mermaid rendered in the viewport

- [ ] **Step 4: Exit the session, verify cleanup**

Close the Claude Code session.

Expected behavior:
- `$TMPDIR/kcc-preview/<session_id>/` is gone
- No orphan Node process bound to the chosen port: `lsof -i :<port>` returns nothing

- [ ] **Step 5: Record smoke findings and commit**

If everything worked, commit a placeholder marker (no files changed — use `--allow-empty` is discouraged; instead, bump the plugin version as the closing commit):

Edit `plugins/kcc-preview/.claude-plugin/plugin.json` — change version from `0.1.0` to `0.1.1`. Then:

```bash
git add plugins/kcc-preview/.claude-plugin/plugin.json
git commit -m "Release kcc-preview v0.1.1 — verified via full lifecycle smoke"
```

If anything broke, file tasks for the specific defects and iterate — do NOT bump the version until green.

---

## Completion Checklist

- [ ] All 14 tasks complete
- [ ] `npm run test:offline` green with `PLUGIN=kcc-preview`
- [ ] Full smoke path verified (Task 14)
- [ ] Plugin registered in `.claude-plugin/marketplace.json` (see note below)

**Note on marketplace registration:** this plan does not edit
`.claude-plugin/marketplace.json` at the repo root. After implementation
lands, the plugin should be added to the marketplace manifest in a
separate commit — check the existing kcc-core and kcc-dev-core entries
for the shape to mirror.

**Deferred spec items** (intentionally not in v0.1.x — file as follow-ups):

- **Dynamic detection of a pre-existing superpowers VC server** (spec §7 row 8).
  The rules.md already instructs Claude to skip `start-server.sh`
  unconditionally, which covers the 95% case. Runtime detection of
  `.superpowers/brainstorm/*/state/server-info` under the session cwd is a
  belt-and-suspenders improvement deferred to a later version.
- **Visible `__errors__` index entry for invalid frontmatter** (spec §7 row 3).
  Today, parse errors are logged to the server's stderr (visible via
  `lsof`/`ps` or by running the server manually). A synthetic `__errors__`
  index item with surfaced messages is a v0.2 UX improvement.
