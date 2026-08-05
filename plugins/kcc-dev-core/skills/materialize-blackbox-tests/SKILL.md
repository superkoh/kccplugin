---
description: Use when the user asks to 落地黑盒测试 / 把黑盒用例落成代码 / 写黑盒测试代码 / 生成黑盒测试代码 / materialize black-box tests / turn blackbox.md into runnable test code / implement the black-box test suite. Takes a reviewed .kcc/specs/<slug>/blackbox.md and, before any implementation exists, turns its automated-mode cases into a runnable implementation-independent test project, lints the black-box boundary, then runs the suite red and classifies every failure as expected-red / broken-test / unexpected-green. Standalone capability — no workflow, no orchestration, no team.
---

# Materializing black-box test code

Turns the `Mode: automated` cases of a reviewed `blackbox.md` into
runnable test code, **before any implementation exists**, and proves
the suite red for the right reasons. `Mode: llm-driven` cases are not
materialized — they stay in `blackbox.md` for an LLM executor.
Self-contained: read → confirm → scaffold → write → lint → review →
red-run → report.

The test code inherits the black-box contract from
`kcc-dev-core:write-blackbox-tests`: zero dependency on implementation
code, setup and cleanup through external surfaces only, oracles
decidable from the case text alone.

## When to use

Trigger phrases: 落地黑盒测试 / 把黑盒用例落成代码 / 写黑盒测试代码 /
materialize black-box tests / turn blackbox.md into test code.

### When NOT to use

- Writing or revising the cases themselves →
  `kcc-dev-core:write-blackbox-tests`.
- Unit tests or any white-box tests — written during implementation,
  out of scope.
- Executing `Mode: llm-driven` cases — a runtime activity, not code
  generation.

## Process

### 1. Locate the case file

Find `.kcc/specs/<slug>/blackbox.md` — the slug under discussion, or
the most recently written one. Read it in full, plus the sibling
`spec.md` for the surface contracts when it exists; without a spec,
each case's `Surface:` text is the contract. Split cases by `Mode:`,
skipping `## Pending cases` entries (they are not cases). `llm-driven`
cases appear in the final report as not-materialized — executing them
is an LLM agent's or a human's job; this plugin ships no executor. If
no `automated` case remains, skip steps 3–7 and just report.

### 2. Confirm with `AskUserQuestion`

- **Review gate** — has a human read and signed off on the cases? The
  gap sweep inside `write-blackbox-tests` does not count. If not, stop
  and recommend review first: unreviewed cases materialized into code
  turn case bugs into sunk cost.
- **Test project location** — propose 1–3 locations derived from this
  repo's conventions (existing test layout, language, build tooling),
  your recommendation first. Wherever it lands, one constraint is
  non-negotiable: an isolated package with its own dependency
  manifest and zero imports from implementation source.
- **Harness & environment** — the test framework (propose from the
  repo's stack) and the target environment (base URL / app entry /
  credentials source), or "no environment yet".

### 3. Scaffold or extend the test project

First time in a repo: create the project at the confirmed location —
own dependency manifest, own lockfile, no path or module references
into implementation source. Afterwards: extend it, one file group per
feature slug.

### 4. Write the tests

- One test per `Mode: automated` case; the test name carries its
  BB-ID.
- **Given** and `Setup:` → setup through external surfaces only;
  **When** → the action; **Then** → the assertions — nothing beyond
  them; `Cleanup:` → idempotent teardown, external surfaces only.
- Carry `[PRE-IMPL: green — existing behavior]` annotations into the
  test (comment or metadata) so the red-run classifier knows what to
  expect.
- A case marked `[EXTERNAL-SETUP: blocked — <reason>]` is not
  materialized: list it as blocked in the report and let the user
  decide whether to approve a documented fixture backdoor.

### 5. Black-box lint

- Zero imports from implementation source — no path or module
  reference from the test project into the system under test.
- No DB client / ORM / internal queue client in setup or cleanup.
- Every automated BB-ID has exactly one test; no orphan tests without
  a BB-ID.

### 6. Conformance review

Spawn one fresh-context reviewer subagent with `blackbox.md` and the
test code, asking per test: does it assert exactly its case's
**Then**, prepare exactly its **Given** / `Setup:`, tear down exactly
its `Cleanup:`, and nothing more or less? Fix findings before running.

### 7. Red run

With an environment available, run the suite and classify every case:

| Status | Meaning | Disposition |
|--------|---------|-------------|
| `expected-red` | Fails because the surface or behavior doesn't exist yet. | The healthy state — record it. |
| `broken-test` | Crash, config error, syntax, harness timeout. | Fix on the spot, rerun. |
| `unexpected-green` | Passes before implementation. | Legitimate iff annotated `[PRE-IMPL: green]`; otherwise a smell — the assertion is vacuous or the case isn't testing the new behavior. Investigate and report. |

No environment yet → degrade to compile / dry-run + lint, mark the
red run `deferred`; running it becomes the first act of the
implementation phase.

### 8. Report

Write the per-case status table (BB-ID, status, reason) to
`.kcc/specs/<slug>/blackbox-status.md` — `blackbox.md` is the task's
Definition of Done, so its execution state must survive the session.
Then report the table, the not-materialized `llm-driven` list,
deferred red-runs, and every lint / conformance / unexpected-green
exception. State the test project path.

<!-- kcc-dev-core-materialize-blackbox-tests-sentinel: v1 -->
