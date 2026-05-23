---
description: Use when the user asks to 写验收标准 / 出 AC / 写 Gherkin 验收 / 把 spec 转成验收标准 / write acceptance criteria / write AC / Gherkin criteria for this. Turns a spec or requirement set in the current context into a single ac.md of Gherkin-strict, traceable acceptance criteria grouped Functional / Non-functional / Edge Cases. Standalone capability — no workflow, no orchestration, no team.
---

# Writing Gherkin acceptance criteria

This skill produces **one** `ac.md` of Given/When/Then acceptance
criteria, each traced back to a requirement. It reads whatever
requirements are available in the session — preferring an existing
`spec.md` when one is present, otherwise deriving from the feature
description in context. Self-contained: read → confirm scope → write →
self-check. No orchestrator, no resume.

Output path: `<project-root>/.kcc/specs/<feature-slug>/ac.md`. If a
`spec.md` already lives in a `.kcc/specs/<feature-slug>/` directory,
write `ac.md` beside it and reuse that slug.

## When to use

Trigger phrases (Chinese + English):
- 写验收标准 / 出 AC / 写 Gherkin 验收 / 把 spec 转成验收标准
- write acceptance criteria / write AC / Gherkin criteria for this

### When NOT to use
- Writing the spec itself — that is `kcc-dev-core:write-spec`.
- Writing executable QA test cases — that is `kcc-testing:write-test-cases`.
  (AC are the contract; test cases are how you exercise it.)

## Process

### 1. Locate the requirement source

In order of preference:
1. An existing `.kcc/specs/<slug>/spec.md` — the authoritative source of
   `FR-NN` / `US-NN` / `NFR-NN` and edge-case entries. Read it in full.
2. A spec / PRD file referenced in the conversation.
3. The feature description in the last ~20 turns.

If only a loose description exists (no numbered requirements), enumerate
the implicit requirements yourself before writing AC, and say so when
reporting.

### 2. Confirm scope with `AskUserQuestion`

**Required.** Confirm which feature / spec you are writing AC for (your
detected source as the recommended option), and surface any assumption
that materially changes coverage. Skip nothing silently.

### 3. Write ac.md

```markdown
# Acceptance Criteria — <feature-name>

## Functional

### AC-F01: <short title>
- Traces to: FR-03, US-02
- **Given** <precondition / world state>
- **When** <action / trigger>
- **Then** <observable outcome>

## Non-functional

### AC-N01: <short title>
- Traces to: NFR-01
- **Given** …
- **When** …
- **Then** …

## Edge Cases

### AC-E01: <short title>
- Traces to: §Edge Cases item #3
- **Given** …
- **When** …
- **Then** …
```

Rules:

- Numbering is two-digit zero-padded **per group**: `AC-F01`, `AC-N01`,
  `AC-E01`.
- Every AC entry has all four fields in order: `Traces to:`, `**Given**`,
  `**When**`, `**Then**`.
- `Traces to:` is a comma-separated list of `FR-NN` / `US-NN` / `NFR-NN`
  identifiers, or `§Edge Cases item #<N>` when no numbered id exists.
- An `NFR` performance AC's `Then` must be a measurable threshold (e.g.
  `Then p95 response time is < 500 ms`). An accessibility AC's `Then`
  ties to a concrete rule (e.g. `Then every control is reachable via Tab`).
- `[ASSUMED: …]` markers from the spec propagate onto the derived AC, on
  the same line as `Traces to:`.
- If the spec carries unresolved items (`### Carried forward`), append a
  final `## Pending AC (blocked by open items)` section: one entry per
  item, sketching the AC shape but not a real AC — a pointer for review.

### 4. Coverage self-check

Before reporting done, verify against the source:
- Every `FR-NN` is referenced by ≥ 1 `AC-F*`.
- Every `US-NN` is referenced by ≥ 1 AC (any group).
- Every `NFR-NN` is referenced by ≥ 1 `AC-N*`.
- Every edge-case entry is referenced by ≥ 1 `AC-E*`.
- Total AC ≥ `#FR + #NFR + #edge-cases` (a single FR often needs a
  happy-path AND a guard / reverse AC).
- All three group headers present; every AC has all four fields; numbering
  correct; no bare `TBD`; `[ASSUMED: …]` markers propagated; Pending AC
  section present iff the source has carried-forward items.

Fix inline and rewrite before reporting.

### 5. Report

State the output path and a one-line coverage summary: AC count per group,
and whether every requirement is covered (or which are not, and why).

## Anti-patterns

- **An AC with no `Then`, or a `Then` that is not observable.** Every AC
  asserts a checkable outcome; "works correctly" is not an outcome.
- **An untraceable AC.** If it traces to nothing, either it is testing a
  requirement you forgot to capture, or it is scope creep — resolve, don't
  ship it floating.
- **A performance / a11y AC with a vague `Then`.** Use a measurable
  threshold or a named rule.
- **Faking a trace to hit coverage.** Leave honest gaps in the report
  instead of inventing requirement ids.
- **Restating the spec prose as an AC.** AC are concrete Given/When/Then
  scenarios, not paraphrased requirements.

<!-- kcc-dev-core-write-acceptance-criteria-sentinel: v1 -->
