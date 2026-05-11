import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../scripts/lib/server.mjs";
import { createMultiStore } from "../../scripts/lib/item-store.mjs";

const SID = "test-sid";

async function boot() {
  const multi = createMultiStore();
  const { server, port } = await createServer({
    multiStore: multi,
    sessionLabels: new Map([[SID, "t"]]),
  });
  return { multi, port, close: () => new Promise(r => server.close(r)) };
}

test("GET /api/sessions/:sid/items/:id/frame returns full HTML with VC classes for kind=vc", async (t) => {
  const { multi, port, close } = await boot();
  t.after(close);
  const it = multi.add(SID, { kind: "vc", title: "Layout", body: `<h2>Pick one</h2><div class="options"></div>` });

  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${SID}/items/${it.id}/frame`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const body = await res.text();
  assert.match(body, /<!doctype html>/i);
  assert.match(body, /class="options"/);
  assert.match(body, /\.options\s*{/);          // frame CSS embedded
  assert.match(body, /function toggleSelect/);  // helper js embedded
});

test("GET /api/sessions/:sid/items/:id/frame 404 on missing id", async (t) => {
  const { port, close } = await boot();
  t.after(close);
  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${SID}/items/nope/frame`);
  assert.equal(res.status, 404);
});

test("frame wrapper also works for kind=html (user-authored raw HTML)", async (t) => {
  const { multi, port, close } = await boot();
  t.after(close);
  const it = multi.add(SID, { kind: "html", title: "Grid", body: `<div class="grid">hi</div>` });

  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/${SID}/items/${it.id}/frame`);
  const body = await res.text();
  assert.match(body, /class="grid"/);
});
