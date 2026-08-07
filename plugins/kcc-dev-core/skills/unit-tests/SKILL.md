---
description: Use when the user asks to 写单测 / 写单元测试 / 补单测 / 加单元测试 / 用 TDD 实现 / write unit tests / add unit tests / cover this code with unit tests — and proactively before implementing code that branches. Which units actually earn a test is this skill's own per-unit call, so don't pre-decide it before entering; an empty selection is a valid one-line outcome. Writes contract-first tests that can provably fail — red-first for new code, a mutation probe for backfill, a failing reproduction for a bug fix. Requirement-side black-box cases, and turning them into runnable code, are kcc-dev-core:blackbox-tests, not this skill. Standalone capability — no workflow, no orchestration, no team.
---

# Writing unit tests

The failure this skill exists to prevent is the tautological test —
one derived from the implementation it is supposed to check, so it
stays green however wrong the logic is.

## Principles

- **Hand-derive every expected value** — Derive every expected value
  from the requirement or contract, never by running the implementation
  and pasting its output back as the expectation.
- **Underivable expectation is a question** — An expectation you cannot
  derive is a question for the user, not a guess.
- **Backfill reads code only for branches** — Backfill reads the
  implementation only to enumerate branches, never to source expected
  values.
- **Assert observable behavior only** — Assert only return values,
  thrown errors, and calls to declared dependencies, never private
  methods, internal fields, or intermediate state, which break on
  refactors rather than on bugs.
- **Prove every test can fail** — Every test is proven able to fail
  before it is trusted, by the gate its mode dictates (new code,
  backfill, or bug fix).
- **New code goes red first** — In new-code mode the test goes red
  first against a stub with the real signature, and that red must be
  assertion-level (`expected 42.5, received undefined`) rather than an
  ImportError, a syntax error, or `0 tests collected`.
- **Backfill runs a mutation probe** — In backfill mode, with the tests
  green, break the implementation once per unit at the branch whose
  assertion you trust least, confirm a test fails, revert — a surviving
  mutation is a powerless assertion.
- **Bug fixes start red** — In bug-fix mode the reproduction test fails
  on the unfixed code first.
- **Never weaken a test to reach green** — Never weaken a test to reach
  green: a red test means the code is wrong until proven otherwise, so
  fix the code, unless you believe the contract itself is wrong, which
  stops and asks via `AskUserQuestion`.
- **A red suite is not a finished run** — A red suite handed back as
  finished is not an outcome, so when the fault sits in code the task
  didn't set out to change, fix it there or say so explicitly.
- **Fake only what the contract declares** — Nothing outside what the
  contract declares gets a test double, every double sits at the
  interface the contract names, and needing to invent a mock's behavior
  means the contract has a gap — fix that first, before it resurfaces
  at integration time.
- **Double the unpredictable collaborators** — Network, DB, clock,
  randomness and filesystem get test doubles.
- **Skip glue by category** — CLI entry points and argv parsing, wiring
  and forwarding, config and constant exports, thin wrappers over
  third-party libraries, and DTOs are skipped by category membership,
  never by weighing an individual unit on its merits, and sitting next
  to interesting logic does not pull them back in.
- **Name the localisation reason** — For what survives, name in one
  clause why a higher-level test would miss its bug or fail to localise
  it, and a unit with no such clause gets no test.
- **No coverage-percentage KPI** — No coverage percentage is set or
  chased as a KPI, and coverage expectations tier by directory instead
  — core logic high, UI composition and glue low or exempt.
- **Spikes may go implementation-first** — Exploratory code whose
  interface is still moving may go implementation-first, as may a unit
  you selected and then skipped, and every spike is declared in the
  report.
- **An empty selection is a finished run** — Selecting no unit at all
  is a finished run whose skips are the whole report.
- **Frontend logic moves to pure units** — Squeeze logic out of
  components into pure functions or hooks and unit-test those.
- **Test components through user-visible behavior** — Drive whatever
  stays in a component through user-visible behavior (role and label
  queries), not internal state.
- **Hard to test means coupled** — "Hard to test" is a coupling signal,
  not a call for heavier machinery.
- **Report the mode** — The report names the mode the run used.
- **Report the gate evidence** — The report carries the gate evidence
  (red → green output, probe result, or repro failure), the units
  skipped and why, and every contract gap handed back to the user.

<!-- kcc-dev-core-unit-tests-sentinel: v1 -->
