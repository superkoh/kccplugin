import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../../scripts/lib/server.mjs";
import { createItemStore, createMultiStore } from "../../scripts/lib/item-store.mjs";

const SID = "test-sid";

function newMulti(initial = []) {
  const multi = createMultiStore();
  for (const it of initial) multi.add(SID, it);
  return multi;
}

async function get(port, p, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function bootServer(overrides = {}) {
  const multi = newMulti();
  const { server, port, stop } = await createServer({
    multiStore: multi,
    sessionLabels: new Map([[SID, "test"]]),
    ...overrides,
  });
  return {
    multi,
    server,
    port,
    stop,
    close: () => new Promise(r => server.close(r)),
  };
}

test("GET /health returns 200 with uptime", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, "/health");
  assert.equal(r.status, 200);
  const j = JSON.parse(r.text);
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

test("GET /api/sessions/:sid/items returns empty list initially", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, `/api/sessions/${SID}/items`);
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.text), []);
});

test("GET /api/sessions/:sid/items returns added items", async (t) => {
  const { multi, port, close } = await bootServer();
  t.after(close);
  multi.add(SID, { kind: "inline", title: "X", body: "# hi" });
  const r = await get(port, `/api/sessions/${SID}/items`);
  const items = JSON.parse(r.text);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "X");
  assert.equal(items[0].kind, "inline");
  assert.equal(typeof items[0].id, "string");
});

test("GET /api/sessions/:sid/items/:id returns rendered item", async (t) => {
  const { multi, port, close } = await bootServer();
  t.after(close);
  const it = multi.add(SID, { kind: "inline", title: "X", body: "# hi" });
  const r = await get(port, `/api/sessions/${SID}/items/${it.id}`);
  assert.equal(r.status, 200);
  const j = JSON.parse(r.text);
  assert.equal(j.title, "X");
  assert.equal(j.kind, "inline");
  assert.equal(j.body, "# hi");
});

test("GET /api/sessions/:sid/items/:id 404 for unknown id", async (t) => {
  const { port, close } = await bootServer();
  t.after(close);
  const r = await get(port, `/api/sessions/${SID}/items/does-not-exist`);
  assert.equal(r.status, 404);
});

test("GET /api/sessions/:sid/items/:id with kind=file returns file content", async (t) => {
  const { multi, port, close } = await bootServer();
  t.after(close);
  const { writeFile, mkdtemp } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "kcc-filetest-"));
  const fp = path.join(dir, "sample.md");
  await writeFile(fp, "# from disk");
  const it = multi.add(SID, { kind: "file", title: "S", path: fp });
  const r = await get(port, `/api/sessions/${SID}/items/${it.id}`);
  const j = JSON.parse(r.text);
  assert.equal(j.kind, "file");
  assert.equal(j.mime, "text/markdown");
  assert.equal(j.body, "# from disk");
});

test("GET /api/events is SSE and pushes store updates", async (t) => {
  const { multi, port, close } = await bootServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/api/events`);
  assert.equal(res.headers.get("content-type"), "text/event-stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // schedule a write after subscription is live
  setTimeout(() => multi.add(SID, { kind: "inline", title: "LiveOne", body: "" }), 30);

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

test("GET /assets/styles.css returns text/css with utf-8 charset", async (t) => {
  const multi = newMulti();
  const { server, port } = await createServer({
    multiStore: multi,
    sessionLabels: new Map([[SID, "css-test"]]),
  });
  t.after(() => new Promise(r => server.close(r)));
  const res = await fetch(`http://127.0.0.1:${port}/assets/styles.css`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/css; charset=utf-8");
});

test("server.stop() resolves promptly even with an open SSE client", async (t) => {
  const multi = newMulti();
  const { server, port, stop } = await createServer({
    multiStore: multi,
    sessionLabels: new Map([[SID, "stop-test"]]),
  });
  t.after(() => server.close());

  // Open an SSE stream and HOLD it.
  const res = await fetch(`http://127.0.0.1:${port}/api/events`);
  const reader = res.body.getReader();
  // Read the preamble so the connection is fully established.
  await reader.read();

  const start = Date.now();
  await stop();
  const elapsed = Date.now() - start;

  // Without the fix, server.close() would hang indefinitely on the open SSE.
  // With the fix, stop() should resolve in well under 500 ms.
  assert.ok(elapsed < 500, `stop() took ${elapsed}ms; expected < 500ms`);

  // Subsequent reads from the cancelled stream should not throw.
  reader.cancel().catch(() => {});
});

// ---------------------------------------------------------------------------
// Multi-session / sid-scoped route tests
// ---------------------------------------------------------------------------

async function startMultiServer(t, sessions = {}) {
  const multi = createMultiStore();
  for (const [sid, _label] of Object.entries(sessions)) {
    multi.add(sid, { id: `${sid}-x`, kind: "inline", title: `X-${sid}`, body: "" });
  }
  const { createServer } = await import("../../scripts/lib/server.mjs");
  const { port, stop } = await createServer({
    multiStore: multi,
    sessionLabels: new Map(Object.entries(sessions)),
  });
  t.after(() => stop());
  return { port, multi };
}

test("GET /api/sessions returns labeled sessions only", async (t) => {
  const { port } = await startMultiServer(t, {
    "sid-a": "Session A",
    "sid-b": "Session B",
  });
  const res = await fetch(`http://127.0.0.1:${port}/api/sessions`);
  const body = await res.json();
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((s) => s.sid).sort(), ["sid-a", "sid-b"]);
});

test("GET /api/sessions/:sid/items isolates per-session items", async (t) => {
  const { port } = await startMultiServer(t, {
    "sid-a": "A", "sid-b": "B",
  });
  const a = await (await fetch(`http://127.0.0.1:${port}/api/sessions/sid-a/items`)).json();
  const b = await (await fetch(`http://127.0.0.1:${port}/api/sessions/sid-b/items`)).json();
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].title, "X-sid-a");
  assert.equal(b[0].title, "X-sid-b");
});

test("GET unknown sid returns 404", async (t) => {
  const { port } = await startMultiServer(t, { "sid-a": "A" });
  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/nope/items`);
  assert.equal(res.status, 404);
});

test("POST /api/vc-event requires sid and routes to that session's events file", async (t) => {
  const { mkdtemp } = await import("node:fs/promises");
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "kcc-vc-"));
  t.after(() => rm(tmpRoot, { recursive: true, force: true }));
  const sidA = path.join(tmpRoot, "sid-a", "state");
  await mkdir(sidA, { recursive: true });

  const multi = createMultiStore();
  multi.add("sid-a", { id: "a1", kind: "inline", title: "A1", body: "" });
  const { createServer } = await import("../../scripts/lib/server.mjs");
  const { port, stop } = await createServer({
    multiStore: multi,
    sessionLabels: new Map([["sid-a", "A"]]),
    vcEventsPathFor: (sid) => path.join(tmpRoot, sid, "state", "events"),
  });
  t.after(() => stop());

  const r = await fetch(`http://127.0.0.1:${port}/api/vc-event`, {
    method: "POST",
    body: JSON.stringify({ sid: "sid-a", event: "click", target: "ok" }),
  });
  assert.equal(r.status, 200);
  const events = await readFile(path.join(sidA, "events"), "utf-8");
  assert.match(events, /"sid":"sid-a"/);
});

test("POST /api/vc-event without sid returns 400", async (t) => {
  const multi = createMultiStore();
  const { createServer } = await import("../../scripts/lib/server.mjs");
  const { port, stop } = await createServer({ multiStore: multi, sessionLabels: new Map() });
  t.after(() => stop());
  const r = await fetch(`http://127.0.0.1:${port}/api/vc-event`, {
    method: "POST",
    body: JSON.stringify({ event: "click" }),
  });
  assert.equal(r.status, 400);
});

test("GET frame returns 404 for unknown sid even if item id is otherwise valid", async (t) => {
  const { port } = await startMultiServer(t, { "sid-a": "A" });
  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/no-such-sid/items/any/frame`);
  assert.equal(res.status, 404);
});
