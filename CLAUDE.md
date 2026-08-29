# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`kccplugin` ships Claude Code capabilities that are **installed into a
project's `.claude/`**, not into a user's `~/.claude`. `install.sh` (curl
one-liner) → `installer/install.mjs` does install, upgrade, verify and
uninstall as one reconciling operation. A convention-driven, four-layer
test framework covers it.

Modules are authored in Claude Code **plugin shape** under `plugins/<name>/`
and are auto-discovered — nothing hardcodes a module name. The plugin shape
is kept because it is exactly what the installer needs and because it keeps
`claude plugin validate` as a free L1 correctness oracle; it is *not* a
statement that these ship as plugins. `.claude-plugin/marketplace.json` is
retained only as a deprecation window for people still on the old
marketplace install, and is not the supported distribution path.

Read `README.md` for the user-facing install story.

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

`PLUGIN=installer` scopes L2 to the installer's own unit tests, which live
at `installer/tests/` rather than under a plugin.

The installer itself:

```bash
node installer/install.mjs --help
node installer/install.mjs --target /path/to/project --all --dry-run
node installer/install.mjs --target /path/to/project --check
```

L3 and L4 only skip when **no auth is available at all**. "Auth" means
any of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN`, or an existing `claude auth` keychain login.
Don't infer a skip from a missing env var — run the layer and read its
output. A banner saying `auth: user keychain / OAuth` is a normal
successful run, not a skip.

CI runs `test:offline` on every push/PR; the full L3+L4 suite runs
nightly and on manual dispatch — see `.github/workflows/test.yml`.

## Four-layer test framework

Layer semantics are in the npm-script comments above; runners live in
`test/`. Full layer reference: `test/README.md`.

Shared helpers live in `test/lib/`. `test/lib/discover.mjs` is the **single
source of truth** for source-side directory conventions;
`installer/lib/projection.mjs` is the single source of truth for how those
map onto an installed project.

L3 and L4 run against a **real project install**, not `--plugin-dir`:
`test/lib/project-fixture.mjs` installs modules into a throwaway git repo
and runs the CLI there. Hermeticity comes from `CLAUDE_CONFIG_DIR`, never
`--bare` — see the gotchas below.

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
├── kcc.module.json                      # optional; installer-only metadata
│                                        #   ({"requires": [...]}) — kept out of
│                                        #   plugin.json, whose official
│                                        #   validator rejects unknown keys
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
  This frugality is scoped to L3 regression tests ONLY — do not
  generalize it to prompt ablation: kcc-ablation arms always run the
  model the prompt actually serves (Opus-class), never a cheaper one.
- **Triage offline first.** Run L1+L2+L4 before L3. If any are red, fix
  them first — don't burn L3 money on a known-broken plugin.
- **`--bare` is useless for testing an install.** Verified against a live
  CLI: `--bare` drops the *project's* `.claude/` as well as the user's, so
  every project-installed command, skill and agent vanishes. L3/L4 isolate
  with `CLAUDE_CONFIG_DIR=<empty dir>` instead, which gives `plugins: []`
  and none of the developer's own skills while leaving the project tree
  intact.
- **Frontmatter `description` is required** on commands, skills, and
  agents — missing it both fails L1 frontmatter schemas and prevents the
  plugin from registering at L4.

### Project-level registration rules (all verified against a live CLI)

These are what `installer/lib/projection.mjs` encodes. They are not in the
plugin docs and they are not symmetric — get one wrong and a capability
disappears silently.

- **Commands namespace by subdirectory.** `.claude/commands/<ns>/<f>.md`
  registers as `/<ns>:<f>`.
- **Skills do NOT namespace by subdirectory.** A nested
  `.claude/skills/<a>/<b>/SKILL.md` registers as *nothing at all*. A skill's
  name is its directory name **verbatim** — frontmatter `name:` is ignored —
  and a colon in that directory name survives. So
  `.claude/skills/kcc-dev-core:spec/` is what preserves the namespace.
- **Agent names come from frontmatter and may not contain a colon.** An
  agent named `kcc-pm:pm` silently fails to register. Agents are therefore
  flat, and L1 requires an agent's name to equal its filename and to start
  with its module name — otherwise two modules would overwrite each other.
- **`extraKnownMarketplaces` is ignored in project settings**, while
  `enabledPlugins` is honored. So an in-repo marketplace still needs a
  per-machine `claude plugin marketplace add`, which is why the installer
  projects files instead.
- **`$CLAUDE_PROJECT_DIR` expands in hook commands** in project
  `settings.json`, but **not** in a marketplace `path`.
- Hook scripts self-locate via `$0` and read `../context/*.md`, so keeping
  `scripts/` and `context/` adjacent under `.claude/kcc/<module>/` means
  they run unmodified. Only `${CLAUDE_PLUGIN_ROOT}` in `hooks.json` is
  rewritten.

### Installer invariants

- **The projection is a pure byte copy.** No installed file's content is
  ever rewritten, which is what keeps drift hashes exact and keeps shipped
  prompts byte-identical to the ones the ablation campaigns measured. If a
  name has to change, change it *at the source*.
- **`--modules` is declarative**, not additive: an installed module that is
  not listed gets uninstalled.
- **The lockfile is written last**, so a run that dies partway leaves the
  lock describing the old state and the next run reconciles.
- **A hook entry is kcc-owned iff its command contains `/.claude/kcc/`.**
  That predicate is the entire settings.json merge strategy: strip ours,
  append the current truth, never touch the project's own entries.
- **`.claude/` is config, not source.** `stop-test-audit.sh` excludes it —
  without that, the first turn after an install blocks on kcc's own
  freshly-untracked payload.
- **Anything that is not a regular file at a managed path is a conflict**, and
  never "absent". Treating a directory or symlink as absent classifies it as
  a new file, which skips the conflict gate and then destroys the symlink or
  dies mid-`rename` with EISDIR. `readDiskHashes` returns an `IRREGULAR`
  marker for these.
- **An empty `--modules` list is an error**, not an uninstall. `--modules
  "$UNSET"` in CI would otherwise wipe a repo's whole `.claude/`.
- **Every projected hook command must contain the ownership marker.**
  `projectHooks` throws otherwise: an unrecognizable entry is appended on
  every install, grows settings.json without bound, and survives uninstall.
- **kcc never deletes a file it did not create.** `settings.json` is removed
  only when it held nothing but our hooks.
- **Enforcement is three layers, not one**: recover (byte copy + hashes),
  detect (`--check` in CI), refuse (`kcc-guard`'s PreToolUse deny, which
  holds even under `bypassPermissions`).
- **The guard denies Bash by default once a managed path is named**, and
  allows only recognized read-only forms. The first version asked "does this
  look like a write?" and was wrong in both directions — `rm -rf <managed>`
  passed (the pattern needed a leading space) while `cat <managed> | grep x >
  /tmp/o` was blocked. Enumerating mutating forms is a losing game; enumerate
  the safe ones instead.
- **`--check` compares hooks structurally, key order and all.** A team that
  runs prettier over `settings.json` must not get a permanently red CI gate.
- **Test the product's entry point, not its libraries.** This has now bitten
  three times: a fixture that re-implemented the apply sequence skipped the
  lockfile and silently disabled kcc-guard inside it; and `plan.test.mjs`
  asserted `pulledIn` by calling `computePlan` with an *unresolved* selection
  — a shape `install.mjs` never produces — so the "+ required by your
  selection" report was dead at runtime while its unit test stayed green. A
  green unit test on a call shape the product does not make is worse than no
  test.
- **The guard protects its own arming files.** `.claude/kcc/kcc.lock.json`
  and `.claude/settings.json` are not in `modules[].files`, and without them
  the guard is a no-op — `rm` the lock and everything is writable again.
- **`--check` covers permission bits, not just content.** Modes that differ
  from 0644 are recorded per module in the lock, and an install repairs a
  drifted bit even when the content is unchanged.

## Pointers to existing workflow skills

The repo ships two auto-loaded skills in `.claude/skills/` —
`run-plugin-tests` and `write-plugin-tests`; prefer them over
re-deriving workflow details.
