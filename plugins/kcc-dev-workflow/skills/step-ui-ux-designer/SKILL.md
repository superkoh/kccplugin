---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T2 in the dev-plan-<slug> team. Reads .kcc/specs/<slug>/kickoff.md + spec.md, writes .kcc/specs/<slug>/ui.md with a fixed 7-section engineer-ready UI/UX design schema (Summary & UI Scope, User Flows, Component Catalog, Interaction Specs, Visual Hierarchy & Design Tokens, Accessibility Targets, Open UX Questions), then marks its task completed. Path B only — no standalone UI/UX design skill available to leverage.
---

# Step 2 — UI/UX Designer (teammate T2)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T2 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent** (T2). No `AskUserQuestion`. This is a
content-production step (like T1 `step-spec-writer`), not a review
step — single agent, not multi-agent. There is no Path A here:
`frontend-design:frontend-design` generates UI code rather than an
upstream design artifact, and no `superpowers` skill ships with
standalone UI/UX design functionality.

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — Phase 0. Supplies feature
  framing, user flows, personas, scope.
- `.kcc/specs/<feature-slug>/spec.md` — T1 (`step-spec-writer`).
  Supplies the technical architecture that the UI must sit on top of;
  the `## System Design` section in particular constrains what UI
  states / events are possible.

## Output

Single file: `.kcc/specs/<feature-slug>/ui.md`. Exactly these seven
`##` level-2 headers, in this order:

```
## Summary & UI Scope
## User Flows
## Component Catalog
## Interaction Specs
## Visual Hierarchy & Design Tokens
## Accessibility Targets
## Open UX Questions
```

### Section rules

- **Summary & UI Scope** — one prose paragraph summarizing the UI
  surface, followed by two sub-sections: `### In scope` (≥ 2 bullets
  listing screens / views / surfaces this design covers) and
  `### Out of scope` (≥ 2 bullets stating what is intentionally
  excluded — "later release", "handled by existing infra", etc.).
- **User Flows** — **≥ 1 Mermaid diagram** (`flowchart`, `graph TD`,
  or `sequenceDiagram`) covering the happy-path flow for the primary
  persona. For features with multiple flows, provide one diagram per
  flow, titled by persona + goal. If the feature genuinely has no
  user flow (pure background behavior with no entry point), write
  `N/A — <one-line reason>` and reference the kickoff's
  `§Key Scenarios` that justify it.
- **Component Catalog** — a markdown table with columns
  `| Component | States | Events | Emits |`. **≥ 3 rows** for any
  feature with a UI; N/A row pattern for features without one.
  Component names must be stable identifiers (kebab-case or
  PascalCase, consistent with repo convention). "States" lists the
  observable UI states (`default`, `hover`, `loading`, `error`,
  `disabled`, etc.). "Events" lists user actions this component
  reacts to. "Emits" lists the signals this component sends upstream.
- **Interaction Specs** — per-component or per-flow prose describing
  what happens on each interaction. **≥ 3 entries**. Each entry is
  structured as:
  ```
  ### <Component or Flow name>
  - **On <event>:** <visible reaction> — feedback latency: <concrete
    target or "instant"> — failure mode: <what happens if async op
    fails>
  ```
  Cover at minimum: one happy-path interaction, one loading /
  optimistic state, one error state.
- **Visual Hierarchy & Design Tokens** — prose identifying primary /
  secondary / tertiary UI weight on each screen, plus concrete token
  references (e.g. `color.primary.500`, `spacing.md`, `font.body-lg`)
  or `N/A — <reason>` if no design system is in use. **≥ 3 bullets**
  across hierarchy + token references.
- **Accessibility Targets** — three required sub-bullets:
  - WCAG level target (typically `AA`; justify if `A` is acceptable).
  - Keyboard nav + focus order (specific Tab sequence across primary
    components, or "N/A — no interactive elements").
  - Screen-reader labels (specific ARIA roles + `aria-label` /
    `aria-describedby` values for every interactive component in the
    catalog).
- **Open UX Questions** — **≥ 3** unresolved UX decisions as
  `- <question>` bullets. If spec has carried `[ASSUMED: ...]`
  markers on UI-related items, mirror them here with `needs user
  confirmation: <specific question>` entries.

### Depth floor + ASSUMPTION handling

- **No bare `TBD` bullets.** Use `ASSUMPTION: <content>` prefix with a
  paired `needs user confirmation` entry in `## Open UX Questions`.
- Mirror any `[ASSUMED: ...]` marker from spec that constrains UI (e.g.
  assumed form field count) on the derived component row or
  interaction spec line.

## Process

### 0. Idempotence check (resume fast-path)

If `.kcc/specs/<feature-slug>/ui.md` already exists, is non-empty, and
passes the structural self-check below (7 section headers in order,
≥ 1 Mermaid diagram in User Flows, ≥ 3 rows in Component Catalog,
≥ 3 Interaction Specs, ≥ 3 Visual Hierarchy & Design Tokens bullets,
Accessibility Targets has WCAG / keyboard / screen-reader sub-bullets,
≥ 3 Open UX Questions, no bare `TBD`, ASSUMPTION pairings), then:

1. Call `TaskUpdate(taskId=T2, status=completed)`.
2. Reply `done (already present — resumed)` with the output path.
3. Stop. Do NOT read inputs or write.

Proceed to step 1 only when this check fails.

### 1. Read kickoff.md + spec.md

Read both files in full. From kickoff, extract the personas, key
scenarios, and any UI-related constraints / open questions. From spec,
extract the `## System Design` section (particularly the state machine
and API / interface surfaces) to understand what UI states are
possible.

### 2. Synthesize the 7 sections

Derive content for each section by mapping upstream artifacts:

- kickoff `§Users & Personas` + `§Key Scenarios` → Summary, Flows,
  Interaction Specs.
- spec `§System Design §State Machine` → UI component states
  (per-component in Component Catalog).
- spec `§System Design §API / Interface` → Events emitted by
  components (what each action triggers upstream).
- kickoff `§Constraints` → Visual Hierarchy constraints + Accessibility
  targets (e.g. if kickoff cites regulatory / a11y mandates).
- spec `§Non-functional Requirements` + `§Edge Cases & Error Handling`
  → failure modes in Interaction Specs + Loading states in Component
  Catalog.

Do NOT transcribe upstream sections verbatim — the UI/UX design is a
fresh synthesis on top of them.

### 3. Write ui.md

Write the file with the 7 section headers in the fixed order, with
their sub-sections populated.

### 4. Structural self-check

Before `TaskUpdate`, verify:

- Exactly 7 `##` headers, in the order listed above.
- `## Summary & UI Scope` contains `### In scope` and
  `### Out of scope`, each ≥ 2 bullets.
- `## User Flows` contains at least one Mermaid fenced block
  (opens with ` ```mermaid `) OR an `N/A — <reason>` line with
  kickoff citation.
- `## Component Catalog` contains a markdown table with the exact
  header `| Component | States | Events | Emits |` and ≥ 3 data rows
  (or N/A justification).
- `## Interaction Specs` has ≥ 3 `### <name>` sub-entries, each with
  at least one `- **On <event>:**` bullet carrying all three fields
  (reaction / feedback latency / failure mode).
- `## Visual Hierarchy & Design Tokens` has ≥ 3 bullets covering
  hierarchy + token references (or `N/A — <reason>`).
- `## Accessibility Targets` has the three required sub-bullets
  (WCAG level / keyboard nav / screen-reader labels).
- `## Open UX Questions` has ≥ 3 bullets.
- No bullet is exactly `TBD`.
- Every `ASSUMPTION:` marker has a matching `needs user confirmation`
  entry in `## Open UX Questions`.

If any check fails, fix inline and rewrite the file before `TaskUpdate`.

### 5. Mark the task completed

```
TaskUpdate(taskId=T2, status=completed)
```

### 6. Return

Reply `done` with the output path, then stop.

## Definition of Done

- `.kcc/specs/<feature-slug>/ui.md` exists and is non-empty.
- All structural self-check items pass.
- Task T2 has been marked `completed` via `TaskUpdate`.

## Anti-patterns

- **Do not transcribe upstream sections verbatim.** UI/UX design is
  synthesis — the value-add is turning abstract requirements into
  concrete component / interaction / visual contracts.
- **Do not invent UI components that spec's System Design cannot
  support.** If the spec has no API for "favorite this item", the UI
  can't include a favorite button — that's scope creep.
- **Do not skip User Flows' Mermaid requirement** for features with
  an actual UI surface. ASCII art is not a substitute; Mermaid
  renders correctly everywhere downstream.
- **Do not leave Accessibility Targets as "WCAG AA" without
  concrete per-component ARIA / keyboard specifics.** An a11y
  promise without implementation detail does not survive the
  reviewer.
- **Do not silently drop `[ASSUMED: ...]` markers** from spec that
  inform UI. Mirror them onto the relevant component row /
  interaction spec and into Open UX Questions.
- **Do not TaskUpdate before self-check passes.**

## Failure modes

- **`kickoff.md` or `spec.md` missing** — abort with a clear error.
- **`spec.md` missing `## System Design`** — abort; this is an
  upstream contract violation (step-spec-writer owes System Design).
- **Feature genuinely has no UI surface** (e.g. pure backend
  migration) — still produce ui.md with all 7 sections present and
  each section carrying `N/A — <one-line reason>` content that is
  ≥ 3 bullets of justification. The reviewer needs to audit this
  "N/A path" — a missing ui.md breaks the chain.

<!-- kcc-dev-workflow-step-ui-ux-designer-sentinel: v1 -->
