# kcc-dev-workflow

A two-part dev workflow plugin for the kccplugin marketplace.

## Part 1 — `plan-feature` (this release, v0.1.0 skeleton)

Orchestrates a 6-step planning workflow using Claude Code's team machinery.
Given a feature idea, it produces three artifacts under `.kcc/`:

- `.kcc/specs/<feature-slug>/spec.md` — the spec
- `.kcc/specs/<feature-slug>/ac.md` — acceptance criteria
- `.kcc/tests/cases/<feature-slug>.yaml` — QA test cases (schema compatible with kcc-testing)

Plus `.kcc/specs/<feature-slug>/review.md` with AI peer-review notes.

### Workflow

1. **Brainstorm** — teammate 1 turns the raw idea into structured discussion notes
2. **Spec** — teammate 2 writes the full spec
3. **AC** — teammate 3 writes acceptance criteria from the spec
4. **Review (spec+AC)** — teammate 4 critiques spec and AC together
5. **Test cases** — teammate 5 writes QA test cases from spec+AC
6. **Review (test cases)** — teammate 6 critiques coverage and testability

Each step runs as a teammate in a single team (`dev-plan-<feature-slug>`),
using the general-purpose agent type with the opus model.

### Invoke

Ask Claude any of:

- "帮我规划 <feature> 这个功能"
- "写 spec 和测试用例"
- "plan this feature"

The skill drives pre-flight questions (feature name, input material, target
platform), then runs the workflow end-to-end.

## Part 2 — `build-feature` (placeholder only)

Not yet implemented. Will be added in a future release; invoking it today
returns a TODO notice pointing back to plan-feature.
