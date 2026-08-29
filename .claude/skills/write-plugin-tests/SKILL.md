---
name: write-plugin-tests
description: Author new test cases for a module under plugins/ in this kccplugin repo. Use when the user asks to add tests, write test cases, or wants test coverage (加测试 / 写测试 / 补测试 / 测试覆盖), and proactively after creating a plugin or adding a command / skill / agent / hook to one, before reporting the task complete. Writes files into plugins/<name>/tests/ across L2 (unit), L3 (e2e YAML), and L4 (registration), then hands off to run-plugin-tests to verify.
---

# Writing tests for modules in this repo

This repo ships a four-layer test framework under `test/`. Test cases
live inside each plugin:

```
plugins/<plugin-name>/tests/
├── unit/    # L2: bats / node --test / pytest
├── e2e/     # L3: declarative YAML cases driving `claude -p`
└── sdk/     # L4: registration assertions against claude's init message
```

**L1 (schemas + `claude plugin validate`) runs automatically** over every
plugin manifest and frontmatter — nothing to author. Your job is L2, L3,
and L4.

## Determining the target plugin

Before scaffolding anything, you must know which plugin the tests are
for. Files go under `plugins/<target>/tests/`, so picking the wrong
name silently authors tests for the wrong plugin. Infer the target in
this order, strongest signal first:

1. **Explicit name in the user's message.** Literal plugin name
   ("hello-world", "foo-bar"), or a slash-command namespace like
   `/foo:bar` where `foo` is the plugin.
2. **File paths in the task.** If the user just asked you to edit or
   just showed you `plugins/<name>/...`, the target is `<name>`. If
   several plugins are touched in the same task, author tests for each
   — don't arbitrarily pick one.
3. **Recent conversation context.** Only one plugin has been
   discussed in the last few turns.
4. **Cannot infer.** Run `ls plugins/` to enumerate, then **ask the
   user** which plugin to scaffold for. **Do NOT default to "all
   plugins"** — authoring the same tests in multiple places is rarely
   what the user wants.

Whenever you've decided on `<target>`, every file path in the templates
below uses it literally: `plugins/<target>/tests/unit/...`, etc.

## Decision tree — which layer covers what

- Plugin ships shell hooks or scripts → **L2 bats**
- Plugin ships a Node/TS MCP server or helper library → **L2 node --test**
- Plugin ships a Python MCP server or helper → **L2 pytest**
- Plugin exposes a slash command / skill / agent the user will invoke → **L3 e2e YAML**
- Every plugin → **L4 expected.json** (cheap, upgrades load smoke → asserted)

A single plugin can (and usually should) author cases in multiple layers.

## L2 templates — pick the one that matches the plugin's language

### bats — for shell hooks and structural checks

File: `plugins/<name>/tests/unit/<thing>.bats`

```bash
#!/usr/bin/env bats
PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."

@test "hook script is executable" {
  [ -x "$PLUGIN_ROOT/scripts/format-code.sh" ]
}

@test "hook emits valid JSON on a known input" {
  run bash -c 'echo "{\"tool\":\"Write\",\"file_path\":\"/tmp/x\"}" \
    | bash "$PLUGIN_ROOT/scripts/format-code.sh" \
    | jq .'
  [ "$status" -eq 0 ]
}
```

Keep paths relative to `$BATS_TEST_DIRNAME` so the test is independent
of whatever cwd the runner uses.

### node --test — for JS/TS libraries and MCP servers

File: `plugins/<name>/tests/unit/<thing>.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..", "..");

test("plugin.json has expected shape", async () => {
  const raw = await readFile(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    "utf-8"
  );
  const m = JSON.parse(raw);
  assert.equal(m.name, "<plugin-name>");
});
```

Zero dependencies — Node's built-in test runner and `node:assert/strict`.

### pytest — for Python MCP servers

File: `plugins/<name>/tests/unit/test_<thing>.py`

```python
from pathlib import Path
import json

PLUGIN_ROOT = Path(__file__).resolve().parents[2]

def test_plugin_manifest_parses():
    data = json.loads((PLUGIN_ROOT / ".claude-plugin" / "plugin.json").read_text())
    assert data["name"] == "<plugin-name>"
```

## L3 template — end-to-end YAML case

File: `plugins/<name>/tests/e2e/<scenario>.yaml`

```yaml
name: "<plugin>:<command-or-skill> smoke"
prompt: "/<plugin>:<command> <args>"

# Optional fields (defaults shown):
# model: <full-id-or-alias>             # optional; omit to use DEFAULT_MODEL (test/lib/claude-runner.mjs)
maxBudgetUsd: 0.05                      # hard per-case cost cap
timeoutMs: 120000                       # kill case after this long
# allowedTools: [Read, Glob, Grep]      # lock tools down
# disallowedTools: [Write, Edit, Bash]  # or lock them out
# jsonSchema: |                         # force structured model output
#   {"type":"object","properties":{"greeting":{"type":"string"}}}

expect:
  exitCode: 0
  parsedJson:
    type: "result"
    subtype: "success"
    is_error: false
  stdout:
    notContains: ["not found", "unknown command"]
```

### L3 matcher reference

Inside `expect.stdout` / `expect.stderr`:

| Matcher | Meaning |
|---|---|
| `contains` | string or array of strings that must appear |
| `notContains` | string or array of strings that must NOT appear |
| `matches` | regex (JS syntax) that must match |
| `notMatches` | regex that must NOT match |

Inside `expect.parsedJson` (keys are dotted paths into the JSON result envelope):

- A literal value → strict equality
- `{ equals: X }` → strict equality
- `{ contains: "foo" }` → substring match on a string field
- `{ matches: "foo.*bar" }` → regex match on a string field
- `{ type: "string" | "number" | "boolean" | "array" | "object" | "null" }` → typeof check

### L3 assertion rules of thumb

- **DO** assert on the JSON envelope (`type`, `subtype`, `is_error`,
  `exitCode`, `total_cost_usd > 0`). These are deterministic.
- **DO** assert on the *absence* of error phrases in stdout
  (`"not found"`, `"unknown command"`, etc.).
- **DO** prefer Haiku and a tight `maxBudgetUsd`. L3 runs every
  regression — don't make it expensive.
- **DO** set `jsonSchema` when a downstream assertion needs a specific
  field to exist in the model's reply. It forces the model into a
  structured shape.
- **DON'T** assert on the exact prose the model emits. Model outputs
  drift between versions and are stochastic.
- **DON'T** reach for Opus in regression tests. If a test needs Opus
  to pass reliably, the test is doing eval work, not regression work.

## L4 template — registration assertions

File: `plugins/<name>/tests/sdk/expected.json`

```json
{
  "slashCommands": {
    "requires": ["<module>:<command-1>", "<module>:<skill-1>"],
    "forbids": ["<command-1>"]
  },
  "skills": {
    "requires": ["<module>:<skill-1>"]
  },
  "agents": {
    "requires": ["<module>"]
  },
  "mcpServers": {
    "requires": []
  }
}
```

L4 installs every module into a throwaway project, starts the CLI there,
reads the init system message, and asserts each section against what
registered. Adding this file upgrades the module from L4 *implied* mode
to *asserted* mode — recommended for every new module.

Write one entry per user-facing command, skill, and agent. Put the
un-namespaced form in the `forbids` of the section it would actually
appear in — a flat-registered skill lands in `skills`, never in
`slashCommands`, so `slashCommands.forbids: ["spec"]` is a dead
assertion that can never fire.
Note agents are **flat**: the agent section takes the frontmatter name,
which must start with the module name and must not contain a colon.
Leave `mcpServers.requires` empty unless the module ships an MCP server.

## After writing — verify and hand off

Always run the offline layers immediately to confirm what you wrote
parses:

```bash
PLUGIN=<name> npm run test:offline    # L1 + L2, fast, free
```

Then the cheap registration check:

```bash
PLUGIN=<name> npm run test:l4         # tiny API cost, asserts L4 expected.json
```

Finally, the real end-to-end cases (real API cost):

```bash
PLUGIN=<name> npm run test:l3
```

**If any layer fails, switch to the sister skill `run-plugin-tests`
for guidance on interpreting the failure.** It has the output-reading
reference, the "which layer for which edit" table, and the budget
discipline rules.

## Reference — file layout for a well-tested plugin

```
plugins/<name>/
├── .claude-plugin/plugin.json
├── commands/*.md
├── skills/<skill>/SKILL.md
├── agents/*.md
├── hooks/hooks.json
├── scripts/*.sh
└── tests/
    ├── unit/
    │   ├── structure.bats         # L2 bats
    │   └── lib.test.mjs           # L2 node --test
    ├── e2e/
    │   ├── happy-path.yaml        # L3
    │   └── edge-cases.yaml        # L3
    └── sdk/
        └── expected.json          # L4 asserted mode
```
