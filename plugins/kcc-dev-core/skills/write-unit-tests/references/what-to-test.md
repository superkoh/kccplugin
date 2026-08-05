# What deserves a unit test

Not every function. The decision question: **if this unit's logic
went wrong, would a higher-level test catch it immediately and point
at it?** If yes, a unit test adds little; if no — or the failure
would surface as a distant symptom — the unit test is the only alarm.

## High value — test these first

- **Pure logic with many branches** — pricing, permission decisions,
  state-machine transitions, data transforms / formatting. Branch
  combinations outnumber what any external flow will ever trigger.
- **Explicit boundary conditions** — pagination, time ranges, money
  precision, truncation. Off-by-one and precision bugs cluster here
  and are invisible from the UI.
- **Widely reused units** — a util called from 20 places has
  leverage: one test protects every call site.
- **Frequently changed business rules** — the regression net for the
  next change.
- **Every bug fix** — always. Write the failing reproduction test
  before the fix; it is the least controversial unit test there is
  and its value is fully certain.

## Low value — skip, and say so

- **Pure glue / forwarding** — a body that passes arguments through.
  Testing it tests the mock: the classic tautology nursery.
- **Config / constant exports.**
- **Thin wrappers over third-party libraries** — that test exercises
  the library, not this codebase.
- **Framework boilerplate** — getters/setters, plain DTO
  constructors.
- **Exploratory code whose interface is still churning** — the tests
  change faster than they protect; spike now, backfill when stable.

## The return-null heuristic

Ask: *replace this unit's body with `return null` — does any
existing higher-level test fail?*

- Fails, and the failure names this unit → already covered; a unit
  test is optional.
- Survives, or fails somewhere far away with no pointer back here →
  the unit test has high value.

This is manual mutation testing — the same probe SKILL.md step 5
applies. Here it decides *whether* to test; there it proves the test
has power.

## Coverage policy

No uniform percentage KPI. A flat "80% everywhere" target forces
tests onto getters and glue, and tests written to satisfy a number
are exactly the powerless tests this skill exists to prevent. Tier
by directory instead: core business logic held high; UI composition
and glue layers low or exempt. State the tiers in the report when
introducing them.
