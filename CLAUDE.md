# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`kccplugin` is a **Claude Code plugin marketplace** with a convention-driven,
four-layer automated test framework. Plugins live under `plugins/<name>/` and
are auto-discovered — the framework hardcodes no plugin names. The marketplace
manifest is `.claude-plugin/marketplace.json`.

## Common commands

All tests are run from the repo root via `npm`. Requires Node ≥ 20.

```bash
npm test                      # L1 → L2 → L4 → L3 (full run)
npm run test:offline          # L1 + L2 only (free, offline, pre-commit-safe)
npm run test:fast             # alias for test:offline

npm run test:l1               # schemas + official `claude plugin validate`
npm run test:l2               # unit tests (bats / node --test / pytest)
npm run test:l3               # declarative YAML e2e cases (real API cost)
npm run test:l4               # load-time registration assertions (tiny API cost)
```

Scope any command to a single plugin with the `PLUGIN` env var. Typos are a
**hard error**, not a silent no-op:

```bash
PLUGIN=hello-world npm test
PLUGIN=hello-world npm run test:l1
```

L3 and L4 self-skip when `ANTHROPIC_API_KEY` is unset. CI runs
`test:offline` on every push/PR; the full L3+L4 suite runs nightly and on
manual dispatch — see `.github/workflows/test.yml`.

## Four-layer test framework

| Layer | Runner | Proves | Cost | Needs API key |
|------:|--------|--------|------|:--:|
| **L1** | `test/validate.mjs` | `marketplace.json`, `plugin.json`, all frontmatter, and `hooks.json` pass strict ajv schemas, and the official `claude plugin validate` accepts each plugin | none | no |
| **L2** | `test/run-unit.mjs` | Plugin-owned unit tests pass — dispatched by extension: `.bats` → bats, `*.test.mjs` / `*.test.js` → `node --test`, `test_*.py` → `python3 -m pytest` | none | no |
| **L3** | `test/run-e2e.mjs` | Declarative YAML cases drive `claude -p --bare` and loose matchers on `stdout` / `stderr` / `parsedJson` pass | real API | yes |
| **L4** | `test/run-sdk.mjs` | CLI loads each plugin with `--plugin-dir`, and every name in `tests/sdk/expected.json` (`slashCommands.requires`, `mcpServers.requires`) appears in the init message before the child is SIGKILL'd | tiny API | yes |

Shared helpers live in `test/lib/`. `test/lib/discover.mjs` is the **single
source of truth** for directory conventions — to move or rename a convention,
edit that file and nothing else needs to change.

Strict schemas in `test/schemas/*.json` use `additionalProperties: false` by
design, so typos in manifests fail loudly at L1 rather than silently
misbehaving at runtime. When the official Claude Code plugin spec grows a
new field, the fix is a one-line PR adding it to the matching schema.

## Plugin layout

Every plugin sits in its own directory under `plugins/`. The directory name
is authoritative — it must match `.claude-plugin/plugin.json`'s `name`
field and becomes the slash-command namespace. Names must be kebab-case
(`^[a-z0-9][a-z0-9-]*$`).

```
plugins/<name>/
├── .claude-plugin/plugin.json           # manifest (L1)
├── commands/*.md                        # slash commands (YAML frontmatter, L1)
├── agents/*.md                          # sub-agents (YAML frontmatter, L1)
├── skills/<skill>/SKILL.md              # skills (YAML frontmatter, L1)
├── hooks/hooks.json                     # hooks config (L1)
├── scripts/*.sh                         # hook implementations (referenced from hooks.json)
└── tests/
    ├── unit/                            # L2 (opt-in)
    │   ├── *.bats                       #   → bats
    │   ├── *.test.mjs | *.test.js       #   → node --test
    │   └── test_*.py                    #   → pytest
    ├── e2e/*.yaml                       # L3 (opt-in)
    └── sdk/expected.json                # L4 (upgrades smoke → asserted)
```

Every `tests/` subdirectory is optional. A plugin with no tests at all still
gets L1 schema validation and an L4 smoke-check (did the CLI load it?)
for free.

## Gotchas not discoverable from the code

- **Misplaced subdirectories.** `commands/`, `skills/`, `agents/`, and
  `hooks/` must live at the plugin root, NOT inside `.claude-plugin/`. The
  CLI silently ignores them in the wrong location; L1's misplacement
  detector is the only thing that catches this.
- **Directory name == manifest name.** If `plugins/foo/.claude-plugin/plugin.json`
  has `"name": "bar"`, L1 fails with `manifest.name "bar" does not match
  directory name "foo"`.
- **L3 budget discipline.** The L3 runner defaults to
  `claude-haiku-4-5-20251001`. Cap every YAML case with `maxBudgetUsd`
  (0.05 is usually plenty). Don't reach for Opus in regression tests.
- **Triage offline first.** Run L1+L2+L4 before L3. If any are red, fix
  them first — don't burn L3 money on a known-broken plugin.
- **Hermetic vs. fallback auth.** L3 uses `claude --bare` when
  `ANTHROPIC_API_KEY` is set (ignores user `.claude/` and `~/.claude`).
  Without the env var it drops `--bare` and falls back to the user's
  keychain OAuth. Both are valid; CI should set the secret.
- **Frontmatter `description` is required** on commands, skills, and
  agents — missing it both fails L1 frontmatter schemas and prevents the
  plugin from registering at L4.

## Pointers to existing workflow skills

The repo ships two Claude Code skills in `.claude/skills/` that the harness
auto-loads; prefer them over re-deriving workflow details:

- `run-plugin-tests` — how to invoke each layer, how to pick `PLUGIN=`, the
  "which layer for which edit" table, how to read each layer's output, and
  budget discipline rules.
- `write-plugin-tests` — L2/L3/L4 templates (bats, `node --test`, pytest,
  e2e YAML, `expected.json`) and assertion rules of thumb for L3.

Also useful: `test/README.md` for a self-contained tour of the framework.
