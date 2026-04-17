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
