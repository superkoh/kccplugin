import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdleReaper } from "../../scripts/lib/idle-reaper.mjs";

test("fires onExit after idleMs when zero labeled sessions", async () => {
  let fired = 0;
  const reaper = createIdleReaper({ idleMs: 50, onExit: () => fired++ });
  reaper.onLabeled("sid-a");
  reaper.onRemoved("sid-a");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 1);
});

test("does not fire while at least one labeled session exists", async () => {
  let fired = 0;
  const reaper = createIdleReaper({ idleMs: 50, onExit: () => fired++ });
  reaper.onLabeled("sid-a");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 0);
});

test("new labeled session within idle window cancels the timer", async () => {
  let fired = 0;
  const reaper = createIdleReaper({ idleMs: 80, onExit: () => fired++ });
  reaper.onLabeled("sid-a");
  reaper.onRemoved("sid-a");
  await new Promise((r) => setTimeout(r, 30));
  reaper.onLabeled("sid-b");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 0);
});

test("multiple removals do not stack timers", async () => {
  let fired = 0;
  const reaper = createIdleReaper({ idleMs: 50, onExit: () => fired++ });
  reaper.onLabeled("sid-a");
  reaper.onLabeled("sid-b");
  reaper.onRemoved("sid-a");
  reaper.onRemoved("sid-b");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 1);
});
