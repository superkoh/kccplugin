---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads spec.md, writes ac.md, marks its team task completed.
---

# Step 3 — AC Writer (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/specs/<feature-slug>/_kickoff.md`
- `.kcc/specs/<feature-slug>/spec.md`

## Output
- `.kcc/specs/<feature-slug>/ac.md`

## Definition of Done
- Output file exists.
- Contains a top-level header `# Acceptance Criteria — <feature-name>`.
- Contains at least 3 acceptance criteria, each written as a `### AC-N` section using Given/When/Then (or equivalent structured) form.
- Each AC is independently verifiable (each cites a specific expected observable outcome).
- The team task for Step 3 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior:

1. Read `_kickoff.md` and `spec.md`.
2. Write the output file with at least 3 `### AC-N` sections in Given/When/Then form. Skeleton-phase content may use TODO placeholders in the When/Then fields.
3. Run `TaskUpdate(taskId=<your task ID>, status=completed)`.

<!-- kcc-dev-workflow-step-ac-writer-sentinel: v1-skeleton -->
