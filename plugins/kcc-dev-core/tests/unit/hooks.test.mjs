/**
 * L2 unit test for kcc-dev-core's SessionStart hook wiring.
 *
 * This file asserts the static artefacts — hooks.json shape, content
 * file presence and markers, script executable bit. The behavioural
 * test (actually running the script under a variety of cwd scenarios)
 * lives in the sibling session-start-dev-principles.bats file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("hooks/hooks.json registers a SessionStart command hook", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "hooks", "hooks.json"),
    "utf-8"
  );
  const data = JSON.parse(raw);

  const sessionStart = data.hooks?.SessionStart;
  assert.ok(
    Array.isArray(sessionStart) && sessionStart.length > 0,
    "hooks.SessionStart must be a non-empty array"
  );

  const firstEntry = sessionStart[0];
  assert.ok(
    Array.isArray(firstEntry.hooks) && firstEntry.hooks.length > 0,
    "first SessionStart entry must contain a non-empty hooks array"
  );

  const firstHook = firstEntry.hooks[0];
  assert.equal(firstHook.type, "command");
  assert.match(firstHook.command, /session-start-dev-principles\.sh/);
});

test("context/dev-principles.md exists and carries the expected markers", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "dev-principles.md"),
    "utf-8"
  );
  assert.match(
    text,
    /Development Discipline & Craft Principles/,
    "human-readable signature phrase must be present"
  );
  assert.match(
    text,
    /kcc-dev-core-principles-v\d+/,
    "machine-readable sentinel token must be present"
  );
});

test("scripts/session-start-dev-principles.sh is present and executable", async () => {
  await access(
    path.join(pluginRoot, "scripts", "session-start-dev-principles.sh"),
    constants.X_OK
  );
});

test("hooks/hooks.json registers a Stop command hook for the test audit", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "hooks", "hooks.json"),
    "utf-8"
  );
  const data = JSON.parse(raw);

  const stop = data.hooks?.Stop;
  assert.ok(
    Array.isArray(stop) && stop.length > 0,
    "hooks.Stop must be a non-empty array"
  );

  const firstHook = stop[0].hooks?.[0];
  assert.equal(firstHook.type, "command");
  assert.match(firstHook.command, /stop-test-audit\.sh/);
});

test("scripts/stop-test-audit.sh is present, executable, and loop-guarded", async () => {
  const scriptPath = path.join(pluginRoot, "scripts", "stop-test-audit.sh");
  await access(scriptPath, constants.X_OK);
  const body = await readFile(scriptPath, "utf-8");
  assert.match(
    body,
    /stop_hook_active/,
    "must honor stop_hook_active to prevent block loops"
  );
  assert.match(
    body,
    /kcc-dev-core.unit-tests/,
    "block reason must route to the unit-tests skill"
  );
});
