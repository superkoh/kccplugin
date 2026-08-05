# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`kccplugin` is a **Claude Code plugin marketplace** with a convention-driven,
four-layer automated test framework. Plugins live under `plugins/<name>/` and
are auto-discovered — the framework hardcodes no plugin names. The marketplace
manifest is `.claude-plugin/marketplace.json`.

Plugins ship two ways. The marketplace (`.claude-plugin/marketplace.json`)
follows a *user* across projects. `install.sh` vendors a plugin into a
*project* — it copies `plugins/<name>/` into the target's
`.claude/skills/<name>/`, which Claude Code loads natively as
`<name>@skills-dir`. See README.md for the user-facing story; the
constraints that shaped it are under "Gotchas" below.

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

L3 and L4 only skip when **no auth is available at all**. "Auth" means
any of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN`, or an existing `claude auth` keychain login.
Don't infer a skip from a missing env var — run the layer and read its
output. A banner saying `fallback (user keychain / OAuth; --bare
dropped)` is a normal successful run, not a skip.

CI runs `test:offline` on every push/PR; the full L3+L4 suite runs
nightly and on manual dispatch — see `.github/workflows/test.yml`.

## Four-layer test framework

Layer semantics are in the npm-script comments above; runners live in
`test/`. Full layer reference: `test/README.md`.

Shared helpers live in `test/lib/`. `test/lib/discover.mjs` is the **single
source of truth** for directory conventions — to move or rename a convention,
edit that file and nothing else needs to change.

L2 has a second location: `test/unit/**` holds unit tests for
marketplace-scope tooling that belongs to no single plugin (today
`install.sh`). Same runners, same file-name conventions as a plugin's
`tests/unit/`. `PLUGIN=<name>` deliberately skips it — the filter means
"this plugin only".

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
- **L3 budget discipline.** The L3 runner's default model is
  `DEFAULT_MODEL` in `test/lib/claude-runner.mjs` (a dateless Haiku
  alias — docs intentionally don't restate the literal value). Cap
  every YAML case with `maxBudgetUsd`
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
- **Vendored plugins need workspace trust.** A project-scope plugin under
  `.claude/skills/` is *not loaded* until the workspace trust dialog is
  accepted — `claude plugin list` says so explicitly. Never diagnose this
  as an `install.sh` bug.
- **`install.sh` vendors a whitelist, not the whole tree.** `COMPONENT_DIRS`
  inside the script decides what ships; `tests/` is excluded on purpose.
  Add a new component directory to a plugin and you must add it there too —
  `test/unit/install.test.mjs` fails if the whitelist drops anything listed
  in `PLUGIN_COMPONENT_DIRS` (`test/lib/discover.mjs`).

## Pointers to existing workflow skills

The repo ships two auto-loaded skills in `.claude/skills/` —
`run-plugin-tests` and `write-plugin-tests`; prefer them over
re-deriving workflow details.
