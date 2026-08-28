# kccplugin test framework

Layered, convention-driven automated tests for every module in this repo.
New modules plug in by dropping files into known locations — the framework
discovers them. Nothing here is module-specific.

L3 and L4 run against the **shipped form**: modules installed into a
throwaway project's `.claude/`, exactly as `install.sh` would. See
`test/lib/project-fixture.mjs`.

## Layers

| Layer | Runner | What it proves | Cost | API key? |
|------:|--------|----------------|------|:--:|
| **L1** | `test/validate.mjs`  | plugin.json / kcc.module.json / all frontmatter / hooks.json are structurally valid against strict schemas; the projection invariants hold (flat agent names, no target-path collisions); plus the official `claude plugin validate` | none | no |
| **L2** | `test/run-unit.mjs`  | Module-owned unit tests (bats, `node --test`, pytest) plus the installer's own suite at `installer/tests/` | none | no |
| **L3** | `test/run-e2e.mjs`   | Declarative YAML cases driving `claude -p` inside a project that has the module installed, with loose matchers on the output | API tokens | yes |
| **L4** | `test/run-sdk.mjs`   | Every module's commands, skills and agents register under their projected names after a real install, with no user-level leakage | tiny API spend | yes |

Run everything:

```bash
npm test
```

Run just the free, offline layers (recommended pre-commit / CI smoke):

```bash
npm run test:offline   # == test:l1 + test:l2
```

Run a single layer:

```bash
npm run test:l1        # schemas + official validate
npm run test:l2        # bats / node --test / pytest
npm run test:l3        # e2e YAML cases
npm run test:l4        # load-time registration
```

Target a single plugin (typos are a hard error, not silently "no-op"):

```bash
PLUGIN=my-plugin npm test
PLUGIN=my-plugin npm run test:l1
```

L3 and L4 self-skip only when **no auth is available at all** — any of
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`,
or an existing `claude auth` keychain login lets them run. Isolation
comes from `CLAUDE_CONFIG_DIR`, never `--bare` — `--bare` would also drop
the project's own `.claude/`, hiding the very thing under test.

## How a plugin opts into each layer

Everything is discovered from the plugin's own directory — the framework
never hardcodes plugin names.

```
plugins/<name>/
├── .claude-plugin/plugin.json           # L1: manifest schema
├── commands/*.md                        # L1: command frontmatter
├── agents/*.md                          # L1: agent frontmatter
├── skills/<skill>/SKILL.md              # L1: skill frontmatter
├── hooks/hooks.json                     # L1: hooks schema
└── tests/
    ├── unit/                            # L2 (opt-in)
    │   ├── *.bats                       #   → bats-core
    │   ├── *.test.mjs                   #   → node --test
    │   └── test_*.py                    #   → python3 -m pytest
    ├── e2e/                             # L3 (opt-in)
    │   └── *.yaml                       #   → runClaude + matchers
    └── sdk/                             # L4 (opt-in, smoke-only otherwise)
        └── expected.json                #   → assert slash_commands / mcp_servers
```

All `tests/` subdirectories are optional. A plugin with no `tests/`
directory at all still gets L1 (schemas) and L4 smoke-check for free.

## Writing an L3 e2e case

```yaml
# plugins/my-plugin/tests/e2e/greet.yaml
name: basic greeting
prompt: "/my-plugin:greet Alice"
# model: <full-id-or-alias>         # optional; omit to use DEFAULT_MODEL (lib/claude-runner.mjs)
maxBudgetUsd: 0.10                  # optional; hard cap per case
allowedTools: [Read]                # optional
disallowedTools: [Write, Edit]      # optional
timeoutMs: 120000                   # optional
# cwd: tests/e2e/fixtures/ws        # optional; CLI working dir, resolved
#                                   # against the plugin root — for cases
#                                   # whose hooks key off cwd
jsonSchema: |                       # optional — forces structured output
  {
    "type": "object",
    "properties": { "greeting": { "type": "string" } },
    "required": ["greeting"]
  }
expect:
  exitCode: 0
  stdout:
    contains: ["Alice"]
    notContains: ["error", "Error"]
    matches: "\\bhello\\b"
  parsedJson:
    result.greeting:
      matches: "Alice"
```

Matcher reference (used by `stdout`, `stderr`):

- `contains`   — string or array of strings that must appear
- `notContains`— string or array of strings that must NOT appear
- `matches`    — regex (JS syntax) that must match
- `notMatches` — regex that must NOT match

`parsedJson` matchers support dotted paths plus `equals | contains | matches | type`.

## Writing an L4 expectations file

```json
{
  "slashCommands": {
    "requires": ["/my-plugin:greet", "/my-plugin:farewell"],
    "forbids":  []
  },
  "mcpServers": {
    "requires": []
  }
}
```

If `tests/sdk/expected.json` is absent, L4 still runs in **smoke mode**:
it just verifies the CLI can load the plugin without crashing.

## Writing L2 unit tests

### Shell hooks with bats

```bash
# plugins/my-plugin/tests/unit/hooks.bats
#!/usr/bin/env bats

@test "format-code hook is executable" {
  [ -x "./plugins/my-plugin/scripts/format-code.sh" ]
}

@test "format-code hook passes through non-JSON input unchanged" {
  run bash ./plugins/my-plugin/scripts/format-code.sh < /dev/null
  [ "$status" -eq 0 ]
}
```

### TypeScript / JS with node --test

```js
// plugins/my-plugin/tests/unit/utils.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../../lib/utils.mjs";

test("slugify lowercases and hyphenates", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});
```

### Python MCP servers with pytest

```python
# plugins/my-plugin/tests/unit/test_server.py
from my_plugin.server import handle_initialize

def test_initialize_response_shape():
    res = handle_initialize({})
    assert res["result"]["protocolVersion"]
```

## Framework internals

All the runners live under `test/`:

- `test/validate.mjs`   — L1 schema + official validator
- `test/run-unit.mjs`   — L2 dispatcher
- `test/run-e2e.mjs`    — L3 YAML runner
- `test/run-sdk.mjs`    — L4 init-message assertions
- `test/schemas/*.json` — ajv strict schemas
- `test/lib/`           — shared helpers
  - `discover.mjs`      — the single source of truth for conventions
  - `frontmatter.mjs`   — YAML frontmatter parser
  - `claude-runner.mjs` — `claude -p` subprocess wrapper
  - `matchers.mjs`      — assertions for L3

To change a convention (e.g. move `tests/` somewhere else), edit
`test/lib/discover.mjs` — nothing else should need to change.

## Why the schemas are strict

`additionalProperties: false` is a choice. We want typos in plugin
manifests to fail loudly in L1 before they cause confusing silent
misbehavior at runtime. When the official Claude Code plugin spec grows
a new field we like, the fix is to add it to the matching schema in
`test/schemas/` — which is a one-line PR and naturally reviewed.

## CI

See `.github/workflows/test.yml`. The default workflow runs
`npm run test:offline` on every push and PR (fast, no secrets needed).
L3 and L4 run on a nightly schedule or on manual dispatch (the
`run_e2e` input), guarded by the `ANTHROPIC_API_KEY` secret.
