/**
 * L2 unit test for kcc-core's first real feature: the SessionStart hook
 * that injects top-level thinking & communication principles into every
 * Claude Code session.
 *
 * This file asserts the static artefacts — config file shape, content
 * file presence, script executable bit. The behavioural test (actually
 * running the script and parsing its stdout) lives in the sibling
 * session-start-principles.bats file.
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
  assert.match(firstHook.command, /session-start-principles\.sh/);
});

test("context/thinking-principles.md exists and carries the expected markers", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "thinking-principles.md"),
    "utf-8"
  );
  assert.match(
    text,
    /First-Principles Visibility/,
    "human-readable signature phrase must be present"
  );
  assert.match(
    text,
    /kcc-core-thinking-principles-v2/,
    "machine-readable sentinel token must be present"
  );
});

test("scripts/session-start-principles.sh is present and executable", async () => {
  await access(
    path.join(pluginRoot, "scripts", "session-start-principles.sh"),
    constants.X_OK
  );
});
