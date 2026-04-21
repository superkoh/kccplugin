---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads _kickoff.md + brainstorm.md, writes spec.md, marks its team task completed.
---

# Step 2 — Spec Writer (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/specs/<feature-slug>/_kickoff.md`
- `.kcc/specs/<feature-slug>/brainstorm.md`

## Output
- `.kcc/specs/<feature-slug>/spec.md`

## Definition of Done
- Output file exists and contains exactly these 7 sections, in order:
  - `## 背景 (Background)`
  - `## 目标 (Goals)`
  - `## 范围 (Scope)`
  - `## 非目标 (Non-goals)`
  - `## 数据模型 (Data Model)`
  - `## 交互流 (Interaction Flow)`
  - `## 风险 (Risks)`
- Each section has at least one paragraph or bullet. Skeleton-phase content may be a TODO placeholder.
- The team task for Step 2 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior:

1. Read both input files.
2. Write the output file with the 7 required sections in order. Each section must have at least a TODO bullet.
3. Run `TaskUpdate(taskId=<your task ID>, status=completed)`.

<!-- kcc-dev-workflow-step-spec-writer-sentinel: v1-skeleton -->
