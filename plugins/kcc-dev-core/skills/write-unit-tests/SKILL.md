---
description: Use when the user asks to 写单测 / 写单元测试 / 补单测 / 加单元测试 / 用 TDD 实现 / write unit tests / add unit tests / cover this code with unit tests — and proactively before implementing code that branches. Which units actually earn a test is this skill's own per-unit call, so don't pre-decide it before entering; an empty selection is a valid one-line outcome. Writes contract-first tests that can provably fail — red-first for new code, a mutation probe for backfill, a failing reproduction for a bug fix. Requirement-side black-box cases are kcc-dev-core:write-blackbox-tests, and turning them into runnable code is kcc-dev-core:materialize-blackbox-tests, not this skill. Standalone capability — no workflow, no orchestration, no team.
---

# Writing unit tests

The failure this skill exists to prevent is the tautological test —
one derived from the implementation it is supposed to check, so it
stays green however wrong the logic is.

## Principles

- **Hand-derive every expected value** from the requirement or
  contract. Never run the implementation and paste its output back as
  the expectation. An expectation you cannot derive is a question for
  the user, not a guess. Backfill reads the implementation only to
  enumerate branches, never to source expected values.
- **Assert observable behavior only** — return values, thrown errors,
  calls to declared dependencies. Never private methods, internal
  fields, or intermediate state: those break on refactors, not on
  bugs.
- **Prove the tests can fail**, per mode:
  - *new code* — red first against a stub with the real signature.
    The failure must be assertion-level (`expected 42.5, received
    undefined`); an ImportError, a syntax error or `0 tests
    collected` is a false red, and a test green against the stub has
    no power.
  - *backfill* — mutation probe: with the tests green, break the
    implementation once per unit on the branch whose assertion you
    trust least, confirm a test fails, revert. A surviving mutation
    is a powerless assertion.
  - *bug fix* — the reproduction test fails on the unfixed code
    first.
- **Never weaken a test to reach green.** A red test means the code
  is wrong until proven otherwise — fix the code. When the fault is
  in code the task didn't set out to change, fix it there or say so
  explicitly; a red suite handed back as finished is not an outcome.
  Believing the contract itself is wrong is the one case that stops
  and asks via `AskUserQuestion`.
- **Fake only what the contract declares.** Network, DB, clock,
  randomness and filesystem get test doubles at the interface the
  contract names. Needing to invent a mock's behavior means the
  contract has a gap — fix that first; the gap resurfaces at
  integration time otherwise.
- **Skip glue by category, no weighing** — CLI entry points and argv
  parsing, wiring and forwarding, config and constant exports, thin
  wrappers over third-party libraries, DTOs. Sitting next to
  interesting logic does not pull them back in. For what survives,
  name in one clause why a higher-level test would miss its bug or
  fail to localise it; no clause, no test.
- **No coverage-percentage KPI.** Tier by directory instead — core
  logic high, UI composition and glue low or exempt.
- **Spike exception.** Exploratory code whose interface is still
  moving may go implementation-first, and a unit you selected but then
  skipped is a spike too — declare either in the report and backfill
  once the interface settles.
- **Frontend**: squeeze logic out of components into pure functions
  or hooks and unit-test those; drive the rest through user-visible
  behavior (role and label queries), not internal state. "Hard to
  test" is a coupling signal, not a call for heavier machinery.

Report the mode, the gate evidence (red → green output, probe result,
or repro failure), the units skipped and why, any spike declared, and
contract gaps handed back to the user. Selecting no unit at all is a
finished run — the skips are then the whole report.

<!-- kcc-dev-core-write-unit-tests-sentinel: v3 -->
