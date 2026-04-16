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
