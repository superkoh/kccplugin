---
description: Use when the user asks to 写测试用例 / 给这个 feature 出用例 / 帮我覆盖这个需求 / 写 QA 用例 / write test cases / cover this feature with tests / QA cases for this. Analyzes a feature or PRD fragment in current context, confirms scope with the user via AskUserQuestion, then writes a YAML coverage set of LLM-executable manual test cases to .kcc/tests/cases/ with built-in testability, UI/UX-quantification, RTM, and coverage-trigger lint.
---

# Writing LLM-executable manual test cases

Produces a YAML coverage set of **manual QA test cases** for an
**LLM browser / mobile / desktop agent** to execute against the real
product UI. Not automation code. Not unit tests. Not API cases.

Output path: `<project-root>/.kcc/tests/cases/<feature-slug>.yaml` —
one file per feature.

## When to use

Trigger phrases: 写测试用例 / 给这个 feature 出用例 / 帮我覆盖这个需求 /
写 QA 用例 / write test cases / cover this feature with tests / QA cases
for this.

### When NOT to use

- Writing pytest / Playwright / Appium automation code.
- Unit tests for a function or class.
- API / CLI / non-GUI test cases (out of scope for v0.2).
- Test plan, regression-selection, or suite organization.

## Process — six ordered steps

Steps 1–2 are fast; step 3 onward commits real work.

### Step 1 — Scan context, draft hypothesis

Without asking, read the last ~20 turns for feature names / PRD
fragments / spec paths, recently opened or edited files under `docs/`,
`specs/`, `product/`, `prds/`, and the repo root for a PRD-like
directory. Emit a single-sentence hypothesis: *"I think you want cases
for feature **X**, based on **Y**."*

While scanning, pre-identify **requirement sub-clauses** (e.g.
"PRD §4.2-a 接受有效优惠码", "§4.2-b 拒绝过期码") for step-6 RTM. If
structured sub-clauses don't exist, list the implicit branches you'll
enumerate.

### Step 2 — Confirm scope with `AskUserQuestion`

One `AskUserQuestion` call (up to 4 questions per call):

1. **Feature scope** — hypothesis (recommended) / up to three other
   candidates you identified / *Something else* (prose).
2. **Target platform** — `web` / `ios` / `android` / `desktop`.
3. **Design-tokens source** — path to a token file, or "no tokens available".
4. **UI change?** — does this feature introduce or modify user-visible
   rendering? Single-select:
   - `new-ui` / 新增 UI — new elements, screens, fields, icons.
   - `modified-ui` / 修改 UI — style, layout, spacing, or new visual state.
   - `logic-only` / 纯逻辑或数据改动，无可见渲染变化.
   - `unsure` — default to UI change (conservative).

Q4 becomes the top-level `ui_change` flag (`logic-only` → `false`;
everything else → `true`) and gates whether any case may carry
`assertions.visual[]` — see `references/coverage-techniques.md` §7.

Then a **second `AskUserQuestion` call** for coverage triggers
(multi-select):

5. **Which coverage angles does this feature require?**
   - `security` — touches auth, input reaching the server, permission-
     gated resources, or content from other users.
   - `i18n` — renders localized text / dates / currency, or accepts
     text input meant to be displayed back.
   - `performance` — has a latency-visible action (submit, list render,
     search, media load) or rapidly-toggleable state.

   When the user is unsure, flip on any angle whose trigger description
   plausibly matches — one extra case is cheap, shipping zero injection
   cases is expensive.

Don't generate cases until all five questions are answered.

### Step 3 — Generate coverage candidates

Enumerate 8–15 candidate cases using
[`references/coverage-techniques.md`](references/coverage-techniques.md):

- **Baseline angles (always consider)** — §§ 1–8: happy path,
  equivalence, boundary, state transition, error handling, accessibility,
  visual, error-guessing.
- **Conditional angles** —
  - `security: true` → §9 requires at least one case per applicable
    sub-angle (injection / unicode / horizontal authz / vertical authz /
    session).
  - `i18n: true` → §10 requires locale-format, translation-length, RTL,
    character-set coverage.
  - `performance: true` → §11 requires latency-floor, cold-vs-warm,
    double-submit, offline→online coverage.

Priority distribution: at most 3 `P0`, 1–3 `P1`, rest `P2` (§7).

The visual angle (§7) is gated by `ui_change`:
- `ui_change: true` → at least one case carries `assertions.visual[]`.
- `ui_change: false` → no case carries `assertions.visual[]`.

### Step 4 — Populate the YAML schema

Schema: [`references/yaml-schema.md`](references/yaml-schema.md).
Locator vocabulary per platform:
[`references/platform-locators.md`](references/platform-locators.md).

**Locator discipline.** Every `target:` uses the platform's
accessibility-based vocabulary. "Blue button in the bottom-right" is
reject-worthy — write `role=button, name="Checkout"` (or the platform
equivalent) instead.

**Oracle discipline.** One verifiable result per reaction to the same
event. If a single event (one click, one submit) produces multiple
observable reactions, a step may carry an array of oracle strings.
Assertions for a later event split into a new step.

**Visual discipline.** Every `assertions.visual[]` entry uses one of two
forms (see yaml-schema.md "Visual assertion forms"):

- **Form A — property-based.** When the claim reduces to a single
  computed property. Prefer `{token: ...}` with a `resolved_value`; fall
  back to `expected_value + match + tolerance`; fall back to a WCAG /
  HIG / Material rule reference.
- **Form B — description-based (LLM-vision).** When the claim is a
  composite visual property (geometry + color + hierarchy) AND the
  standard is **absolute** — describable without reference to any prior
  rendering. Name elements, name states, name concrete geometric /
  chromatic / hierarchical relationships. Vague ("looks good") and
  relative ("仍然居中 / and before") language is rejected at lint.

No snapshot-style assertions ("matches baseline", "same as previous
run"). Baselines are explicitly out of scope (§7 philosophy note).

**RTM discipline.** Every case's `requirement_ref` cites a specific
PRD / ticket sub-clause (e.g. `"PRD-2026-042 §4.2-a"`), not just the
file-level ref. Empty `requirement_ref` is a hard reject.

### Step 5 — Lint passes

Run every check in [`references/lint-rules.md`](references/lint-rules.md):

1. **UI-change consistency** (file-level) — `ui_change` flag matches cases.
2. **Coverage-trigger fulfilment** (file-level) — each `true` trigger
   has a matching tagged case.
3. **RTM check** — every case cites a sub-clause; `rtm_summary` block
   present and counts consistent.
4. **Testability five-check** — oracle / reachable / deterministic /
   isolated / waits.
5. **Visual-form completeness** — every `assertions.visual[]` is pure
   Form A or pure Form B, no mixed fields, no missing required fields.
6. **Visual-language three-blacklist** — L1 vague/subjective, L2
   baseline-implying, L3 reference-free comparative.
7. **Accessibility-floor auto-injection** — inject platform a11y floor
   on interactive-control cases (not user-toggleable).

Hard rejects drop the case and go into the summary's `❌ rejected`
bucket. Warns auto-fix in place. Silent drop is forbidden.

### Step 6 — Write + report

1. Compute `rtm_summary`:
   - `requirement_branches_total` — count of sub-clauses identified in step 1.
   - `requirement_branches_covered` — count of sub-clauses cited by at
     least one surviving case.
   - `uncovered_branches` — explicit list of `<ref>: <short reason>` for
     anything not covered (deferred, out of scope, honestly missed).
   - `unreferenced_cases` — case IDs with empty `requirement_ref`;
     must be empty after lint.
2. Write the YAML to `<project-root>/.kcc/tests/cases/<feature-slug>.yaml`.
   `<feature-slug>` is **ASCII-only** kebab-case of the `feature:` header
   (transliterate / summarize CJK — CJK filenames hit NFC/NFD
   normalization bugs on Windows / macOS / Linux git). Max 64 chars.
   Create `.kcc/tests/cases/` if missing.
3. Emit the user-facing summary:

   ```
   ✅ written: <N>
   📎 RTM: <covered>/<total> requirement branches covered
       uncovered:
           <branch ref>: <short reason>
           ...
   ⚠️ TODO-visual: <N>
       TC-<id>: <which visual assertion, why unresolved>
       ...
   ❌ rejected: <N>
       TC-<id>: <which check failed, short reason, which rule>
       ...
   ```

## Anti-patterns

- "Click the blue button in the bottom-right." → Use ARIA role +
  accessible name.
- Step with two oracles from two different events. → Split into two
  steps. (Multiple reactions to the **same** event → allowed as an
  oracle array.)
- "Toast 仍然居中" / "same as before" / "slightly tighter" / "looks
  properly aligned." → Restate as an absolute standard ("Toast 水平居中,
  左右 padding 均等，与下方主按钮至少 8px 间距") or move to Form C
  out-of-scope.
- "matches baseline snapshot" / `tolerance: strict` with no further spec.
  → Rewrite as Form A or Form B, or drop to Form C — this skill doesn't
  do baselines.
- "Uses the order from TC-COUPON-001." → Factor shared setup into a
  fixture; repeat-seed in `preconditions.data_setup`.
- Currency / date oracle as exact literal ("¥90.00", "2026-04-18"). →
  Use a format rule or regex; exact literals are locale-fragile.

<!-- kcc-testing-write-test-cases-sentinel: v1 -->
