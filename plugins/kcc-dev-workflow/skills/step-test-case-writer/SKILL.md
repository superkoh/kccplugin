---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Reads spec.md + ac.md + kickoff, writes .kcc/tests/cases/<slug>.yaml with a schema compatible with the kcc-testing plugin output, marks its team task completed.
---

# Step 5 — Test Case Writer (skeleton)

> ⚠️ Orchestrator-only. Direct invocation is unsupported.

## Inputs
- `.kcc/specs/<feature-slug>/_kickoff.md`  (provides `platform`)
- `.kcc/specs/<feature-slug>/spec.md`
- `.kcc/specs/<feature-slug>/ac.md`

## Output
- `.kcc/tests/cases/<feature-slug>.yaml`

## Definition of Done
- Output file exists and is parseable YAML.
- Top-level fields: `feature` (string), `platform` (web/ios/android/desktop), `cases` (non-empty list).
- Each case has: `id`, `title`, `priority` (P0/P1/P2), `steps` (non-empty list), `oracle` (string or list).
- At least one case is priority `P0`.
- YAML schema is compatible with the format produced by the kcc-testing plugin's output under `.kcc/tests/cases/` (schema documented here, not cross-referenced).
- The team task for Step 5 has been marked `completed` via TaskUpdate.

## Process (skeleton — to be detailed later)

**TODO**: full methodology in a later iteration. Skeleton behavior:

1. Read `_kickoff.md` (for platform), `spec.md`, `ac.md`.
2. Write a YAML file like this template — each AC becomes one case:

```yaml
feature: "<feature name>"
platform: "<web|ios|android|desktop>"
cases:
  - id: "TC-001"
    title: "<AC-1 title>"
    priority: "P0"
    steps:
      - "TODO: step details in a future iteration"
    oracle: "TODO: expected result"
```

3. Run `TaskUpdate(taskId=<your task ID>, status=completed)`.

<!-- kcc-dev-workflow-step-test-case-writer-sentinel: v1-skeleton -->
