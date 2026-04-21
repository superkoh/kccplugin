# YAML schema — `write-test-cases` v0.2

Every case file is one YAML document, one feature. Top-level metadata, then a
`cases:` array.

## Top-level keys

| Key | Required | Type | Notes |
|-----|----------|------|-------|
| `feature` | yes | string | Human name of the feature under test. |
| `requirement_ref` | no | string | File-level PRD / ticket / spec link. Per-case refs (below) are authoritative for RTM. |
| `platform` | yes | enum | `web`, `ios`, `android`, `desktop`. |
| `design_tokens_source` | yes | string \| null | Path to a token file, or `null`. |
| `ui_change` | yes | boolean | `true` if the feature introduces or modifies user-visible rendering; `false` for pure logic / data changes. Gates whether any case may carry `assertions.visual[]`. |
| `coverage_triggers` | yes | object | Which coverage angles this feature requires. See below. |
| `generated_at` | yes | string (ISO date) | Date the file was generated. |
| `generated_by` | yes | string | Must start with `kcc-testing/write-test-cases`. |
| `cases` | yes | array | One entry per case. Order = intended execution order. |
| `rtm_summary` | yes | object | Requirements-traceability self-check. See below. |

### `coverage_triggers`

Set in step 2 from the user's `AskUserQuestion` answers. Each flag gates whether
the matching coverage angle is **required** in this file.

```yaml
coverage_triggers:
  security: true | false          # feature touches auth, input → server, permission
  i18n: true | false              # feature renders localized text / dates / currency
  performance: true | false       # feature has a latency-visible user action
```

Rule: when a trigger is `true`, the file MUST contain at least one case whose
`tags` include the matching keyword (`security` / `i18n` / `performance`).
`lint-rules.md` §"Coverage-trigger fulfilment" enforces this.

### `rtm_summary`

Requirements Traceability Matrix self-review. Written after all cases are lint-passed.

```yaml
rtm_summary:
  requirement_branches_total: 7         # count of requirement sub-clauses the skill identified
  requirement_branches_covered: 6       # count covered by at least one case
  uncovered_branches:                   # explicit list of what no case covers
    - "PRD §4.2-c: 优惠券叠加 (deferred — out of current scope)"
  unreferenced_cases: []                # case IDs that don't cite any requirement (should be empty)
```

The skill MUST populate this block in step 6. Empty `uncovered_branches` is
fine; missing the block is not.

## Case fields

| Key | Required | Type | Notes |
|-----|----------|------|-------|
| `id` | yes | string | `TC-<AREA>-<NNN>`, unique within the file. |
| `title` | yes | string | Short, imperative, human-readable. |
| `priority` | yes | enum | `P0` (release blocker) / `P1` (major) / `P2` (minor). |
| `requirement_ref` | yes | string | Specific PRD / ticket sub-clause this case validates, e.g. `"PRD-2026-042 §4.2-a"`. Empty string not allowed. |
| `tags` | yes | array of strings | Category tags. Coverage-trigger cases must include the matching keyword (`security` / `i18n` / `performance` / `a11y`). |
| `preconditions.state` | yes | string | Prose description of the product state before step 1. |
| `preconditions.data_setup` | yes | array of strings | Each line is one imperative setup action. Empty array allowed. Must also be idempotent — re-running the file must not fail on leftover state from a prior aborted run. |
| `steps` | yes | array | Ordered, ≥1. Each step has `action` + `oracle` (see note on composite oracles below). |
| `steps[].n` | yes | integer | 1-based step number. |
| `steps[].action` | yes | string | Imperative; quote literal inputs with `"..."`. |
| `steps[].oracle` | yes | string \| array | One verifiable expected result **per reaction to the same event**. If a single event produces multiple observable reactions, an array of oracle strings is allowed; across-event assertions must be split into separate steps. |
| `assertions.visual` | no | array | See "Visual assertion forms" below. Empty or absent when the case makes no visual claim. |
| `assertions.accessibility` | no | array | Each entry: `rule`, `target`, plus rule-specific fields. Auto-injected per platform floor unless already present. |
| `cleanup` | yes | array of strings | Idempotent cleanup actions. Empty array allowed only if `data_setup` is also empty. |
| `testability` | yes | object | Audit trail; see below. |

## Locator syntax per platform

The `target` string is platform-specific; always quote literal strings.
See `platform-locators.md` for the full vocabulary.

## Visual assertion forms

Every entry in `assertions.visual[]` MUST take exactly one of the two forms
below. Fields are not mixed across forms. The choice is per-assertion, not
per-file — a case may carry one of each.

### Form A — property-based

Use when the claim is a single computed property with a concrete expected value.

```yaml
- target: 'role=button, name="应用优惠码"'
  property: background-color        # any computed-style property or layout metric
  expected_value: "#1E6FFF"
  match: color-equal                # exact-string | color-equal | numeric | regex
  tolerance:                        # shape depends on match
    delta_e_max: 2.3                #   color-equal → delta_e_max (ΔE 2000)
    # abs: "1px"                    #   numeric → abs or pct
    # pct: 5
```

`match` semantics:
- `exact-string` — post-normalization string equality (see "Computed-value normalization" below). `tolerance` omitted.
- `color-equal` — ΔE 2000 distance within `tolerance.delta_e_max` (default 2.3).
- `numeric` — numeric value within `tolerance.abs` or `tolerance.pct`.
- `regex` — `expected_value` is a regex; `tolerance` omitted.

`tolerance` omitted entirely means "strict" for that match type
(bit-equal string / ΔE=0 / absolute numeric equality).

### Form B — description-based (LLM-vision)

Use when the claim is a composite visual property that cannot be reduced to a
single property, but CAN be stated as an **absolute** standard — i.e. an LLM
looking at the current rendering alone can decide true/false, with no
reference to any historical baseline.

```yaml
- target: 'role=alert'
  description: |
    错误提示从页面顶部滑入；背景为 danger 色系（深红或品红），
    白色文字在其上对比清晰；水平居中，且不遮挡下方主按钮；
    阴影柔和向下扩散，无硬边或锯齿。
  judge_by: llm-vision
```

Rules for `description`:
- Must be **absolute** — no "仍然 / 和之前一样 / similar to / 更紧凑" etc. Those require baselines; baselines are out of scope for this skill.
- Must be **operational** — name elements, name states, name geometry/color/hierarchy relationships in concrete terms. Vague language ("looks good / nicely aligned / 合适的") is rejected by lint.

See `lint-rules.md` §"Visual-form completeness and language" for the full rule.

### Form C — explicit out-of-scope (not a YAML form)

Some visual concerns — overall aesthetic coherence, subjective "feel" across
pages — can be stated neither as a property nor as an absolute description.
These do NOT become `assertions.visual[]` entries. Instead, note them in a
YAML comment above the case or in the rtm_summary's `uncovered_branches`:
they are delegated to human design review or to a separate visual-regression
automation layer.

## Computed-value normalization

Different engines serialize the same computed value differently
(`rgb(30, 111, 255)` vs `rgba(30,111,255,1)`, `0.5em` vs `8px`). For Form A:
- `match: color-equal` normalizes both sides to OKLCH and compares ΔE.
- `match: numeric` resolves both sides to the same unit (px for length, ms
  for time) before comparing.
- `match: exact-string` compares after whitespace collapsing and lowercasing.

Authors should not hand-encode normalized forms — write the natural expected
value and let the executor normalize.

## Token references

If a Form A `expected_value` uses `{token: path.to.token}`, it MUST also carry
a `resolved_value` field with the concrete value at generation time. Both
survive in the file so the executor can verify *and* the author can audit.

```yaml
expected_value: "{token: color.primary.500}"
resolved_value: "#1E6FFF"
match: color-equal
```

## `testability` audit trail

```yaml
testability:
  oracle_present: true              # every step has an oracle
  state_reachable: true             # preconditions + prior steps can reach each state
  deterministic: true               # no unmasked timestamps/randomness/order-dependent indices in oracles
  isolated: true                    # no reliance on other cases' leftovers
  has_explicit_wait: true           # bool — at least one step carries an explicit wait condition when needed
  wait_spec: "step 3 waits up to 5s for home_title"   # string — or "n/a — all oracles are sync DOM reads"
```

All six fields are required. This is audit trail for cases that **passed**
the skill's lint. Cases that failed lint never land in a YAML file.
