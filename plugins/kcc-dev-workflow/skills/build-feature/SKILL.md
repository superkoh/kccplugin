---
name: build-feature
description: Placeholder for part 2 of kcc-dev-workflow. Not yet implemented. Invoking this skill returns a TODO notice and points the user to plan-feature (part 1) which is the current shipping entry. Triggers on 实现这个 feature / 开始写代码实现 / build this feature / implement this feature — but only to tell the user part 2 isn't ready yet.
---

# build-feature (placeholder)

> ⚠️ Part 2 of kcc-dev-workflow is not yet implemented.

## When invoked

Emit exactly this message to the user, then stop:

> build-feature 尚未实现（part 2 placeholder）。
>
> 请先用 plan-feature 产出规划三件套：
>   - `.kcc/specs/<feature>/spec.md`
>   - `.kcc/specs/<feature>/ac.md`
>   - `.kcc/tests/cases/<feature>.yaml`
>
> 后续版本会把这里接入实现流（读取上述产物 → 实施 → verification）。

Do not attempt to implement anything. Do not call other tools. Just deliver the message.

<!-- kcc-dev-workflow-build-feature-sentinel: v1-placeholder -->
