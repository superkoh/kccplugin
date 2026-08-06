---
description: Use when the user asks to 写单测 / 写单元测试 / 补单测 / 加单元测试 / 用 TDD 实现 / write unit tests / add unit tests / cover this code with unit tests — and proactively before implementing new code whose logic branches — which of those units actually earn a test is this skill's own per-unit call, so don't pre-decide it before entering. Writes contract-first unit tests during implementation — new-code mode goes red-first against a stub with real failure output; backfill mode targets existing code and proves test power with a temporary mutation probe; a bug fix starts from a failing reproduction test. Anti-tautology throughout — expectations traced to requirements, observable behavior only, tests frozen while implementing. Requirement-side black-box cases are kcc-dev-core:write-blackbox-tests, not this skill. Standalone capability — no workflow, no orchestration, no team.
---

# Writing unit tests

Writes unit tests **during implementation**, one contract group at a
time, contract-first: every test binds to the unit's signature and
behavior contract, never to its implementation internals. There is no
intermediate case document — unlike the black-box family, the test
code *is* the case. The enemy throughout is the **tautological test**:
a test derived from the implementation it is supposed to check, which
stays green no matter how wrong the logic is. Every rule below exists
to keep tests able to fail.

Three modes, chosen per group in step 2: **new-code** (the unit does
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
- **Every test can provably fail.** New code: the group's tests must
  be seen red before implementing, and the failure must be assertion-level
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
proactively when about to implement code that branches — step 1, not
the caller, decides which of its units clear the bar, and an empty
selection is a legitimate result rather than a reason not to enter.

### When NOT to use

- Implementation-independent test cases from requirements, before any
  implementation exists → `kcc-dev-core:write-blackbox-tests`.
- Turning `blackbox.md` into runnable black-box code →
  `kcc-dev-core:materialize-blackbox-tests`.
- Page- or flow-level E2E — the black-box family's territory, not
  unit testing.

## Process

### 1. Scope the units

Decide **one unit at a time** — whether a unit earns a test is a
per-function verdict, not reachable for the change as a whole, which
is why this step exists and why the caller must not pre-decide it.
Two gates, in order:

1. **Hard skip — no weighing.** CLI entry points and argument
   parsing, wiring and forwarding, config and constant exports, thin
   wrappers over third-party libraries, DTOs and boilerplate are out.
   Sitting next to interesting logic does not pull them back in.
   Frontend code first routes through
   [`references/frontend-testing.md`](references/frontend-testing.md)
   to pick the layer.
2. **Name the blind spot.** A surviving unit is selected only if you
   can say in one clause why an existing higher-level test would miss
   its bug or fail to localise it — the return-null heuristic in
   [`references/what-to-test.md`](references/what-to-test.md). No
   such clause, no selection: tests written to occupy coverage are
   where tautologies breed.

State each selection with its clause and each skip with its reason,
in one or two lines total. **An empty selection is a finished run**:
report the skips and stop, steps 2–7 don't apply.

### 2. Group the units and pick the mode

- Units don't exist yet → **new-code**: steps 3–6 in order.
- Units exist and work → **backfill**: steps 3–4, then the mutation
  probe in step 5.
- Fixing a bug → **bug-fix**: steps 3–4 for the reproduction test,
  which must fail on the unfixed code (step 5), then fix to green
  (step 6).

Granularity is a **contract group**: units sharing one requirement
source — one spec entry, one module's public surface — run through
steps 3–6 together, with one contract block, one red gate and one
green run. Cap a group at roughly 5 units or a single file; unrelated
units are separate loops. What keeps "adjust the test to pass" out is
the freeze rule, not loop size — once implementation starts, every
test in the group is frozen.

### 3. Pin the contract

Write down, before any test, for every unit in the group: signature,
preconditions, postconditions, error cases, declared dependency
interfaces, and 2–5 example input → output rows hand-derived from the
requirement. Put it where the project keeps such things (doc comment
on the stub, spec file, or the conversation). If a
`.kcc/specs/<slug>/spec.md` covers this unit, derive from it.
New-code mode: create the stub now —
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

Every run in this step and the next is **scoped to the group** (by
path or test-name pattern). A single-group change is finished when
that scoped run is green — for it, the scoped run *is* the suite run,
so don't add another. Only when two or more groups ran does the full
suite run once at the end, to catch cross-group breakage.

- **New-code — red gate.** Run the group's tests; paste the real
  output. Every failure must be assertion-level. ImportError / syntax
  error / `0 tests collected` → fix the harness and rerun. Any test
  green against the stub has no power; fix it before implementing.
- **Backfill — mutation probe.** Run the group's tests: they should
  be green against the existing implementation (a red here is either
  a real bug just found — report it — or a broken test). Then probe:
  temporarily break the implementation **once per unit**, on the
  branch whose assertion you trust least (invert a condition, change
  a constant, drop a call), confirm at least one test fails, and
  revert. A mutation that survives means an assertion with no power;
  strengthen it and re-probe.
- **Bug-fix.** The reproduction test fails on the unfixed code, with
  the failure output pasted.

### 6. Implement to green

New-code and bug-fix: write the implementation for the whole group;
tests are frozen (see contract). Run the group's tests to green and
paste the output. A test you believe is wrong → stop,
`AskUserQuestion`, with the requirement-level reason.

### 7. Report

Per group: mode, gate evidence (red→green outputs, probe results, or
repro failure), skips with reasons, spikes declared, frozen-test
conflicts raised, and any contract gaps handed back to the user. A
run that selected no units reports only step 1's skips and their
reasons — that is the whole report, not a truncated one.

## References

- [`references/what-to-test.md`](references/what-to-test.md) — which
  units earn a test; the return-null heuristic; tiered coverage
  policy.
- [`references/frontend-testing.md`](references/frontend-testing.md)
  — layer strategy for frontend code, behavior-not-implementation
  querying, and the four classic pitfalls.

<!-- kcc-dev-core-write-unit-tests-sentinel: v2 -->
