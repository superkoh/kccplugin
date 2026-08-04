// L2 contract for the SubagentStart injection path: hooks.json entry,
// subagent principles doc markers, and the subset design (the 🎯 block
// mandate is main-session UX and must stay out of subagent context).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("hooks.json registers a SubagentStart command hook", async () => {
  const raw = await readFile(
    path.join(pluginRoot, "hooks", "hooks.json"),
    "utf-8"
  );
  const config = JSON.parse(raw);
  const entries = config.hooks?.SubagentStart;
  assert.ok(
    Array.isArray(entries) && entries.length > 0,
    "hooks.SubagentStart must be a non-empty array"
  );
  const firstHook = entries[0].hooks[0];
  assert.equal(firstHook.type, "command");
  assert.match(firstHook.command, /subagent-start-principles\.sh/);
  assert.ok(
    Array.isArray(config.hooks?.SessionStart) &&
      config.hooks.SessionStart.length > 0,
    "SessionStart entry must remain registered"
  );
});

test("context/thinking-principles-subagent.md carries the expected markers", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "thinking-principles-subagent.md"),
    "utf-8"
  );
  assert.match(
    text,
    /Thinking Principles for Subagents/,
    "human-readable signature phrase must be present"
  );
  assert.match(
    text,
    /kcc-core-subagent-principles-v\d+/,
    "machine-readable sentinel token must be present"
  );
});

test("subagent doc excludes the 🎯 block mandate", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "thinking-principles-subagent.md"),
    "utf-8"
  );
  // Subagent replies are data returns consumed by the orchestrator, not
  // user-facing reports; a mandated 🎯 block would pollute structured
  // outputs.
  assert.doesNotMatch(text, /🎯/);
});

test("scripts/subagent-start-principles.sh is present and executable", async () => {
  await access(
    path.join(pluginRoot, "scripts", "subagent-start-principles.sh"),
    constants.X_OK
  );
});
