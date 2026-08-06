---
description: Use when the user asks to 写黑盒测试 / 写黑盒用例 / 把 spec 转成黑盒用例 / 写验收标准 / 出 AC / write black-box test cases / cover this spec with black-box tests / write acceptance criteria. Before any implementation exists, turns the requirements in context into one blackbox.md of implementation-independent cases — grouped Main Flow / Corner Cases / Non-functional, each traced to a requirement and tagged automated or llm-driven. Case definitions only — runnable test code (写黑盒测试代码 / materialize black-box tests) is kcc-dev-core:materialize-blackbox-tests, and unit or other white-box tests (写单测 / write unit tests) are kcc-dev-core:write-unit-tests. Standalone capability — no workflow, no orchestration, no team.
---

# Writing black-box test cases

Write `<project-root>/.kcc/specs/<slug>/blackbox.md` from the
requirements in context; a sibling `spec.md` lends its slug, otherwise
coin one (ASCII kebab-case, ≤ 64 chars). Every case passing is the
task's Definition of Done.

## Principles

- Never read implementation — neither the unwritten one nor the
  existing product being changed. Requirements only.
- Cases bind only to contracted external surfaces (API, UI, CLI),
  setup and cleanup included — no invented endpoints, no DB
  backdoors. Unpinned surface → `## Pending cases`; unpreparable
  state → `[EXTERNAL-SETUP: blocked — <reason>]`.
- Every **Given** names the surface that prepares it. "A paid order
  exists" is not a **Given**; the call that creates one is. When the
  requirements pin no such surface, record that as a setup dependency
  instead of waving at it.
- Every **Then** is pass/fail-decidable in requirement language, not
  "works correctly" or "same as before". A **Then** that cannot fail
  is not a case — "document the actual behavior" and "pin whatever it
  does today" are notes, not oracles. Performance asserts the spec's
  NFR number; no number in the spec → Pending, never an invented
  threshold. Locale oracles assert format rules, not literals. UI
  targets are role + visible label.
- Every input the requirements bound earns its boundary pair — at the
  cap and one past it — plus the empty value.
- Red-first: every case fails until implemented, except one pinning
  unchanged existing behavior — `[PRE-IMPL: green — existing
  behavior]`.
- Coverage is per requirement, never per count: each FR / US / NFR /
  edge entry earns ≥ 1 case, a second only where a guard or reverse
  path carries real risk. Never fake a trace; report the gap.
- Specs omit the same things every time. At `full` depth sweep for
  what this one omits, starting with the three that cost money:
  **repeat the same mutating action twice** (assert exactly one
  effect), **two actors on one resource at once** (assert the
  invariant — one winner, no lost update, never timing or ordering),
  and **the lower-privileged actor attempting the privileged action**
  (assert the rejection *and* that nothing changed). Then unicode
  homoglyph / BiDi / normalization on free-text inputs, i18n
  expansion and RTL, keyboard-only traversal.
- `Depth: focused` when the change touches one surface with no new
  persistence, concurrency, money, or permissions — main flow plus
  the corner cases the requirements name, skipping the sweep above.
  `Depth: full` otherwise; when in doubt, full.
- Close with one fresh-context reviewer subagent carrying only the
  requirements and the draft: what user-visible behavior could break
  with no case going red? Its findings become cases or Pending
  entries. Run it at both depths — a simple surface predicts nothing
  about whether the requirements have holes.

## Output format

`materialize-blackbox-tests` opens `.kcc/specs/<slug>/blackbox.md` by
that exact path and parses what is inside — the file name is
`blackbox.md`, never a prettier variant, and it sits beside the
`spec.md` it derives from. Reproduce the shape exactly; write no HTML
comments into it.

```markdown
# Black-box Test Cases — <feature-name>

Depth: full

## Main Flow

### BB-M01: <short title>
- Traces to: FR-03, US-02
- Priority: P0
- Mode: automated
- Surface: `POST /orders` (spec §System Design)
- **Given** <state, prepared through external surfaces>
- **When** <action on the surface>
- **Then** <observable outcome>

## Corner Cases

### BB-C01: <short title>
- Traces to: §Edge Cases item #3
- Priority: P1
- Mode: llm-driven
- Surface: checkout page (spec §User Stories US-02)
- **Given** … **When** … **Then** …

## Non-functional

### BB-N01: <short title>
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: `GET /search` (spec §Non-functional Requirements)
- **Given** … **When** … **Then** <the NFR's own threshold>

## Pending cases (blocked by open items)

- <sketch>, blocked by <open item / unpinned surface>
```

- `Depth:` carries exactly `focused` or `full` — no trailing prose.
- Seven fields per case, in that order; optional `Setup:` /
  `Cleanup:` sit between `Surface:` and **Given**.
- IDs zero-pad per group: `BB-M01`, `BB-C01`, `BB-N01`.
- `Traces to:` lists `FR-NN` / `US-NN` / `NFR-NN`, or
  `§Edge Cases item #N`, and carries any `[ASSUMED: …]` /
  `[PRE-IMPL: …]` / `[EXTERNAL-SETUP: …]` marker for that case.
- `Mode: automated` when the check is deterministic at contract
  level; `llm-driven` when deciding it needs page- or flow-level
  judgment. Prefer automated. This plugin ships no llm-driven
  executor.
- `## Pending cases` appears only when open items or unpinned
  surfaces exist. Entries are sketches — no BB-ID, no seven fields;
  `materialize-blackbox-tests` skips them.

Report the path, the depth and what triggered it, per-group counts,
which requirements are uncovered and why, and every gap flagged back
to the spec.

<!-- kcc-dev-core-write-blackbox-tests-sentinel: v4 -->
