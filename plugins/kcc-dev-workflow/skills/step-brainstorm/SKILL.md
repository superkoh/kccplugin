---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs in the main session (not as a teammate) and owns the interactive brainstorm phase — scans context, asks routing and probing questions, produces .kcc/specs/<slug>/kickoff.md with a fixed 9-section schema. If superpowers:brainstorming is available in the session, leverages it for the design exploration (Path A); otherwise runs an inline probing flow (Path B).
---

# Phase 0 — Brainstorm (interactive, main session)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> called by `kcc-dev-workflow:plan-feature` as its first action.

## Where this runs

**Main session.** Unlike the five teammate steps (`step-spec-writer` →
`step-test-case-reviewer`) that run inside the `dev-plan-<slug>` team,
this step runs inline so it can use `AskUserQuestion` and direct context
access. The orchestrator invokes it via
`Skill(skill="kcc-dev-workflow:step-brainstorm")`, receives `<slug>` and
`<platform>` back, then creates the team and launches T1..T5.

## Inputs

- The user's raw feature request (conversation context — last ~20 turns).
- Optional prior material: any file under `docs/`, `specs/`, `product/`,
  `prds/`, or any directory the user points to. Detected via silent scan
  in step 1, confirmed in step 2.

## Output

Single file: `.kcc/specs/<feature-slug>/kickoff.md`. Exactly these nine
`##` level-2 headers, in this order:

```
## Metadata
## Original material
## Problem Statement
## Users & Personas
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
- The other **seven "thinking" sections** — each must contain **≥ 3
  substantive bullet lines** (lines starting with `-` or `*`).
- **No bare `TBD` bullets.** If a point is genuinely unresolved, use an
  `ASSUMPTION: <concrete content>` prefix AND add a matching
  `needs user confirmation: <specific question>` bullet inside
  `## Open Questions & Risks`.

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

### 4. Dispatch — Path A or Path B

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
  its artifact at .kcc/specs/<slug>/kickoff.md with a fixed 9-section
  schema (below)
- Invoke writing-plans — this is the caller's responsibility
- Commit anything

Target 9-section schema the approved design must populate:
1. Metadata  2. Original material  3. Problem Statement
4. Users & Personas  5. Goals & Non-goals  6. Key Scenarios
7. Considered Alternatives  8. Constraints  9. Open Questions & Risks

Return control with approved design content organized into those 9
sections. step-brainstorm handles the file write.
```

When superpowers returns, take the approved design and reshape it into
the 9-section schema.

#### Path B — inline probing

Run 2 to 4 additional `AskUserQuestion` calls to fill gaps in the 9
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

**Hard ceiling: total question count (routing + probing) ≤ 10.** Stop
probing early if the material is already clear.

### 5. Derive `<feature-slug>`

- Transliterate / summarize CJK to ASCII.
- kebab-case, `[a-z0-9-]` only.
- Max 48 characters.
- If `.kcc/specs/<slug>/` already exists, try `<slug>-v2`, `<slug>-v3`, etc.

### 6. Create the output directory

```bash
mkdir -p .kcc/specs/<feature-slug>
```

### 7. Write `kickoff.md`

Write `.kcc/specs/<feature-slug>/kickoff.md` with all 9 sections
populated.

### 8. Structural self-check

Verify before returning:

- Exactly 9 `##` headers, in the order listed above.
- Metadata section has all five required fields.
- Original material is ≥ 3 lines.
- Each of the 7 thinking sections has ≥ 3 bullet lines.
- No bullet is exactly `TBD` or just `- TBD`.
- Every `ASSUMPTION:` bullet has a matching `needs user confirmation`
  entry in `## Open Questions & Risks`.

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
  slug=<slug>  platform=<platform>
```

### 11. Return control

Return `<slug>` and `<platform>` to `plan-feature`. The orchestrator
then creates the team and launches T1..T5.

## Definition of Done

- `.kcc/specs/<feature-slug>/kickoff.md` exists and is non-empty.
- All 9 structural self-check items pass.
- If Path A was used, leak check ran and any stray file written under
  `docs/superpowers/specs/` during this invocation has been removed.
- `<slug>` and `<platform>` have been returned to the caller.

## Anti-patterns

- **Do not write spec.md, ac.md, test cases, or review.md** — those
  belong to the five teammate steps. Your single artifact is
  `kickoff.md`.
- **Do not exceed 10 questions total** (routing + probing combined).
  Over-questioning fragments the conversation.
- **Do not invent content** beyond what the user provided or the input
  file contains. Use `ASSUMPTION:` with a paired `needs user
  confirmation` entry instead.
- **Do not run as a teammate.** This skill relies on `AskUserQuestion`
  and direct context access; a teammate cannot provide that.
- **Do not skip Path A when `superpowers:brainstorming` is available**
  in the session — leveraging it is mandatory, not optional.
- **Do not commit anything** and do not write under `docs/`.

## Failure modes

- **User declines to answer routing questions** — abort with a clear
  message; do not invent feature-name / platform / slug.
- **Input-material file listed but missing** — abort; do not fall back
  to session-only without user confirmation.
- **`superpowers:brainstorming` invocation fails or is interrupted** —
  fall back to Path B and note the switch in the summary.

<!-- kcc-dev-workflow-step-brainstorm-sentinel: v1 -->
