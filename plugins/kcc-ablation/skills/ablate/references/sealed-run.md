# Sealed runs on Claude Code — recipe, event shapes, and measured leaks

How to run one probe arm under `claude -p` so that the ONLY difference
between arms is the document under test. Everything here was paid for
once; the checklist at the bottom lists what each leak cost.

## The run command

```
claude -p "<probe prompt>" \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  --output-format stream-json --verbose --include-hook-events \
  --max-budget-usd <cap> \
  --model <model> \
  --disallowedTools <comma-joined lockdown> \
  --plugin-dir <path to this arm's plugin variant>
```

- `--permission-mode bypassPermissions` is **mandatory** for any probe
  that may touch files: headless `claude -p` denies every Write under
  the default mode, the model spends its whole budget trying
  workarounds (measured: 14–27 turns per run), and both arms come back
  empty — which reads as "no delta" but is zero information. The blast
  radius is confined to the throwaway workspace below.
- `--output-format stream-json --verbose --include-hook-events` is what
  makes deterministic arm attribution possible (see event shapes).
- `--bare` is deliberately **not** used: it refuses OAuth tokens, and
  the sealed environment below achieves the same isolation without
  requiring an API key. It also strips the project `.claude/`, which
  breaks probing project-scoped plugins. Watch your runner's defaults:
  a runner may auto-engage `--bare` whenever `ANTHROPIC_API_KEY` is set
  (this repo's `test/lib/claude-runner.mjs` does), so authenticate with
  `CLAUDE_CODE_OAUTH_TOKEN` — or pass the runner's explicit opt-out —
  to keep it off.
- Timeouts: short reasoning probes finish in minutes, but a full
  authoring probe (e.g. produce a whole spec document) can overrun a
  5-minute timeout and get SIGKILLed mid-stream — landing invalid at
  $0.000 with no result event. Give authoring probes 20 minutes;
  per-probe override, generous default.

## Environment sealing

| leak | seal |
|---|---|
| user's global plugins / settings | `CLAUDE_CONFIG_DIR` → fresh empty dir (the CLI also relocates `.claude.json` into it) |
| `~/.claude`, reachable if the model shells out | `HOME` → fresh empty dir |
| project context (`CLAUDE.md` discovery walks UP from cwd) | cwd → throwaway dir under `os.tmpdir()`, **never inside any repository** |
| workspace-trust dialog silently blocking plugin loading | write `{"projects":{"<abs project dir>":{"hasTrustDialogAccepted":true}}}` into `$CLAUDE_CONFIG_DIR/.claude.json` |

`makeSealedWorkspace` in `../scripts/seal.mjs` builds the triple and the
trust entry in one call.

## Auth ordering

Read credentials **before** sealing `HOME`: on macOS, `security`
resolves the login keychain through `$HOME`, so a keychain read inside
the sealed environment finds nothing. Export
`CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) in the parent
process; only the child gets the sealed `HOME`. Never echo the token.

The judge run seals itself the same way, so it needs the same auth
passthrough — a judge with no auth returns nothing, and every judged
probe comes back UNPARSEABLE at $0.00, which reads exactly like "the
rule does nothing" unless voided (see `screenRun`).

## stream-json event shapes (as observed)

- **Arm attribution:** `{"type":"system","subtype":"hook_response",...}`
  events carry the hook's stdout in `.output`; parse it as JSON and read
  `hookSpecificOutput.additionalContext`. Grep the arm's sentinel there
  — deterministic, never via model narration. Main-session docs arrive
  on the `SessionStart` event, subagent variants on `SubagentStart`.
- **Result:** the `{"type":"result"}` event carries `is_error`,
  `subtype` (`success` / `error_max_budget_usd` / …), `total_cost_usd`,
  `num_turns`, and `permission_denials` (an **array**, not a number).
  No result event at all means the run died (timeout, SIGKILL) — invalid.
- **Tool calls:** `assistant` events, `message.content[].type ==
  "tool_use"`. Pair them with `user` events' `tool_result` blocks by
  `tool_use_id`: `is_error: true` ("No such tool available") means the
  call was refused and never ran — an attempted call is NOT a lockdown
  escape; only an executed one is.
- `../scripts/extract.mjs` turns all of this into observables.

## Measured-leak checklist

Each entry was observed in a real campaign, not theorized:

- **No `bypassPermissions`** → both arms empty at full price ($9.69
  once, because the smoke run was skipped). Smoke first: one cheap-model
  run of a trivial file-writing task, then check the fixture landed, the
  sentinel attributed, and the extractor classified it.
- **Prompt mentions the sentinel** → the model goes hunting for it with
  its own tools (`find ~/.claude`) and can surface the user's globally
  installed copy of the plugin, corrupting arm identity. The probe
  prompt never mentions sentinels; grep the transcript instead.
- **`skills/` left in the variant** → arm B reads the ablated rule back
  through Read/Grep/Skill and the delta collapses to noise
  (`makeDocVariant` deletes it for skill-delivery rules).
- **Workspace inside a repository** → CLAUDE.md and project skills leak
  in; one run spent 3 minutes fanning out over the host repo instead of
  answering.
- **Conditional injection without its trigger** → a hook that only
  injects inside a software project injects nothing into an empty
  fixture, and every run voids as `arm sentinel absent`; plant a
  `package.json` (or the hook's actual trigger) in the fixture.
- **macOS `/private/tmp` vs `/tmp`** → the same written file counted
  twice unless normalized (`normalizePath` in `../scripts/extract.mjs`).
- **Agent memory counted as probe artifact** → the model writing its own
  memory under `CLAUDE_CONFIG_DIR` is not a deliverable; the extractor
  drops paths outside the project dir.
- **Roster tools off the lockdown list** → one run escaped via
  `ListAgents` before the deny-list grew the agent/MCP roster tools;
  keep the lockdown in one module (`../scripts/lockdown.mjs`) and add
  any newly observed escape hatch there.

## Cost calibration (measured 2026-08, Opus-class arms)

- Arms: always the model the document serves in production (Opus-class
  here) — never downgraded to save money. A cheap arm measures a
  different model, and every verdict it produces is void.
- Short reasoning probe: ~$0.1–0.8 per run under cap.
- Full authoring probe (spec/tests): ~$1.2–1.8 per run.
- A 3-round two-arm campaign lands around $9; B-first ordering and
  reusing unchanged baselines each roughly halve it.
- Smoke runs: use a small model (Haiku-class) — a $0.03 smoke has
  repeatedly paid for itself.
- Judge: a small-but-capable model (Sonnet-class) with a tight cap
  (~$0.25) is plenty for a binary rubric.
