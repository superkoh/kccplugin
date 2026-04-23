---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T2 in the dev-plan-<slug> team. Reads .kcc/specs/<slug>/kickoff.md (with §UX Direction as the ground-truth direction) + spec.md + ui-kickoff.html (the visual ground truth — palette, typography, density, sample components, anti-patterns — approved by the user during Phase 0). Writes .kcc/specs/<slug>/ui.md with a fixed 7-section engineer-ready UI/UX design schema (Summary & UI Scope, User Flows, Component Catalog, Interaction Specs, Visual Hierarchy & Design Tokens, Accessibility Targets, Open UX Questions) as a faithful implementation of those inputs — not a fresh invention. Path B only — no standalone UI/UX design skill available to leverage.
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
  framing, user flows, personas, scope. **§UX Direction is the
  direction ground truth** for this step (Visual pillar, Accessibility
  priority, Interaction archetypes, Anti-patterns). If §UX Direction
  carries `Status: N/A`, treat this feature as UI-less — see Failure
  modes below.
- `.kcc/specs/<feature-slug>/spec.md` — T1 (`step-spec-writer`).
  Supplies the technical architecture that the UI must sit on top of;
  the `## System Design` section in particular constrains what UI
  states / events are possible.
- `.kcc/specs/<feature-slug>/ui-kickoff.html` — Phase 0 (only when
  present; absent for UI-less features). **The visual ground truth**
  — palette, typography, density, sample components, and anti-pattern
  callouts, all approved by the user. Parse the HTML to extract:
  - Palette hex codes + semantic roles from `<section class="palette">`
  - Typography specs (font-family / size / weight / line-height) from
    `<section class="typography">`
  - Density tokens from `<section class="density">`
  - Sample components (implicit visual conventions) from
    `<section class="components">`
  - Banned patterns from `<section class="anti-patterns">` if present

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

## Faithfulness rule

Your job is **faithful implementation** of the user's approved
direction, not fresh invention. Concretely:

- **Visual Hierarchy & Design Tokens** must be consistent with
  `ui-kickoff.html`'s palette (use the same hex codes or a proper
  semantic mapping — do not invent a new palette), typography (same
  font-family / sizes / weights), and density tokens.
- **Component Catalog** choices must follow kickoff §UX Direction's
  Visual pillar and Interaction archetypes. If direction says
  "minimalist, tap-primary", do not propose dense sidebars with
  keyboard-heavy interactions.
- **Accessibility Targets** must meet or exceed kickoff §UX Direction's
  Accessibility priority. If direction says "WCAG AA + low-vision
  audience", ui.md must include contrast / zoom / screen-reader specs
  meeting that bar.
- **Anti-patterns listed in kickoff §UX Direction or shown in
  `ui-kickoff.html` §anti-patterns MUST NOT appear in ui.md.** This is
  a hard reject at self-check — a violation aborts `TaskUpdate` until
  fixed.
- You MAY add implementation detail the kickoff didn't spell out
  (specific component names, concrete pixel values within density
  conventions, specific ARIA labels). You MAY NOT contradict the
  kickoff's direction.
- If kickoff §UX Direction is genuinely silent on something critical:
  emit an `ASSUMPTION:` bullet on the affected component / interaction
  AND add a matching `needs user confirmation: <question>` entry in
  `## Open UX Questions`.

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

### 1. Read kickoff.md + spec.md + ui-kickoff.html

Read all three files in full. From kickoff, extract the personas,
key scenarios, UI-related constraints, open questions, and — most
importantly — **§UX Direction** (posture, visual pillar, a11y priority,
interaction archetypes, anti-patterns). From spec, extract the
`## System Design` section (particularly the state machine and API /
interface surfaces). From `ui-kickoff.html` (if present), extract the
concrete palette, typography, density tokens, sample component
conventions, and any banned patterns from `<section class="anti-
patterns">`.

### 2. Synthesize the 7 sections

Derive content for each section by mapping upstream artifacts:

- kickoff `§UX Direction` + `§Users & Personas` + `§Key Scenarios`
  → Summary & UI Scope (posture, in / out of scope).
- kickoff `§Key Scenarios` → User Flows (Mermaid diagrams per journey).
- spec `§System Design §State Machine` + `ui-kickoff.html §components`
  → Component Catalog states.
- spec `§System Design §API / Interface` → Events emitted by
  components.
- `ui-kickoff.html §palette` + `§typography` + `§density` + kickoff
  `§UX Direction` Visual pillar → Visual Hierarchy & Design Tokens.
- kickoff `§UX Direction` Accessibility priority + `§Constraints`
  (regulatory / a11y mandates) → Accessibility Targets.
- spec `§Non-functional Requirements` + `§Edge Cases & Error Handling`
  → failure modes in Interaction Specs + Loading states in Component
  Catalog.
- kickoff `§UX Direction` Anti-patterns → **must be absent from ui.md**;
  no component / interaction / hierarchy may instantiate a banned
  pattern.

Do NOT transcribe upstream sections verbatim — the UI/UX design is a
synthesis on top of them. But the direction is fixed; your job is
faithful implementation, not re-invention (see Faithfulness rule).

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
- **Faithfulness check**: no kickoff §UX Direction Anti-pattern and no
  pattern from `ui-kickoff.html §anti-patterns` appears as a proposed
  component / interaction / visual treatment in ui.md. A single
  violation fails this check and blocks `TaskUpdate`.

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
