---
description: Use when the user asks to 写测试用例 / 给这个 feature 出用例 / 帮我覆盖这个需求 / 写 QA 用例 / write test cases / cover this feature with tests / QA cases for this. Analyzes a feature or PRD fragment in current context, confirms scope with the user via AskUserQuestion, then writes a YAML coverage set of LLM-executable manual test cases to .kcc/tests/cases/ with built-in testability and UI/UX-quantification lint.
---

# Writing LLM-executable manual test cases

This skill produces a YAML coverage set of **manual QA test cases** that an
**LLM browser / mobile / desktop agent** executes against the real product
UI. Not automation code. Not unit tests. Not API cases.

Output path: `<project-root>/.kcc/tests/cases/<feature-slug>.yaml` — one
file per feature.

## When to use

Trigger phrases (Chinese + English):
- 写测试用例 / 给这个 feature 出用例 / 帮我覆盖这个需求 / 写 QA 用例
- write test cases / cover this feature with tests / QA cases for this

### When NOT to use
- Writing pytest / Playwright / Appium automation code.
- Unit tests for a function or class.
- API / CLI / non-GUI test cases (out of scope for v0.1).
- Test plan, regression-selection, or suite organization.

## Process — six ordered steps

Run these in order. Steps 1–2 are fast; step 3 onwards commits real work.

### Step 1 — Scan context, draft hypothesis

Without asking the user, read:

1. The last ~20 turns of conversation for feature names, PRD fragments,
   spec file paths.
2. Recently opened / edited files, especially anything under
   `docs/`, `specs/`, `product/`, or `prds/`.
3. The repo root for a PRD-like directory.

Emit a single-sentence hypothesis: *"I think you want cases for feature
**X**, based on **Y**."* Keep it short — this is a prompt for the user,
not a report.

### Step 2 — Confirm scope with `AskUserQuestion`

**Required.** Never skip this step. Ask four questions in a single
`AskUserQuestion` call:

1. *Feature scope* — four options:
   - The hypothesis from step 1 (recommended).
   - One of up to three other candidates you identified.
   - *Something else* — user types the feature in prose.
2. *Target platform* — `web`, `ios`, `android`, `desktop`. Single-select.
3. *Design-tokens source* — path to a token file, or "no tokens available".
4. *UI change?* — does this feature introduce or modify user-visible
   rendering? Single-select:
   - `new-ui` / 新增 UI — new elements, screens, fields, icons.
   - `modified-ui` / 修改 UI — style, layout, spacing, or a new visual state.
   - `logic-only` / 纯逻辑或数据改动，无可见渲染变化.
   - `unsure` — default to UI change (conservative).

The answer becomes the top-level `ui_change: true | false` in the
output YAML (`logic-only` → `false`; everything else → `true`) and
gates whether any case may carry `assertions.visual[]` — see
`references/coverage-techniques.md` §7.

Do not generate any cases until all four are answered.

### Step 3 — Generate coverage candidates

Enumerate 8–15 candidate cases using the techniques in
[`references/coverage-techniques.md`](references/coverage-techniques.md):
happy path, equivalence partitioning, boundary values, state transitions,
error handling, accessibility, visual regression, and one free-form
error-guessing case. One `P0` (happy path); 1–3 `P1`; the rest `P2`.

The *visual regression* angle is gated by `ui_change`:
- `ui_change: true` → at least one case MUST carry `assertions.visual[]`.
- `ui_change: false` → no case may carry `assertions.visual[]`.

See `references/coverage-techniques.md` §7 for the full gate.

### Step 4 — Populate the YAML schema

Schema: [`references/yaml-schema.md`](references/yaml-schema.md). Locator
vocabulary per platform: [`references/platform-locators.md`](references/platform-locators.md).

For every `target:` field, use the platform's accessibility-based
vocabulary — **never** color-based or positional descriptions. "Blue
button in the bottom-right" is a reject-worthy anti-pattern; write
`role=button, name="Checkout"` (or the platform equivalent) instead.

For every `assertions.visual[]` entry, prefer `{token: ...}` with a
resolved_value. If `design_tokens_source` is null or the token path is
unknown, fall back to `number + unit + tolerance` (e.g. `8px ±1px`,
`#1E6FFF ΔE<2.3`). "Looks good" is not a valid expected value.

See the three shipped examples for the exact shape:
- `examples/web-checkout-coupon.yaml` — ARIA + token references.
- `examples/ios-login-flow.yaml` — accessibility-id + HIG floors.
- `examples/android-settings-toggle.yaml` — resource-id + Material floors.

### Step 5 — Triple lint

Run all three checks in [`references/lint-rules.md`](references/lint-rules.md).

**UI-change consistency** (hard, file-level): verify the top-level
`ui_change` flag matches the cases actually produced. `ui_change: true`
with zero visual assertions across the file → regenerate step 3 with a
visual-regression case. `ui_change: false` with any `assertions.visual[]`
→ drop the visual block from the offending case and list it in the
summary's `rejected` bucket.

**Testability five-check** (hard):
- `oracle_present` — every step has exactly one verifiable expected result.
- `state_reachable` — preconditions + earlier steps lead to each state.
- `deterministic` — no unmasked timestamps / random IDs in oracles.
- `isolated` — no cross-case state references.
- `waits_specified` — async steps have an explicit wait condition.

Hard-reject cases that fail an unfixable check. Auto-fix deterministic
masking and wait insertion. Rejected cases go **only** into the final
summary, not into the YAML file.

**UIUX quantification check** (hard): apply the blacklist regex to every
oracle and every visual `expected`. On match, attempt token resolution,
then numeric + tolerance, then WCAG/HIG/Material rule reference. On
failure, tag the assertion `needs_quantification: TODO` and surface it
in the summary.

**Accessibility-floor auto-injection** (not user-toggleable): every case
that touches an interactive control gets platform-appropriate min target
size and min contrast ratio rules appended. Do **not** ask the user to
opt out.

### Step 6 — Write + report

1. Write the YAML to `<project-root>/.kcc/tests/cases/<feature-slug>.yaml`.
   `<feature-slug>` is kebab-case of the `feature:` header (with CJK
   characters preserved), max 64 chars. Create `.kcc/tests/cases/` if
   it doesn't exist.
2. Emit the user-facing summary:

   ```
   ✅ written: <N>
   ⚠️ TODO-visual: <N>
       TC-<id>: <which visual assertion, why unresolved>
       ...
   ❌ rejected: <N>
       TC-<id>: <which testability check failed, short reason>
       ...
   ```

## Invariants

Before returning to the user, confirm:

- The `platform:` header matches what the user picked in step 2.
- The `ui_change:` header is present and matches the step-2 answer.
- `ui_change: true` → at least one case carries `assertions.visual[]`.
- `ui_change: false` → no case carries `assertions.visual[]`.
- Every case's `testability` block has all five fields filled.
- No case's oracle or visual `expected` matches a blacklisted pattern.
- No case references another case's state ("TC-001's order", "the user
  from earlier").
- The output path starts with `.kcc/tests/cases/`.

## Anti-patterns (each has a one-line fix)

- "Click the blue button in the bottom-right." → Use ARIA role + accessible name.
- Step with two assertions. → Split into two steps, each with one oracle.
- "Looks properly aligned." → Token reference or `number + unit + tolerance`.
- "Uses the order from TC-COUPON-001." → Seed fresh data in `preconditions`.
- Missing `waits_specified` for an async step. → Add `等待 <target> 在 N 秒内出现`.
- `assertions.visual[]` on a `ui_change: false` case. → Drop the visual
  block; that case isn't claiming a visual contract.
- `ui_change: true` with no visual assertions anywhere. → Add one P1 or P2
  visual-regression case per coverage-techniques.md §7.

<!-- kcc-testing-write-test-cases-sentinel: v1 -->

