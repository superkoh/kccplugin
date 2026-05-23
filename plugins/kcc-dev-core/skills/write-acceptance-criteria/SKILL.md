---
description: Use when the user asks to 写验收标准 / 出 AC / 写 Gherkin 验收 / 把 spec 转成验收标准 / write acceptance criteria / write AC / Gherkin criteria for this. Turns a spec or requirement set in the current context into a single ac.md of Gherkin-strict, traceable acceptance criteria grouped Functional / Non-functional / Edge Cases. Standalone capability — no workflow, no orchestration, no team.
---

# Writing Gherkin acceptance criteria

Produces **one** `ac.md` of Given/When/Then acceptance criteria, each
traced back to a requirement. Reads whatever requirements are available
in the session — preferring an existing `spec.md`, otherwise deriving
from the feature description. Self-contained: read → confirm scope →
write → self-check.

Output path: `<project-root>/.kcc/specs/<feature-slug>/ac.md`. If a
`spec.md` already lives in `.kcc/specs/<feature-slug>/`, write `ac.md`
beside it and reuse that slug.

## When to use

Trigger phrases: 写验收标准 / 出 AC / 写 Gherkin 验收 / 把 spec 转成验收标准
/ write acceptance criteria / write AC / Gherkin criteria for this.

### When NOT to use

- Writing the spec itself → `kcc-dev-core:write-spec`.
- Writing executable QA test cases → `kcc-testing:write-test-cases`
  (AC are the contract; test cases are how you exercise it).

## Process

### 1. Locate the requirement source

In order of preference:
1. An existing `.kcc/specs/<slug>/spec.md` — authoritative source of
   `FR-NN` / `US-NN` / `NFR-NN` and edge-case entries. Read it in full.
2. A spec / PRD file referenced in the conversation.
3. The feature description in the last ~20 turns.

If only a loose description exists (no numbered requirements), enumerate
the implicit requirements yourself before writing AC, and say so when
reporting.

### 2. Confirm scope with `AskUserQuestion`

Confirm which feature / spec you're writing AC for (your detected
source as the recommended option), and surface any assumption that
materially changes coverage.

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
- Every AC has all four fields in order: `Traces to:`, `**Given**`,
  `**When**`, `**Then**`.
- `Traces to:` is a comma-separated list of `FR-NN` / `US-NN` / `NFR-NN`
  identifiers, or `§Edge Cases item #<N>` when no numbered id exists.
  Don't fake traces to hit coverage — leave honest gaps in the report.
- A performance `Then` must be a measurable threshold (e.g.
  `Then p95 response time is < 500 ms`). An accessibility `Then` ties
  to a concrete rule (e.g. `Then every control is reachable via Tab`).
  "Works correctly" isn't an observable outcome.
- `[ASSUMED: …]` markers from the spec propagate onto the derived AC,
  on the same line as `Traces to:`.
- If the spec carries unresolved items (`### Carried forward`), append
  a final `## Pending AC (blocked by open items)` section: one entry
  per item, sketching the AC shape (a pointer for review, not a real AC).

### 4. Coverage self-check

Before reporting done, verify against the source:
- Every `FR-NN` is referenced by ≥ 1 `AC-F*`.
- Every `US-NN` is referenced by ≥ 1 AC (any group).
- Every `NFR-NN` is referenced by ≥ 1 `AC-N*`.
- Every edge-case entry is referenced by ≥ 1 `AC-E*`.
- Total AC ≥ `#FR + #NFR + #edge-cases` (a single FR often needs a
  happy-path AND a guard / reverse AC).
- All three group headers present; every AC has all four fields;
  numbering correct; no bare `TBD`; `[ASSUMED: …]` markers propagated;
  Pending AC section present iff source has carried-forward items.

### 5. Report

State the output path and a one-line coverage summary: AC count per
group, and whether every requirement is covered (or which aren't, and why).

<!-- kcc-dev-core-write-acceptance-criteria-sentinel: v1 -->
