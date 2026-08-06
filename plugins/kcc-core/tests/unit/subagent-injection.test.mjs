// L2 contract for the SubagentStart injection path: hooks.json entry,
// subagent principles doc markers, and parity with the main-session doc
// (owner decision 2026-08-05: subagents get the same principles, 🎯
// block included — the earlier "subagent replies are data returns, keep
// the block out" carve-out is retired).
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
    /Principles for Subagents/,
    "human-readable signature phrase must be present"
  );
  assert.match(
    text,
    /kcc-core-subagent-principles-v\d+/,
    "machine-readable sentinel token must be present"
  );
});

test("subagent doc mandates the 🎯 block like the main-session doc", async () => {
  const text = await readFile(
    path.join(pluginRoot, "context", "thinking-principles-subagent.md"),
    "utf-8"
  );
  assert.match(text, /S1\. First-Principles Visibility/);
  assert.match(text, /> 🎯 First principles/);
  for (const facet of [
    "Real problem:",
    "Facts / constraints:",
    "Hidden assumptions:",
    "Re-derivation:",
    "First step:",
  ]) {
    assert.ok(text.includes(facet), `🎯 block must keep the "${facet}" facet`);
  }
});

// Parity guard: the two docs may differ in framing (orchestrator vs
// user channel) but must not drift apart on which rules exist. A rule
// added to the main doc and forgotten in the subagent doc is the exact
// regression this catches.
test("subagent doc carries every working rule the main doc has", async () => {
  const read = (f) =>
    readFile(path.join(pluginRoot, "context", f), "utf-8");
  const ruleNames = (text) => {
    const section = text.split(/^## Working rules$/m)[1] ?? "";
    return new Set(
      [...section.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => m[1])
    );
  };
  const main = ruleNames(await read("thinking-principles.md"));
  const sub = ruleNames(await read("thinking-principles-subagent.md"));

  assert.ok(main.size > 0, "main doc must expose a Working rules section");
  const missing = [...main].filter((r) => !sub.has(r));
  assert.deepEqual(
    missing,
    [],
    `subagent doc is missing main-doc rules: ${missing.join(", ")}`
  );
});

test("scripts/subagent-start-principles.sh is present and executable", async () => {
  await access(
    path.join(pluginRoot, "scripts", "subagent-start-principles.sh"),
    constants.X_OK
  );
});
