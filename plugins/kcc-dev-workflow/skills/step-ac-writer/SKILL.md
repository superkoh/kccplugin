---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T2 in the dev-plan-<slug> team. Reads .kcc/specs/<slug>/kickoff.md + spec.md, writes .kcc/specs/<slug>/ac.md with Gherkin-strict acceptance criteria grouped into Functional / Non-functional / Edge Cases, then marks its task completed. Every FR / US / NFR / edge-case entry in the spec must be covered by at least one AC.
---

# Step 2 — AC Writer (teammate T2)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T2 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent.** No `AskUserQuestion` is available —
you cannot interact with the user. Your inputs are two files written
by earlier phases. There is no Path A here: `superpowers` does not
ship an AC-writing skill, so this step runs inline only.

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — from `step-brainstorm`
  (Phase 0). Used for framing and to cite ASSUMPTIONs.
- `.kcc/specs/<feature-slug>/spec.md` — from `step-spec-writer` (T1).
  This is the authoritative source of FR-NN / US-NN / NFR-NN and
  edge-case entries.

## Output

Single file: `.kcc/specs/<feature-slug>/ac.md`.

### File structure (fixed)

```markdown
# Acceptance Criteria — <feature-name>

## Functional

### AC-F01: <short title>
- Traces to: FR-03, US-02
- **Given** <precondition / world state>
- **When** <action / trigger>
- **Then** <observable outcome>

### AC-F02: ...

## Non-functional

### AC-N01: <short title>
- Traces to: NFR-01
- **Given** ...
- **When** ...
- **Then** ...

## Edge Cases

### AC-E01: <short title>
- Traces to: spec §Edge Cases item #3
- **Given** ...
- **When** ...
- **Then** ...
```

If the spec's `## Open Items → ### Carried forward` is non-empty,
append one more section at the end:

```markdown
## Pending AC (blocked by open items)

- <open item verbatim from spec> — blocked by: <reason> — planned AC
  shape: <one-line sketch of what the AC will look like once resolved>
```

### Hard rules for every AC

Every `### AC-<F|N|E>NN` entry MUST contain all four fields, in order:

1. `- Traces to: <citations>` — comma-separated list of FR-NN / US-NN /
   NFR-NN identifiers or the literal form `spec §Edge Cases item #<N>`.
2. `- **Given** <precondition>`
3. `- **When** <action>`
4. `- **Then** <observable outcome>`

Numbering is two-digit zero-padded within each group: `AC-F01`,
`AC-N01`, `AC-E01`.

### Coverage rules (self-check must pass)

- **Every FR-NN in spec.md is referenced by at least one `AC-F*`** in
  its `Traces to:` line.
- **Every US-NN in spec.md is referenced by at least one AC** (any
  group).
- **Every NFR-NN in spec.md is referenced by at least one `AC-N*`**.
- **Every edge-case entry in spec.md §Edge Cases is referenced by at
  least one `AC-E*`**.

Total AC count lower bound = `#FR + #NFR + #edge-cases`. You may write
more: a single FR often needs both a happy-path AC and a reverse / guard
AC.

### ASSUMPTION propagation

Any `[ASSUMED: X]` marker carried in the spec's FR / US / NFR must also
appear on the derived AC. Place the marker on the same line as the
`Traces to:` citation, e.g.:

```markdown
- Traces to: FR-04  [ASSUMED: latency budget is 500 ms]
```

### Pending AC rule

If `spec.md §Open Items → ### Carried forward` is non-empty, ac.md MUST
include the `## Pending AC (blocked by open items)` section with one
entry per carried-forward item. The entry sketches the AC shape
(Given/When/Then gist) but is deliberately not a real AC — it is a
pointer for the reviewer.

## Process

### 0. Idempotence check (resume fast-path)

If `.kcc/specs/<feature-slug>/ac.md` already exists, is non-empty, and
passes the structural self-check below (top-level
`# Acceptance Criteria — <feature-name>` header; 3 group sub-sections
Functional / Non-functional / Edge Cases; every AC has `Traces to:` /
`**Given**` / `**When**` / `**Then**`; every spec FR / US / NFR /
edge-case is covered by ≥ 1 AC; AC-F / AC-N / AC-E numbering correct;
`[ASSUMED: ...]` markers propagated; `## Pending AC (blocked by open
items)` section present iff spec has Carried-forward items; no bare
`TBD`), then:

1. Call `TaskUpdate(taskId=T2, status=completed)`.
2. Reply `done (already present — resumed)` with the output path.
3. Stop. Do NOT read inputs or write.

Proceed to step 1 (Read the inputs) only when this check fails.

### 1. Read the inputs

Read `kickoff.md` and `spec.md` in full. Parse:

- The feature name (from spec's `## Summary & Scope` or kickoff's
  `## Metadata`).
- The full FR-NN list from spec's `## Functional Requirements`.
- The full US-NN list from spec's `## User Stories`.
- The full NFR-NN list from spec's `## Non-functional Requirements`.
- Every edge-case entry from spec's `## Edge Cases & Error Handling`
  (numbered by position: #1, #2, ...).
- The `## Open Items → ### Carried forward` list.
- Every `[ASSUMED: ...]` marker in the spec.

If any of those cannot be parsed, abort with an explicit error naming
the missing / malformed section — this is a spec-writer contract
violation and the orchestrator's failure protocol should catch it.

### 2. Derive AC group by group

For each FR-NN: write one or more `AC-F*` entries. Aim for at least
one happy-path AC and, where the FR has a guard or reverse path, one
reverse AC.

For each NFR-NN: write one `AC-N*` entry expressing the NFR as a
verifiable Given/When/Then. For performance NFRs, the `Then` line
should be a measurable threshold (e.g. `Then p95 response time is
< 500 ms`). For accessibility, tie to a concrete rule (e.g. `Then all
interactive controls are reachable via Tab key alone`).

For each edge-case entry in spec §Edge Cases: write one `AC-E*`
starting `Given <the edge condition holds>`, `When <the triggering
action>`, `Then <the degraded / recovery behavior>`.

### 3. Write ac.md

Write the file with:

1. The top-level `# Acceptance Criteria — <feature-name>` header.
2. `## Functional` with all `AC-F*` entries in numeric order.
3. `## Non-functional` with all `AC-N*` entries in numeric order.
4. `## Edge Cases` with all `AC-E*` entries in numeric order.
5. `## Pending AC (blocked by open items)` if spec carries any
   forward; omit otherwise.

### 4. Structural self-check

Before `TaskUpdate`, verify:

- Top-level header matches `# Acceptance Criteria — <feature-name>`.
- All three group headers are present: `## Functional`,
  `## Non-functional`, `## Edge Cases`.
- Every AC has all four fields (`Traces to:`, `**Given**`, `**When**`,
  `**Then**`).
- Numbering is `AC-F01`, `AC-N01`, `AC-E01` etc. — two-digit zero
  padding, per-group.
- Every FR-NN from spec appears in at least one `AC-F*` `Traces to:`
  line.
- Every US-NN from spec appears in at least one AC's `Traces to:` line
  (any group).
- Every NFR-NN from spec appears in at least one `AC-N*` `Traces to:`
  line.
- Every spec §Edge Cases item (`#1`..`#N`) appears in at least one
  `AC-E*` `Traces to:` line.
- No bullet is exactly `TBD` or just `- TBD`.
- Every spec `[ASSUMED: ...]` marker propagates to the AC that
  references the underlying FR / US / NFR.
- `## Pending AC (blocked by open items)` exists iff spec has
  carried-forward open items.

If any check fails, fix inline and rewrite the file before `TaskUpdate`.

### 5. Mark the task completed

```
TaskUpdate(taskId=T2, status=completed)
```

### 6. Return

Reply `done` with the output path, then stop.

## Definition of Done

- `.kcc/specs/<feature-slug>/ac.md` exists and is non-empty.
- All structural self-check items pass.
- Every FR, US, NFR, and edge-case from spec.md is covered by at least
  one AC.
- Task T2 has been marked `completed` via `TaskUpdate`.

## Anti-patterns

- **Do not write AC that redefine requirements.** AC verifies the
  requirement; the requirement itself lives in spec.md.
- **Do not write semantically duplicated AC for the same FR.** One
  happy-path plus one reverse / guard is the normal ceiling.
- **Do not omit `Traces to:`.** test-case-writer's RTM (in the next
  step) relies on it.
- **Do not skip Non-functional or Edge Cases groups.** At
  engineer-ready tier these are mandatory if the spec has any NFR /
  edge-case entries.
- **Do not silently drop `[ASSUMED: ...]` markers.** Every assumption
  in spec propagates to dependent AC.
- **Do not TaskUpdate before self-check passes.**

## Failure modes

- **`kickoff.md` or `spec.md` missing** — abort with a clear error.
- **spec.md cannot be parsed** (FR / US / NFR / edge sections missing
  or numbering broken) — abort; list every section that failed to
  parse. This is a spec-writer contract violation.
- **spec.md has zero FR, zero NFR, or zero edge cases in an
  engineer-ready feature** — abort; the upstream step violated its
  own contract.

<!-- kcc-dev-workflow-step-ac-writer-sentinel: v1 -->
