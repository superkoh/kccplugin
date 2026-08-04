// L2 contract for the SubagentStart injection path: hooks.json entry,
// subagent principles doc markers, and the subset design (rules that
// are meaningless or harmful inside subagents must stay out).
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
  assert.match(firstHook.command, /subagent-start-dev-principles\.sh/);
  // SessionStart must survive the addition
  assert.ok(
    Array.isArray(config.hooks?.SessionStart) &&
      config.hooks.SessionStart.length > 0,
    "SessionStart entry must remain registered"
  );
});

test("context/dev-principles-subagent.md carries the expected markers", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "dev-principles-subagent.md"),
    "utf-8"
  );
  assert.match(
    text,
    /Development Discipline for Subagents/,
    "human-readable signature phrase must be present"
  );
  assert.match(
    text,
    /kcc-dev-core-subagent-principles-v\d+/,
    "machine-readable sentinel token must be present"
  );
});

test("subagent doc excludes rules that are meaningless in subagents", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "dev-principles-subagent.md"),
    "utf-8"
  );
  // Subagents have no user channel and no PR workflow: worktree/PR rules
  // and AskUserQuestion-based rules must not leak into the subagent doc.
  assert.doesNotMatch(text, /Worktree rules/);
  assert.doesNotMatch(text, /AskUserQuestion/);
});

test("scripts/subagent-start-dev-principles.sh is present and executable", async () => {
  await access(
    path.join(pluginRoot, "scripts", "subagent-start-dev-principles.sh"),
    constants.X_OK
  );
});
