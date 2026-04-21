---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads spec.md + ac.md, appends the "## spec-ac" section to review.md, marks its team task completed.
---

# Step 4 — Spec+AC Reviewer (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/specs/<feature-slug>/_kickoff.md`
- `.kcc/specs/<feature-slug>/spec.md`
- `.kcc/specs/<feature-slug>/ac.md`

## Output
- Append to `.kcc/specs/<feature-slug>/review.md`. If the file does not exist, create it with a top-level header `# Review — <feature-name>`.
- The appended content MUST start with a line `## spec-ac` (exact match) and contain the subsections listed below.

## Definition of Done
- `review.md` exists.
- `review.md` contains a `## spec-ac` section with:
  - `### Issues` — a list of issues (each with severity `blocker` / `major` / `minor`), may be empty (state "No issues found." explicitly).
  - `### Coverage gaps` — what the spec or AC does not cover (may be empty).
- If any issue has severity `blocker`, the reviewer inserts a marker comment `<!-- TODO: blocker-<id> -->` at the relevant location in spec.md or ac.md.
- The team task for Step 4 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior:

1. Read all 3 input files.
2. If `review.md` does not exist, create it with header `# Review — <feature-name>`.
3. Append a `## spec-ac` section with the 2 required subsections. Skeleton-phase content may simply say `No issues found.` and `No gaps identified.`.
4. Run `TaskUpdate(taskId=<your task ID>, status=completed)`.

<!-- kcc-dev-workflow-step-spec-ac-reviewer-sentinel: v1-skeleton -->
