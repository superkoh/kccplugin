---
name: run-plugin-tests
description: Run the four-layer kccplugin test framework and interpret its results, after editing any file in a plugin under plugins/. Use after modifying a plugin's commands, skills, agents, hooks, manifest, or scripts, and before reporting the task complete. Also use when the user asks to test, verify, check, validate, regression-test, or run tests on a plugin. In Chinese also triggers on 跑测试, 运行测试, 测一下, 验证, 验收, 检查, 回归测试, 跑一下. Honors PLUGIN=<name> to scope to a single plugin.
---

# Running plugin tests in this marketplace

This repo ships a four-layer test framework under `test/`. Layers:

- **L1** — schemas (ajv strict) + official `claude plugin validate`.
  Offline, free, deterministic.
- **L2** — per-plugin unit tests, dispatched by file extension:
  `.bats` → bats, `*.test.mjs` / `*.test.js` → `node --test`,
  `test_*.py` → `python3 -m pytest`. Offline, free, deterministic.
- **L3** — declarative YAML e2e cases calling `claude -p` with loose
  matchers. Real API cost. Non-deterministic (model output drift).
- **L4** — load-time assertions: start the CLI with `--plugin-dir`,
  read the init system message, assert that required slash commands
  and MCP servers registered. Tiny API cost; SIGKILL after init.

## Determining the target plugin

Every command below takes a `PLUGIN=<name>` environment variable to
scope to a single plugin. Picking the right `<name>` is your job;
the framework will not guess. Infer it in this order, strongest
signal first:

1. **Explicit name in the user's message.** Literal plugin name
   ("hello-world", "foo-bar"), or a slash-command namespace like
   `/foo:bar` where `foo` is the plugin.
2. **File paths of the edits you just made.** If your previous edits
   touched `plugins/<name>/...`, the target is `<name>`. If several
   plugins were touched, run the tests once per plugin — don't
   arbitrarily pick one.
3. **Recent conversation context.** Only one plugin has been
   discussed in the last few turns.
4. **Cannot infer.** Run `ls plugins/` to enumerate, then **ask the
   user** which plugin to test.

**Never omit `PLUGIN=` unless the user explicitly asked for "every
plugin" / "all plugins" / "full regression"** (or when running in CI
where the cost of testing all plugins is acceptable). Omitting the
filter quietly runs L3 against every plugin's e2e cases and multiplies
API spend.

### Free sanity check when you're unsure of the name

If you have a guess but aren't 100% sure it's spelled right, validate
it for free before spending L3 money:

```bash
PLUGIN=<guess> npm run test:l1
```

A typo prints exactly:

```
PLUGIN filter "<guess>" did not match any plugin. Available: <plugin-a>, <plugin-b>, ...
```

Read the canonical name from the `Available:` list and retry. This
costs nothing and takes milliseconds — always cheaper than burning
an L3 run on the wrong plugin.

## Command cheat sheet

```bash
# Everything (respects PLUGIN= filter, or runs over every plugin)
npm test

# Offline layers only — fast, free, safe to run on any edit
npm run test:offline          # == L1 + L2

# Single layer
npm run test:l1               # schemas + official validate
npm run test:l2               # bats / node --test / pytest
npm run test:l3               # e2e YAML cases, real API
npm run test:l4               # registration check, tiny API

# Scope to one plugin (hard error on typo — never silent no-op)
PLUGIN=<name> npm test
PLUGIN=<name> npm run test:l1
```

## Which layers to run after which edit

Use this table to decide what's worth running. Don't burn L3 money if
the edit can't possibly change model behavior.

| Edited                             | Run                       |
|------------------------------------|---------------------------|
| plugin.json / marketplace.json     | L1                        |
| commands/*.md frontmatter          | L1 + L4                   |
| skills/<x>/SKILL.md frontmatter    | L1 + L4                   |
| agents/*.md frontmatter            | L1 + L4                   |
| hooks/hooks.json                   | L1 + L2 bats              |
| shell script under scripts/        | L2 bats                   |
| JS/TS lib or MCP server            | L2 node --test            |
| Python MCP server                  | L2 pytest                 |
| command / skill / agent body prose | L3 + L4                   |
| behavioral change the user asked for | full `npm test`        |
| README / docs only                 | (skip — no code changed)  |

**Run the offline layers first.** If L1+L2+L4 are green, L3 is worth
the spend. If any of them are red, fix before burning L3 money.

## Reading each layer's output

### L1 — schemas + official validate

```
✓ marketplace.json (schema)
✓ plugins/<name>/plugin.json (schema)
✓ plugins/<name>/commands/<x>.md (frontmatter)
✓ claude plugin validate plugins/<name>
```

`✓` means our strict ajv schemas accepted it AND the official
`claude plugin validate` also accepted it. Failures are usually one
of these:

- `at .name: must match pattern "^[a-z0-9][a-z0-9-]*$"` — plugin name
  is not kebab-case.
- `at : must NOT have additional properties {"additionalProperty":"foo"}`
  — there's a typo in a field name, or our schema is missing a legit
  field. First check for a typo; if the field is real and documented,
  relax the relevant schema in `test/schemas/` with a one-line addition.
- `misplaced directory: .../.claude-plugin/commands must live at the plugin root`
  — someone put `commands/`, `skills/`, `agents/` or `hooks/` inside
  `.claude-plugin/` by mistake. The CLI silently ignores them there.
- `manifest.name "foo" does not match directory name "bar"` — the
  directory name is the slash-command namespace, so it has to match.

### L2 — unit tests

```
✓ <plugin> [node --test]  (1 file)
✓ <plugin> [bats]         (1 file)
- <plugin> [bats]         (1 file)
    skipped: `bats` not on PATH — install from https://github.com/bats-core/bats-core
```

A `- skipped` line is a hint, not a failure. If a plugin ships bats
tests and bats isn't installed locally, install it:

```bash
brew install bats-core
```

L2 is deterministic. If it's flaky, the test itself is wrong — fix
the test, don't retry.

### L3 — e2e YAML cases

```
L3  End-to-end  (1 case, fallback (user keychain / OAuth; --bare dropped))
------------------------------------------------------------------------
  ✓ <plugin>  <case-name>  (5888ms)
      cost=$0.008675  in=18  out=428  cache_r=57080  cache_w=324  api=6287ms
```

**The metrics line IS the proof of a real API call.** Read it as:

- `cost=$X` — total spend for this case. Non-zero ⇒ model really replied.
- `in=N out=N` — input tokens sent, output tokens generated.
- `cache_r=N cache_w=N` — prompt cache hit/write tokens (Claude Code
  sends a huge system prompt, cache hits are expected and cheap).
- `api=Nms` — API-side duration (should track wall clock).

**A "zero-metrics" case is a red flag.** If you see:

```
      cost=$0.0000  in=0  out=0
  note: zero cost/tokens — no real API call happened this run.
```

…the CLI errored out before reaching the model. Inspect `parsedJson.is_error`
and the stderr tail that L3 prints under the failure. Common causes:

- `Not logged in · Please run /login` — auth. If `ANTHROPIC_API_KEY` is
  unset, `--bare` is auto-dropped and the user's keychain OAuth is used;
  if neither works, log in with `claude` or set the env var.
- Bad `--plugin-dir` path, bad command name, bad JSON schema argument.

Common behavioral failures (real call, wrong result):

- `exitCode: expected 0, got 1` + `is_error: expected false, got true` —
  the CLI considers the run an error. Check the `result` field in the
  parsed JSON for the error message.
- `stdout.contains: missing "foo"` — the model didn't produce the
  expected substring. If this is flaky, either loosen the matcher
  (use `notContains` on error phrases instead of `contains` on exact
  words) or tighten the case with a `jsonSchema` block.
- `crashed: timeout` — bump `timeoutMs` in the YAML, or switch to a
  faster model.

### L4 — load-time registration

```
✓ <plugin>  (asserted)
    slash_commands: ["<plugin>:<cmd>", "<plugin>:<skill>"]
```

- `(smoke)` — plugin has no `tests/sdk/expected.json`; L4 only
  verified the CLI could *load* the plugin without crashing.
- `(asserted)` — every name listed in `expected.json` under
  `slashCommands.requires` / `mcpServers.requires` was found in the
  init message.

Common failures:

- `required "<plugin>:<cmd>" not registered (saw: [...])` — the command
  or skill didn't get picked up. Check that the file lives in
  `plugins/<name>/commands/` or `plugins/<name>/skills/<x>/SKILL.md`
  (NOT inside `.claude-plugin/`). Check that the frontmatter has a
  non-empty `description`.
- `claude exited (code=1) before init message was seen` — the CLI
  crashed during plugin load. Reproduce by hand to see the real error:

  ```bash
  claude --debug --plugin-dir plugins/<name> -p "ping"
  ```

## Budget discipline

L3 is the only layer with real cost. Rules:

1. **Default to Haiku.** The L3 runner already defaults to
   `claude-haiku-4-5-20251001`. Don't override unless a test genuinely
   can't pass on Haiku.
2. **Cap every case** with `maxBudgetUsd` in the YAML. 0.05 is usually
   plenty.
3. **Skip L3 on doc-only edits.** README / docstring changes can't
   change plugin behavior.
4. **Triage offline first.** Run L1+L2+L4 before L3. If any are red,
   fix those first — don't burn L3 money on a known-broken plugin.
5. **Single-plugin filter when debugging.** `PLUGIN=<name>` avoids
   running unrelated plugins' e2e cases while iterating.

## Auth modes

The L3 header line tells you which mode is active:

- `hermetic (--bare + ANTHROPIC_API_KEY)` — env var is set, CLI runs
  with `--bare` (skips hooks, LSP, auto-memory, CLAUDE.md discovery,
  plugin sync). Fully reproducible; ideal for CI.
- `fallback (user keychain / OAuth; --bare dropped)` — no env var; the
  CLI falls back to the user's `claude auth` login. Slightly less
  hermetic because user environment can leak in, but works for local
  dev without an API key.

Both are valid. CI should set `ANTHROPIC_API_KEY` as a secret for
reproducibility. Local dev can use either.

L4 always uses `--bare` regardless of auth mode — it only cares about
the init message, which is emitted before auth, and the child is
SIGKILL'd before any real API traffic.
