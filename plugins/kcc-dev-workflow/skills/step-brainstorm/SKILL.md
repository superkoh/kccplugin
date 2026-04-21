---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads .kcc/specs/<slug>/_kickoff.md, writes brainstorm.md, marks its team task completed.
---

# Step 1 — Brainstorm (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/specs/<feature-slug>/_kickoff.md`

## Output
- `.kcc/specs/<feature-slug>/brainstorm.md`

## Definition of Done
- Output file exists and contains exactly these 4 sections, in order:
  - `## 目标 (Goals)`
  - `## 约束 (Constraints)`
  - `## 成功指标 (Success Metrics)`
  - `## 待决问题 (Open Questions)`
- Each section has at least one bullet. Skeleton-phase content may be a TODO placeholder.
- The team task for Step 1 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior is the minimum needed to pass DoD:

1. Read `_kickoff.md` to get feature name, slug, platform, original material.
2. Write the output file with the 4 required sections. Each section must have at least one bullet, even if the bullet is `- TODO: detailed in a future iteration`.
3. Run `TaskUpdate(taskId=<your task ID>, status=completed)` using the team's task list.

<!-- kcc-dev-workflow-step-brainstorm-sentinel: v1-skeleton -->
