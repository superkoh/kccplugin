---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T1 in the dev-plan-<slug> team. Reads .kcc/specs/<slug>/kickoff.md, writes .kcc/specs/<slug>/spec.md with a fixed 7-section engineer-ready schema, then marks its task completed. If superpowers:brainstorming is available in the teammate's session, leverages its spec-writing ability (item 6 only) with a scope override redirecting output to our path and schema (Path A); otherwise synthesizes the spec inline (Path B).
---

# Step 1 — Spec Writer (teammate T1)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T1 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent.** No `AskUserQuestion` is available —
you cannot interact with the user. The design is already fully
captured in `.kcc/specs/<slug>/kickoff.md` (9 sections produced by
`step-brainstorm` in Phase 0). Your job is synthesis, not discovery.

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — the 9-section brainstorm
  artifact. Read it in full before anything else.

## Output

Single file: `.kcc/specs/<feature-slug>/spec.md`. Exactly these seven
`##` level-2 headers, in this order:

```
## Summary & Scope
## User Stories
## Functional Requirements
## Non-functional Requirements
## System Design
## Edge Cases & Error Handling
## Open Items
```

### Section rules

- **Summary & Scope** — one prose paragraph summarizing the feature,
  followed by two sub-sections: `### In scope` (≥ 2 bullets) and
  `### Out of scope` (≥ 2 bullets, each bullet stating what is
  intentionally excluded and why).
- **User Stories** — **≥ 3** stories in the strict format:
  `US-NN: As a <persona>, I want to <action>, so that <outcome>.`
  Two-digit zero-padded numbering (US-01, US-02, ...).
- **Functional Requirements** — **≥ 5** numbered `FR-NN` entries. Each
  must be atomic (one observable behavior), testable, and end with a
  traceability tag: `(US-<NN>, kickoff §<section-name>)`.
- **Non-functional Requirements** — **≥ 3** `NFR-NN` entries covering
  at minimum one of performance / security / accessibility / i18n /
  reliability. Each ends with a rationale source:
  `(kickoff §<section-name>)` or `(derived from US-<NN>)`.
- **System Design** — this is **technical architecture**, not UI.
  User-facing concerns (components / interaction details / visual
  hierarchy / accessibility) belong in `ui.md`, which T2
  (`step-ui-ux-designer`) writes from this spec. System Design MUST
  contain four sub-sections:
  - `### Architecture` — components, responsibilities, how they fit.
  - `### Data Model` — entities, fields, relationships. For features
    without persistent data, write `N/A — <one-line reason>`.
  - `### API / Interface` — endpoints, function signatures, event
    shapes. For pure UI / non-interface features, `N/A — <reason>`.
  - `### State Machine` — **system-side** state machine (backend /
    data flow). If the feature has ≥ 2 system-observable states,
    provide a Mermaid `stateDiagram-v2` or `graph TD` diagram. For
    stateless features, `N/A — stateless` with one line of
    justification. UI-side per-component states live in ui.md.
- **Edge Cases & Error Handling** — **≥ 5** entries, each in the form
  `when X happens, system does Y` (or `When X: Y`).
- **Open Items** — two sub-sections:
  - `### Resolved since kickoff` — each entry cites which kickoff
    Open Question or `ASSUMPTION:` it resolves, and gives the
    rationale from the kickoff's Original material.
  - `### Carried forward` — each entry is a `[status]` tag followed
    by the question; status is `open` / `blocked` / `deferred`.

### ASSUMPTION handling (critical)

Every `ASSUMPTION:` bullet in kickoff.md carries a paired
`needs user confirmation` entry in kickoff's `## Open Questions & Risks`.
These **must not be silently resolved** in a teammate context:

- Any FR or US that depends on an assumption MUST carry an inline
  `[ASSUMED: <content>]` marker.
- The assumption MUST appear in `### Carried forward` with citation
  back to kickoff.
- A teammate may move an assumption into `### Resolved since kickoff`
  **only if** kickoff's `## Original material` section itself
  contains the answer. Otherwise, carry it forward.

## Process

### 0. Idempotence check (resume fast-path)

If `.kcc/specs/<feature-slug>/spec.md` already exists, is non-empty,
and passes the structural self-check below (7 section headers in
order; 4 System Design sub-sections; ≥ 3 US, ≥ 5 FR, ≥ 3 NFR, ≥ 5
edge cases; no bare `TBD`; every `ASSUMPTION:` paired with a Carried
forward entry), then:

1. Call `TaskUpdate(taskId=T1, status=completed)`.
2. Reply `done (already present — resumed)` with the output path.
3. Stop. Do NOT read inputs, dispatch to Path A/B, or write.

Proceed to step 1 (Read kickoff.md) only when this check fails.

### 1. Read kickoff.md

Read `.kcc/specs/<feature-slug>/kickoff.md` in full. Verify all 9
sections are present. If any are missing or malformed, abort with a
clear error (the orchestrator's Phase 2 failure protocol will catch
it).

### 2. Dispatch — Path A or Path B

Inspect the teammate session's **available skills list** (visible in
system reminders). If it contains `superpowers:brainstorming`, take
**Path A**; otherwise **Path B**.

#### Path A — leverage `superpowers:brainstorming` item 6

Invoke `superpowers:brainstorming` via the `Skill` tool with this
scope-override string as `args`:

```
Scope: invoked inside kcc-dev-workflow:step-spec-writer, running as a
teammate in the dev-plan-<slug> team.

The design was ALREADY explored and approved in a prior phase
(step-brainstorm). The full approved design lives in
.kcc/specs/<slug>/kickoff.md with 9 structured sections.

Execute ONLY checklist item 6 (Write design doc) — skip items 1-5
entirely. Do NOT:
- Ask clarifying questions (teammate context has no user access)
- Re-propose approaches or seek re-approval
- Invoke writing-plans (that is a later caller's concern)
- Commit anything
- Write to docs/superpowers/specs/ — kcc-dev-workflow owns its artifact
  at .kcc/specs/<slug>/spec.md with the 7-section schema below
- Silently resolve any ASSUMPTION from kickoff.md — carry them forward
  into Open Items → Carried forward, keeping the [ASSUMED: ...] marker

Target 7-section schema:
1. Summary & Scope (prose + In scope / Out of scope bullet lists)
2. User Stories (US-NN, ≥3, format: As a <persona>, I want to <action>,
   so that <outcome>)
3. Functional Requirements (FR-NN, ≥5, each with traceability
   (US-NN, kickoff §<section>))
4. Non-functional Requirements (NFR-NN, ≥3, covering at least one of
   performance / security / a11y / i18n / reliability, each with
   rationale source)
5. System Design (4 required sub-sections: Architecture, Data Model,
   API / Interface, State Machine — use Mermaid stateDiagram-v2 or
   graph TD when state is non-trivial, otherwise "N/A — <reason>")
6. Edge Cases & Error Handling (≥5 entries in "when X happens, system
   does Y" form)
7. Open Items (### Resolved since kickoff with citation + rationale /
   ### Carried forward with status tag)

Write directly to .kcc/specs/<slug>/spec.md.
```

When superpowers returns, proceed to self-check (step 3) on the
produced file.

#### Path B — inline synthesis

Compose `.kcc/specs/<slug>/spec.md` directly. Mapping guide from
kickoff sections to spec sections:

- kickoff §Problem Statement + §Goals & Non-goals → spec §Summary & Scope
- kickoff §Users & Personas + §Key Scenarios → spec §User Stories
- kickoff §Key Scenarios + §Goals → spec §Functional Requirements
- kickoff §Constraints → spec §Non-functional Requirements
- kickoff §Considered Alternatives → inform spec §System Design
- kickoff §Key Scenarios (failure modes branch) → spec §Edge Cases
- kickoff §Open Questions & Risks → spec §Open Items → Carried forward

Do NOT transcribe kickoff text verbatim. The spec synthesizes deeper
detail (numbered, traceable, testable).

### 3. Structural self-check

Before writing TaskUpdate, verify:

- Exactly 7 `##` headers, in the order listed above.
- `## System Design` has all four sub-sections: Architecture,
  Data Model, API / Interface, State Machine.
- User Stories ≥ 3, all matching the `US-NN: As a ..., I want to ...,
  so that ...` format.
- Functional Requirements ≥ 5, each ending with a traceability tag
  in the form `(US-NN, kickoff §<section>)`.
- Non-functional Requirements ≥ 3, each ending with a rationale source.
- Edge Cases ≥ 5.
- No bullet is exactly `TBD` or just `- TBD`.
- Every `ASSUMPTION:` from kickoff that informs a FR/US carries an
  inline `[ASSUMED: ...]` marker AND appears under `### Carried forward`.
- `### In scope` has ≥ 2 bullets; `### Out of scope` has ≥ 2 bullets.

If any check fails, fix inline and rewrite the file before the next
step.

### 4. Leak check (Path A only)

If Path A was taken, check whether any file was created under
`docs/superpowers/specs/` during the superpowers invocation. If yes:

- Delete that file.
- Emit a one-line warning to the team log:
  `⚠ superpowers wrote a spec despite scope override — removed <path>`.

### 5. Mark the task completed

```
TaskUpdate(taskId=T1, status=completed)
```

### 6. Return

Reply with `done` and the output path, then stop.

## Definition of Done

- `.kcc/specs/<feature-slug>/spec.md` exists and is non-empty.
- All structural self-check items pass.
- If Path A was used, leak check ran and any stray file written under
  `docs/superpowers/specs/` during this invocation has been removed.
- Task T1 has been marked `completed` via `TaskUpdate`.

## Anti-patterns

- **Do not transcribe kickoff verbatim.** Spec is synthesis; it must
  produce new material (numbered FR/US/NFR, architecture, state
  machine) not present in kickoff.
- **Do not silently resolve ASSUMPTIONs.** Carry them forward with
  `[ASSUMED: ...]` markers and `### Carried forward` entries. Only
  promote to `### Resolved since kickoff` when kickoff's Original
  material itself gives the answer.
- **Do not invent features not grounded in kickoff.** If kickoff
  doesn't mention it, it doesn't belong in the spec (scope creep).
- **Do not skip `## System Design` or its four sub-sections.**
  Engineer-ready tier requires architecture, data, API, and state.
  Use `N/A — <reason>` for genuinely-absent sub-sections; do not omit.
- **Do not TaskUpdate before self-check passes.** A failed self-check
  means the file must be rewritten first.
- **Do not skip Path A when `superpowers:brainstorming` is available.**
  Leveraging it is mandatory when the skill is in the teammate's
  session, not optional.

## Failure modes

- **`kickoff.md` missing** — abort with a clear error; do not invent
  the feature from scratch.
- **`kickoff.md` malformed** (any of the 9 sections missing) — abort;
  the error message must list every missing section.
- **Feature genuinely has no data / no API / no states** — keep the
  sub-sections in place, write `N/A — <reason>` in each. Do not omit
  sub-sections.
- **`superpowers:brainstorming` invocation fails or refuses to skip
  items 1-5** — fall back to Path B; note the switch in the team log.

<!-- kcc-dev-workflow-step-spec-writer-sentinel: v1 -->
