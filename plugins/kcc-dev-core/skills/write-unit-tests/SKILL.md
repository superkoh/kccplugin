---
description: Use when the user asks to 写单测 / 写单元测试 / 补单测 / 加单元测试 / 用 TDD 实现 / write unit tests / add unit tests / cover this code with unit tests — and proactively before implementing new code whose logic branches enough to be worth protecting. Writes contract-first unit tests during implementation — new-code mode goes red-first against a stub with real failure output; backfill mode targets existing code and proves test power with a temporary mutation probe; a bug fix starts from a failing reproduction test. Anti-tautology throughout — expectations traced to requirements, observable behavior only, tests frozen while implementing. Requirement-side black-box cases are kcc-dev-core:write-blackbox-tests, not this skill. Standalone capability — no workflow, no orchestration, no team.
---

# Writing unit tests

Writes unit tests **during implementation**, one unit at a time,
contract-first: every test binds to the unit's signature and behavior
contract, never to its implementation internals. There is no
intermediate case document — unlike the black-box family, the test
code *is* the case. The enemy throughout is the **tautological test**:
a test derived from the implementation it is supposed to check, which
stays green no matter how wrong the logic is. Every rule below exists
to keep tests able to fail.

Three modes, chosen per unit in step 2: **new-code** (the unit does
not exist yet — full red-first loop), **backfill** (the unit already
works — a mutation probe replaces the red gate), **bug-fix**
(backfill, except the reproduction test must fail on the unfixed
code — that is its red gate).

## The unit-test contract

Every test must satisfy all of these:

- **Contract-first, never implementation-first.** A test depends only
  on the unit's signature and behavior contract — parameters, return
  shape, declared errors, declared dependency interfaces. Reading the
  implementation to decide what to assert is how tautologies are
  born; in new-code mode there is nothing to read, and in backfill
  mode the implementation is consulted only to enumerate branches to
  cover, never to source expected values.
- **Expectations trace to requirements.** Every expected value is
  hand-derived from the requirement or contract (compute the example
  yourself). Never run the implementation and paste its output back
  as the expectation. An expectation you cannot trace or hand-derive
  is a question for the user, not a guess.
- **Observable behavior only.** Assert return values, thrown errors,
  and calls to declared dependencies. Never private methods, internal
  fields, or intermediate state — those assertions break on
  refactors, not on bugs.
- **Every test can provably fail.** New code: the suite must be seen
  red before implementing, and the failure must be assertion-level
  (`expected 42.5, received undefined`) — an ImportError, a syntax
  error, or `0 tests collected` is a false red, and a test green
  against the stub has no power. Backfill: the mutation probe
  (step 5) supplies the same proof.
- **Tests are frozen during implementation.** A red test means the
  implementation is wrong until proven otherwise. Changing a test
  assertion to reach green requires stopping and confirming via
  `AskUserQuestion`, with a requirement-level reason the contract —
  not the implementation — is believed wrong.
- **Spike exception.** Exploratory code whose interface is still
  moving may go implementation-first — declare the spike explicitly
  in the report, and backfill once the interface settles.

## When to use

Trigger phrases: 写单测 / 写单元测试 / 补单测 / 用 TDD 实现 / write
unit tests / add unit tests / cover this with unit tests. Also enter
proactively when about to implement new code with branching logic
that clears step 1's bar.

### When NOT to use

- Implementation-independent test cases from requirements, before any
  implementation exists → `kcc-dev-core:write-blackbox-tests`.
- Turning `blackbox.md` into runnable black-box code →
  `kcc-dev-core:materialize-blackbox-tests`.
- Page- or flow-level E2E — the black-box family's territory, not
  unit testing.

## Process

### 1. Scope the units

Work through
[`references/what-to-test.md`](references/what-to-test.md): pick the
units whose failure would be invisible or undiagnosable from
higher-level tests; skip the low-value catalog (glue, config, thin
wrappers, boilerplate). State the selection and the skips in one or
two lines — don't test everything to look thorough; tests written to
occupy coverage are where tautologies breed. Frontend code first
routes through
[`references/frontend-testing.md`](references/frontend-testing.md)
to pick the layer.

### 2. Pick the mode per unit

- Unit doesn't exist yet → **new-code**: steps 3–6 in order.
- Unit exists and works → **backfill**: steps 3–4, then the mutation
  probe in step 5.
- Fixing a bug → **bug-fix**: steps 3–4 for the reproduction test,
  which must fail on the unfixed code (step 5), then fix to green
  (step 6).

Granularity is one unit — one function or one behavior — per loop.
Don't batch (all stubs, then all tests, then all implementation):
distance between writing a test and implementing against it is where
"adjust the test to pass" creeps in.

### 3. Pin the contract

Write down, before any test: signature, preconditions,
postconditions, error cases, declared dependency interfaces, and 2–5
example input → output rows hand-derived from the requirement. Put it
where the project keeps such things (doc comment on the stub, spec
file, or the conversation). If a `.kcc/specs/<slug>/spec.md` covers
this unit, derive from it. New-code mode: create the stub now —
correct signature, body throws not-implemented or returns a dummy —
so tests compile against a real symbol. Backfill mode: the contract
comes from requirements and call sites; the implementation is
consulted only to enumerate branches.

### 4. Write the tests

- One behavior per test, named after the behavior.
- Coverage floor per unit: the happy path, each boundary the contract
  implies (empty / 0 / max / null), and every declared error branch.
  Happy-path-only is unfinished.
- At least one meaningful assertion per test. Banned: assert-true,
  call-without-assert, and "doesn't throw" as the only check (unless
  not-throwing is the contracted behavior).
- External dependencies (network, DB, clock, randomness, filesystem)
  are replaced with test doubles at the interface the contract
  declares. If the contract declares no interface for something the
  unit needs, fix the contract first — an invented mock behavior is a
  contract gap that will resurface at integration time.

### 5. Gate: prove the tests can fail

- **New-code — red gate.** Run the suite; paste the real output.
  Every failure must be assertion-level. ImportError / syntax error /
  `0 tests collected` → fix the harness and rerun. Any test green
  against the stub has no power; fix it before implementing.
- **Backfill — mutation probe.** Run the suite: it should be green
  against the existing implementation (a red here is either a real
  bug just found — report it — or a broken test). Then probe:
  temporarily break the implementation 1–2 ways per unit (invert a
  condition, change a constant, drop a call), confirm at least one
  test fails each time, and revert. A mutation that survives means an
  assertion with no power; strengthen it and re-probe.
- **Bug-fix.** The reproduction test fails on the unfixed code, with
  the failure output pasted.

### 6. Implement to green

New-code and bug-fix: write the implementation; tests are frozen (see
contract). Run to green and paste the output. A test you believe is
wrong → stop, `AskUserQuestion`, with the requirement-level reason.

### 7. Report

Per unit: mode, gate evidence (red→green outputs, probe results, or
repro failure), skips with reasons, spikes declared, frozen-test
conflicts raised, and any contract gaps handed back to the user.

## References

- [`references/what-to-test.md`](references/what-to-test.md) — which
  units earn a test; the return-null heuristic; tiered coverage
  policy.
- [`references/frontend-testing.md`](references/frontend-testing.md)
  — layer strategy for frontend code, behavior-not-implementation
  querying, and the four classic pitfalls.

<!-- kcc-dev-core-write-unit-tests-sentinel: v1 -->
