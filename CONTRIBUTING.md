# Contributing to kccplugin

Thanks for your interest in contributing! `kccplugin` is a Claude Code plugin
marketplace with a four-layer automated test framework. Plugins live under
`plugins/<name>/` and are auto-discovered — the framework hardcodes no
plugin names.

## Ground rules

- **Fork & PR.** `main` is protected. Open a pull request from a feature
  branch — direct pushes are blocked for everyone, including maintainers.
- **CI must be green.** The `L1 + L2 (offline)` job is a required status
  check. Run it locally before pushing to save a round trip.
- **License.** By contributing, you agree that your contribution is
  licensed under the MIT License (see [LICENSE](LICENSE)).

## Development setup

Requires Node ≥ 20.

```bash
npm install
npm run test:offline      # L1 + L2, free, offline, pre-commit safe
```

Scope any test command to a single plugin with `PLUGIN=<name>`:

```bash
PLUGIN=hello-world npm run test:offline
PLUGIN=hello-world npm run test:l1
```

Typos in `PLUGIN=` are a hard error, not a silent no-op.

## Repo layout

Every plugin sits in its own directory under `plugins/`. The directory name
is authoritative — it must match `.claude-plugin/plugin.json`'s `name`
field and becomes the slash-command namespace.

```
plugins/<name>/
├── .claude-plugin/plugin.json
├── commands/*.md
├── agents/*.md
├── skills/<skill>/SKILL.md
├── hooks/hooks.json
├── scripts/*.sh
└── tests/
    ├── unit/      # L2 (bats / node --test / pytest)
    ├── e2e/*.yaml # L3
    └── sdk/expected.json  # L4
```

See [`CLAUDE.md`](CLAUDE.md) for the full directory conventions and
[`test/README.md`](test/README.md) for a self-contained tour of the test
framework.

## Before opening a PR

1. `npm run test:offline` passes locally (or `PLUGIN=<name> npm run test:offline`).
2. If you added a new plugin, command, skill, agent, hook, or MCP server,
   add tests under that plugin's `tests/` directory. The `write-plugin-tests`
   skill in `.claude/skills/` has templates for every layer.
3. If you touched L3 YAML cases, cap each one with `maxBudgetUsd` (0.05 is
   usually plenty) — don't reach for Opus in regression tests.
4. If upstream Claude Code adds a new manifest field, update the matching
   JSON schema under `test/schemas/` in the same PR so L1 stays strict.
5. Write commit messages that explain **why**, not just **what**.

## Running the full suite

L3 and L4 need `ANTHROPIC_API_KEY` and cost a small amount of money:

```bash
npm run test:l4           # tiny API cost, load-time registration checks
npm run test:l3           # real API cost, declarative e2e cases
npm test                  # full L1 → L2 → L4 → L3
```

Without `ANTHROPIC_API_KEY`, L3/L4 self-skip. CI runs the full suite
nightly and on manual dispatch — see `.github/workflows/test.yml`.

## Reporting issues

Open a GitHub issue with a minimal reproduction and the output of the
failing test layer. For L1 failures, copy the ajv error messages verbatim
— they pinpoint the offending field.
