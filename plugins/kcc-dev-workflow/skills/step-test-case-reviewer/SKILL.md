---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads the YAML test cases + spec.md + ac.md, appends the "## test-cases" section to review.md, marks its team task completed.
---

# Step 6 — Test Case Reviewer (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/tests/cases/<feature-slug>.yaml`
- `.kcc/specs/<feature-slug>/spec.md`
- `.kcc/specs/<feature-slug>/ac.md`

## Output
- Append to `.kcc/specs/<feature-slug>/review.md`.
- The appended content MUST start with a line `## test-cases` (exact match).

## Definition of Done
- `review.md` contains both a `## spec-ac` section (from Step 4) and a `## test-cases` section (from Step 6).
- The `## test-cases` section contains:
  - `### Coverage` — for each AC, whether at least one test case covers it (table or bullet list).
  - `### Issues` — locator / verifiability issues, with severity `blocker` / `major` / `minor`. May explicitly state "No issues found."
- The team task for Step 6 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior:

1. Read all 3 input files.
2. Append to `review.md` a `## test-cases` section with the 2 required subsections. Skeleton-phase content may state "All AC covered." and "No issues found.".
3. Run `TaskUpdate(taskId=<your task ID>, status=completed)`.

<!-- kcc-dev-workflow-step-test-case-reviewer-sentinel: v1-skeleton -->
