import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { tryBindFirstFreePort, DEFAULT_PORT_RANGE } from "../../scripts/lib/leader-election.mjs";

function holdPort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(port, "127.0.0.1", () => resolve(srv));
  });
}

test("DEFAULT_PORT_RANGE is 51296-51305", () => {
  assert.equal(DEFAULT_PORT_RANGE.start, 51296);
  assert.equal(DEFAULT_PORT_RANGE.end, 51305);
});

test("tryBindFirstFreePort returns first free port when default is free", async (t) => {
  // Use a high range unlikely to collide in CI
  const range = { start: 53310, end: 53319 };
  const { port, release } = await tryBindFirstFreePort(range);
  t.after(() => release());
  assert.equal(port, 53310);
});

test("tryBindFirstFreePort walks to next free port when first is held", async (t) => {
  const blocker = await holdPort(53320);
  t.after(() => new Promise((res) => blocker.close(res)));
  const range = { start: 53320, end: 53329 };
  const { port, release } = await tryBindFirstFreePort(range);
  t.after(() => release());
  assert.equal(port, 53321);
});

test("tryBindFirstFreePort throws RangeExhaustedError when all ports occupied", async (t) => {
  const a = await holdPort(53330);
  const b = await holdPort(53331);
  t.after(() => Promise.all([new Promise((r) => a.close(r)), new Promise((r) => b.close(r))]));
  await assert.rejects(
    () => tryBindFirstFreePort({ start: 53330, end: 53331 }),
    /no free port in 53330-53331/i,
  );
});

test("release() actually frees the port", async () => {
  const range = { start: 53340, end: 53341 };
  const { port, release } = await tryBindFirstFreePort(range);
  await release();
  // Now we should be able to grab it again
  const second = await tryBindFirstFreePort(range);
  assert.equal(second.port, port);
  await second.release();
});

test("resolvePortRange honors KCC_PREVIEW_PORT_RANGE env", async () => {
  const { resolvePortRange } = await import("../../scripts/lib/leader-election.mjs");
  assert.deepEqual(resolvePortRange({ KCC_PREVIEW_PORT_RANGE: "53400-53409" }),
    { start: 53400, end: 53409 });
});

test("resolvePortRange falls back to default on malformed env", async () => {
  const { resolvePortRange, DEFAULT_PORT_RANGE } = await import("../../scripts/lib/leader-election.mjs");
  assert.deepEqual(resolvePortRange({ KCC_PREVIEW_PORT_RANGE: "garbage" }), DEFAULT_PORT_RANGE);
  assert.deepEqual(resolvePortRange({ KCC_PREVIEW_PORT_RANGE: "100-50" }), DEFAULT_PORT_RANGE);
  assert.deepEqual(resolvePortRange({}), DEFAULT_PORT_RANGE);
});
