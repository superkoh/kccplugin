---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs in the main session (not as a teammate) and owns the interactive brainstorm phase — scans context, asks routing and probing questions, and for features with a likely UI surface runs an unbounded Approve/Abort visual-direction loop that produces .kcc/specs/<slug>/ui-kickoff.html. Final output is .kcc/specs/<slug>/kickoff.md with a fixed 10-section schema that adds a UX Direction section. If superpowers:brainstorming is available in the session, leverages it for the design exploration (Path A); otherwise runs an inline probing flow (Path B).
---

# Phase 0 — Brainstorm (interactive, main session)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> called by `kcc-dev-workflow:plan-feature` as its first action.

## Where this runs

**Main session.** Unlike the six teammate steps (`step-spec-writer`,
`step-ui-ux-designer`, `step-ac-writer`, `step-spec-ac-reviewer`,
`step-test-case-writer`, `step-test-case-reviewer`) that run inside the
`dev-plan-<slug>` team, this step runs inline so it can use
`AskUserQuestion` and direct context access. The orchestrator invokes
it via `Skill(skill="kcc-dev-workflow:step-brainstorm")`, receives
`<slug>` and `<platform>` back, then creates the team and launches
T1..T6.

## Inputs

- The user's raw feature request (conversation context — last ~20 turns).
- Optional prior material: any file under `docs/`, `specs/`, `product/`,
  `prds/`, or any directory the user points to. Detected via silent scan
  in step 1, confirmed in step 2.

## Outputs

- **Always**: `.kcc/specs/<feature-slug>/kickoff.md` — fixed 10-section
  schema.
- **Conditional** (only when the feature has a likely UI surface — see
  UX Visual Direction trigger below):
  `.kcc/specs/<feature-slug>/ui-kickoff.html` — self-contained HTML
  style reference (palette swatches, typography specimens, sample
  components, anti-pattern callouts).

### kickoff.md schema — 10 level-2 headers, in this order

```
## Metadata
## Original material
## Problem Statement
## Users & Personas
## UX Direction
## Goals & Non-goals
## Key Scenarios
## Considered Alternatives
## Constraints
## Open Questions & Risks
```

### Section rules

- **Metadata** — five required fields, one per line: `slug`,
  `feature name`, `platform`, `input material`, `generated at` (ISO 8601).
- **Original material** — ≥ 3 lines. Paste the raw user idea or an
  excerpt from the chosen input file. This is the seed; downstream
  reviewers audit the kickoff against it.
- **UX Direction** — see its own rules below. This section is the
  UX-focused output of the optional UX Visual Direction sub-phase.
- The other **seven "thinking" sections** — each must contain **≥ 3
  substantive bullet lines** (lines starting with `-` or `*`).
- **No bare `TBD` bullets.** If a point is genuinely unresolved, use an
  `ASSUMPTION: <concrete content>` prefix AND add a matching
  `needs user confirmation: <specific question>` bullet inside
  `## Open Questions & Risks`.

### `## UX Direction` section rules

One prose paragraph summarizing the overall UX posture, followed by
these bullets:

```markdown
## UX Direction

<1 paragraph summarizing posture, e.g. "Mobile-first conversational
interface with tap-primary interactions and generous whitespace; brand
voice is professional-but-friendly; minimalist over ornate.">

- **Visual pillar:** <e.g. minimalist / illustrative / enterprise / playful / data-dense>
- **Accessibility priority:** WCAG <AA|AAA> — primary audiences: <list>
- **Interaction archetypes:** <tap / click / keyboard-heavy / voice / mixed>
- **Anti-patterns to avoid:**
  - <user-specified ban, e.g. "no modal dialogs">
  - <another ban>
- **Reference:** `ui-kickoff.html` — palette, typography, density, and sample components are the visual ground truth
- **Status:** approved (<ISO 8601 date>)
```

For features with **no UI surface** (pure backend / data migration /
logic-only): write `N/A — <one-line reason>` as the paragraph, then
≥ 3 bullets justifying why no UI is involved (cite kickoff's Key
Scenarios). Set `Status: N/A`. No `ui-kickoff.html` is produced.

## Process

### 1. Silent context scan

Look through:

- The last ~20 turns of conversation for feature names and requirement
  fragments.
- Recently opened / edited files under `docs/`, `specs/`, `product/`,
  `prds/`, and any PRD-like directory at the repo root.

Pre-identify up to 3 candidate feature names and up to 3 candidate
input-material file paths. Do not ask the user yet.

### 2. Routing questions — one `AskUserQuestion` call, 3 questions

- **Q1 Feature name** — options: each candidate from the scan (≤ 3), plus
  "Other" for free text.
- **Q2 Input material** — options: each candidate file path (≤ 3), plus
  "Only session-prior discussion", plus "No prior material — start from
  scratch".
- **Q3 Target platform** — `web` / `ios` / `android` / `desktop` (single
  select).

### 3. Read input material (if a file was chosen)

If Q2's answer is a file path, read the entire file. Do not truncate.

### 4. Main brainstorm — Path A or Path B

Inspect the session's **available skills list** (visible in system
reminders). If it contains `superpowers:brainstorming`, take **Path A**;
otherwise **Path B**.

#### Path A — leverage `superpowers:brainstorming`

Invoke `superpowers:brainstorming` via the `Skill` tool, passing exactly
this scope-override string as `args`:

```
Scope: invoked inside kcc-dev-workflow:step-brainstorm. Execute only
checklist items 1-5 (explore context, offer VC if useful, ask clarifying
questions, propose 2-3 approaches, present design, get user approval).

HARD STOP after design approval. Do NOT:
- Write any spec doc to docs/superpowers/specs/ — kcc-dev-workflow owns
  its artifact at .kcc/specs/<slug>/kickoff.md with a fixed 10-section
  schema (below)
- Invoke writing-plans — this is the caller's responsibility
- Commit anything

Target 10-section schema the approved design must populate:
1. Metadata  2. Original material  3. Problem Statement
4. Users & Personas  5. UX Direction  6. Goals & Non-goals
7. Key Scenarios  8. Considered Alternatives  9. Constraints
10. Open Questions & Risks

Return control with approved design content organized into those 10
sections. step-brainstorm handles the file write and will run its own
UX Visual Direction sub-phase afterward to populate section 5 and
produce ui-kickoff.html when the feature has a UI surface.
```

When superpowers returns, take the approved design and reshape it into
the 10-section schema (UX Direction may be a stub at this point — the
sub-phase below fills it).

#### Path B — inline probing

Run 2 to 4 additional `AskUserQuestion` calls to fill gaps in the 10
sections. Pick sections where material is thin. Typical probes:

- **Problem Statement** — today's workaround and its cost.
- **Users & Personas** — primary persona plus notable secondary actors.
- **Goals & Non-goals** — what success looks like; what is explicitly
  out of scope.
- **Key Scenarios** — happy path plus 1–2 notable edges and failure
  modes.
- **Considered Alternatives** — "did you consider X / Y?" when the brief
  is one-dimensional.
- **Constraints** — technical / business / UX / regulatory.

**Hard ceiling: total routing + probing question count ≤ 10.** Stop
probing early if the material is already clear. The UX Visual
Direction sub-phase below is a separate loop with its own rules and is
NOT counted against this ceiling.

### 5. UX Visual Direction sub-phase (conditional, unbounded loop)

This sub-phase runs **only when the feature has a likely UI surface**.

#### 5.1 Trigger

Run the sub-phase when **both** conditions hold:

1. Q3 (platform) ∈ `{web, ios, android, desktop}`.
2. Any UI-surface signal is present in the draft kickoff content:
   - Key Scenarios describe user-visible actions (tap, click, type,
     scroll, see, select, etc.) rather than pure server / batch logic.
   - Users & Personas name end-users who will interact with an interface
     (not only ops / SRE / system administrators).
   - The user's original material explicitly names screens / components.

If neither signal is present, skip this sub-phase. In that case, set
`## UX Direction` to the N/A form (prose `N/A — <reason>` + ≥ 3
justifying bullets + `Status: N/A`), and do NOT produce
`ui-kickoff.html`.

#### 5.2 Discussion — one `AskUserQuestion` call, 4–6 questions

Ask the user about UX direction:

- **UX posture** — single-select: minimalist / illustrative /
  enterprise / playful / conversational / data-dense / Other.
- **Palette direction** — single-select: cool / warm / neutral / brand-
  aligned / Other.
- **Typography feel** — single-select: sans-serif modern / sans-serif
  classic / serif / mixed / monospace-prominent / Other.
- **Density** — single-select: spacious / balanced / dense / Other.
- **Primary interaction archetype** — single-select: tap-primary /
  click-primary / keyboard-heavy / voice-capable / mixed / Other.
- **Anti-patterns to avoid** — free text via Other (e.g. "no modal
  dialogs", "no infinite scroll", "no auto-play video").

These are separate from the routing + probing ceiling.

#### 5.3 Generate `ui-kickoff.html`

Write `.kcc/specs/<feature-slug>/ui-kickoff.html` as a self-contained
HTML document (inline CSS, no external deps). Required structure:

- **`<!-- metadata -->`** HTML comment header with `slug`,
  `generated_at`, and (populated on approval) `approved_at`.
- **`<section class="palette">`** — 8–12 color swatches as `<div>`
  blocks with hex label + semantic role (primary / secondary /
  danger / warning / success / surface / text-primary / text-muted).
- **`<section class="typography">`** — h1 / h2 / h3 / h4 / body /
  caption / code specimens, each annotated with font-family, size,
  weight, line-height.
- **`<section class="density">`** — one or two spacing tokens
  (sm / md / lg) shown as labeled rulers or padded boxes.
- **`<section class="components">`** — 1 or 2 sample components
  (button / input / card) rendered in the chosen posture + palette +
  typography + density so the user can see the style applied to real
  UI.
- **`<section class="anti-patterns">`** (conditional on user citing
  any in 5.2) — each banned pattern shown under a `❌ NOT LIKE THIS`
  heading with a one-line explanation.

The HTML must be readable when opened directly in a browser — no JS
required, no external resources, no CDN links. Fonts: prefer system
stacks or Google Fonts via a single `@import` with explicit
fallbacks.

#### 5.4 Push to kcc-preview (if available)

If the `kcc-preview` plugin is present in the session, write a
`kind: file` entry pointing at `ui-kickoff.html` into the preview
content directory, then emit a one-line announcement:

```
👀 UI kickoff pushed to preview — review and approve in browser.
```

If `kcc-preview` is not available, emit a fallback line giving the
file path and asking the user to open it manually:

```
⚠ kcc-preview not available — open file:// <absolute path> to review.
```

#### 5.5 User review loop — unbounded until Approve or Abort

Ask via `AskUserQuestion` (single question, three options):

- **Approve UI kickoff** — proceed to step 6.
- **Request changes** — free text via Other describing what to change.
- **Abort** — terminate plan-feature entirely.

**There is no round cap.** Iterate until the user picks Approve or
Abort:

- On **Request changes**: incorporate the feedback into
  `ui-kickoff.html`, re-push to kcc-preview, re-ask the question.
- On **Approve**: break the loop; stamp `approved_at` into the HTML
  comment header; proceed to step 6.
- On **Abort**: stop the entire plan-feature workflow. Emit
  `✗ Aborted at UX Visual Direction sub-phase` and return an abort
  signal to the orchestrator.

#### 5.6 Soft nudge (not a hard cap)

If the user has requested changes to **the same UX dimension**
(posture / palette / typography / density / interaction archetype /
anti-patterns) **three or more times** in this loop, add one extra
sentence to the next `AskUserQuestion` prompt:

> Heads up: this is round N of iteration on <dimension>. If it helps
> to lock this aspect and move on, pick Approve; otherwise continue
> with Request changes.

The nudge is advisory only. The user can continue iterating
indefinitely. The loop never self-terminates.

#### 5.7 Serialize the approved decisions back into kickoff.md

After Approve, populate `## UX Direction` in the kickoff.md content
you are about to write (step 7) with the user's approved posture /
palette / typography / density / interaction archetype / anti-
patterns, plus a `Reference: ui-kickoff.html` line and
`Status: approved (<ISO 8601 date>)`.

### 6. Derive `<feature-slug>`

- Transliterate / summarize CJK to ASCII.
- kebab-case, `[a-z0-9-]` only.
- Max 48 characters.
- If `.kcc/specs/<slug>/` already exists, try `<slug>-v2`, `<slug>-v3`, etc.

(If the sub-phase in step 5 already wrote `ui-kickoff.html` to a
provisional slug, move it to the final slug directory as part of
step 7 below.)

### 7. Create the output directory + write files

```bash
mkdir -p .kcc/specs/<feature-slug>
```

Write `.kcc/specs/<feature-slug>/kickoff.md` with all 10 sections
populated. If step 5 ran, ensure
`.kcc/specs/<feature-slug>/ui-kickoff.html` is in place (move it if
it was written under a provisional path).

### 8. Structural self-check

Verify before returning:

- **kickoff.md**:
  - Exactly 10 `##` headers, in the order listed above.
  - Metadata section has all five required fields.
  - Original material is ≥ 3 lines.
  - Each of the 7 non-Metadata / non-Original-material / non-UX-Direction
    thinking sections has ≥ 3 bullet lines.
  - `## UX Direction` either (a) has the 6 required bullets
    (Visual pillar / Accessibility priority / Interaction archetypes /
    Anti-patterns to avoid / Reference / Status) when UI sub-phase ran,
    OR (b) has the N/A form with ≥ 3 justifying bullets and
    `Status: N/A`.
  - No bullet is exactly `TBD` or just `- TBD`.
  - Every `ASSUMPTION:` bullet has a matching `needs user confirmation`
    entry in `## Open Questions & Risks`.
- **ui-kickoff.html** (only when sub-phase ran):
  - File exists, parses as HTML (at minimum: contains `<html>` and
    `</html>`), and is self-contained (no external `<script>` /
    `<link>` except a single Google Fonts `@import` if used).
  - Contains `<section class="palette">`, `<section class="typography">`,
    `<section class="density">`, and `<section class="components">`.
  - HTML comment header includes `slug`, `generated_at`, and
    `approved_at`.

If any check fails, fix inline and re-write the file.

### 9. Leak check (Path A only)

If Path A was taken, check whether a new file was created under
`docs/superpowers/specs/` during the superpowers invocation. If yes:

- Delete that file.
- Print a one-line warning to the main session:
  `⚠ superpowers wrote a spec despite scope override — removed <path>`.

### 10. Emit summary

```
✓ Brainstorm complete → .kcc/specs/<slug>/kickoff.md
  (+ ui-kickoff.html if UI sub-phase ran)
  slug=<slug>  platform=<platform>
```

### 11. Return control

Return `<slug>` and `<platform>` to `plan-feature`. The orchestrator
then creates the team and launches T1..T6.

## Definition of Done

- `.kcc/specs/<feature-slug>/kickoff.md` exists, non-empty, and passes
  all structural self-check items for the 10-section schema.
- If the UX Visual Direction sub-phase ran:
  `.kcc/specs/<feature-slug>/ui-kickoff.html` exists, passes its
  structural checks, and carries `approved_at` in the comment header.
- If the sub-phase was skipped (no UI signal): `## UX Direction`
  carries the N/A form with `Status: N/A`.
- If Path A was used, leak check ran and any stray file written under
  `docs/superpowers/specs/` during this invocation has been removed.
- `<slug>` and `<platform>` have been returned to the caller.

## Idempotence check (resume fast-path)

When re-entered for an existing `<feature-slug>` (typically via
plan-feature's Phase -1 Resume branch, but this skill is also
defensive):

- If `.kcc/specs/<feature-slug>/kickoff.md` exists, is non-empty,
  passes the 10-section structural self-check, AND:
  - `## UX Direction` carries `Status: approved (<date>)` AND
    `ui-kickoff.html` exists with a matching `approved_at` timestamp,
    OR
  - `## UX Direction` carries `Status: N/A` and no `ui-kickoff.html`
    is expected
  — then extract `<slug>` and `<platform>` from Metadata and return
  immediately. Do NOT re-run any sub-phase.
- If kickoff.md is missing any piece (fewer than 10 sections, UX
  Direction Status missing, HTML file missing despite approved status,
  etc.): re-enter the appropriate sub-phase from the earliest broken
  step. The UX Visual Direction loop picks up from the latest
  `ui-kickoff.html` on disk (if any) rather than from scratch.

## Anti-patterns

- **Do not write spec.md, ui.md, ac.md, test cases, or review.md** —
  those belong to the six teammate steps. Your single artifacts are
  `kickoff.md` and (conditionally) `ui-kickoff.html`.
- **Do not exceed 10 routing + probing questions.** The UX Visual
  Direction sub-phase's own questions are not counted against this
  ceiling and have no cap.
- **Do not invent UX direction content.** The UX Direction section
  must reflect what the user actually picked in the sub-phase, not
  what you think they'd like.
- **Do not cap the UX review loop.** Iterate until the user chooses
  Approve or Abort. Soft nudges are the only form of guidance.
- **Do not run as a teammate.** This skill relies on `AskUserQuestion`
  and direct context access; a teammate cannot provide that.
- **Do not skip Path A when `superpowers:brainstorming` is available**
  in the session — leveraging it is mandatory, not optional.
- **Do not produce an `ui-kickoff.html` with external CDN resources**
  — it must render offline.
- **Do not commit anything** and do not write under `docs/`.

## Failure modes

- **User declines to answer routing questions** — abort with a clear
  message; do not invent feature-name / platform / slug.
- **Input-material file listed but missing** — abort; do not fall back
  to session-only without user confirmation.
- **`superpowers:brainstorming` invocation fails or is interrupted** —
  fall back to Path B and note the switch in the summary.
- **User picks Abort in the UX review loop** — terminate plan-feature
  entirely; emit the abort signal and do not write kickoff.md.
- **`kcc-preview` plugin not available** — degrade gracefully: emit
  the file:// path fallback and continue the loop. Don't block.

<!-- kcc-dev-workflow-step-brainstorm-sentinel: v1 -->
