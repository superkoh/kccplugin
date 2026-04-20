# Lint rules

Every case passes multiple lint passes **at generation time**, before being
written to disk. Cases that fail a hard check never land in the YAML file;
they are listed in the user-facing summary's `rejected` bucket with a reason.

## UI-change consistency (file-level)

The top-level `ui_change` flag gates all visual assertions in the file.
This check runs first because it can reject whole cases before the
finer-grained passes.

| `ui_change` | Requirement | Violation disposition |
|-------------|-------------|-----------------------|
| `true`  | At least one case in the file MUST carry a non-empty `assertions.visual[]`. | **Hard reject file** — regenerate step 3 with a visual-regression case added. |
| `false` | No case in the file MAY carry `assertions.visual[]`. | **Hard reject case** — drop the visual block from the offending case and list it in the summary's `rejected` bucket. |
| missing | N/A | **Hard reject file** — `ui_change` is a required top-level field. |

See `coverage-techniques.md` §7 for the definition of what counts as a
UI change.

## Coverage-trigger fulfilment (file-level)

For each `coverage_triggers.*` that is `true`, the file MUST contain at
least one case whose `tags` include the matching keyword.

| Trigger | Required tag | Violation disposition |
|---------|--------------|-----------------------|
| `security: true` | `security` on ≥1 case | **Hard reject file** — go back to step 3 and add security cases per `coverage-techniques.md` §9. |
| `i18n: true` | `i18n` on ≥1 case | **Hard reject file** — add i18n cases per §10. |
| `performance: true` | `performance` on ≥1 case | **Hard reject file** — add performance cases per §11. |

`a11y` coverage is always required (§6); the accessibility-floor auto-injection
below is its enforcement, not this check.

## RTM (Requirements-Traceability) check

File-level requirement traceability self-check.

| Check | Reject pattern | Disposition |
|-------|----------------|-------------|
| `case_requirement_ref` | Any case with `requirement_ref` empty, missing, or equal to the file-level `requirement_ref` alone without a sub-clause | **Hard reject case** — each case must cite a specific sub-clause. |
| `rtm_summary_present` | Missing top-level `rtm_summary` block | **Hard reject file** |
| `rtm_counts_consistent` | `requirement_branches_covered` > `requirement_branches_total`, or `unreferenced_cases` non-empty | **Hard reject file** |

Uncovered requirement branches are NOT a hard reject — they surface
transparently in the summary under `uncovered_branches`. The goal is
honest self-accounting, not forced completeness.

## Testability five-check

| Check | Reject pattern | Disposition |
|-------|----------------|-------------|
| `oracle_present` | A step without `oracle`, or oracle reads "看起来对" / "confirm it works" / "check it looks right" | **Hard reject** |
| `state_reachable` | Preconditions + earlier steps cannot reach the state a later step depends on. Also triggers when a step's `action` references another step's oracle state ("在 step 3 的 oracle 满足后立即…") without a named wait. | **Hard reject** |
| `deterministic` | Unmasked timestamps / random IDs / order-dependent list indexes / floating-point equality / iteration-order-dependent map reads in an oracle | **Warn + auto-mask**: rewrite the oracle to use `{{date}}` / `{{uuid}}` patterns, loose regex, or explicit ordering. |
| `isolated` | Precondition or oracle references "the order from TC-XXX" / "leftover data from the previous run" | **Hard reject** — factor shared setup into a fixture/helper and repeat-seed in `preconditions.data_setup`. |
| `waits_specified` | Async step with no explicit wait condition; `testability.has_explicit_wait: true` with empty or "n/a" `wait_spec`; `has_explicit_wait: false` with no `"n/a — …"` justification in `wait_spec` | **Warn + auto-insert** `等待 <target> 在 N 秒内出现`; for the audit-field mismatch: **hard reject**. |

## Visual-form completeness and language

Applies only when `assertions.visual[]` is non-empty.

### Form completeness (hard)

Every entry in `assertions.visual[]` MUST satisfy exactly one of:

- **Form A**: has `property`, `expected_value`, `match`; `tolerance` required for `color-equal` / `numeric`, forbidden for `exact-string` / `regex` (or must be absent).
- **Form B**: has `description`, `judge_by: llm-vision`; NO `property` / `expected_value` / `match` / `tolerance` fields.

Mixed fields (any Form A field alongside `description` or `judge_by`) → **hard reject** the entry with reason `visual-form-mixed`. Missing required fields for the declared form → **hard reject** with reason `visual-form-incomplete`.

### Language check — three blacklists (hard)

Apply to every `step.oracle` and every Form B `description`:

**L1. Vague / subjective**
```
/看起来.*(对|正常|好)/
/nicely|properly|clearly|correctly|appropriate/i
/合适的|漂亮的|明显的/
```

**L2. Baseline-implying (relative)**
```
/仍然|没变化|和之前一样|保持原样|没改/
/similar to|same as (before|the previous)|unchanged/i
/类似|差不多|一样的/
```

**L3. Reference-free comparative adjectives**
```
/更(紧凑|柔和|大|小|明显|清晰)/
/(略|稍微)(大|小|紧|宽|窄)/
/slightly (larger|smaller|tighter|wider|narrower)/i
/a bit (more|less)/i
```

Disposition for L1 / L2 / L3 matches:

1. **Form A entry** — the skill attempts, in order:
   a. Replace with a `{token: ...}` reference resolved against `design_tokens_source`.
   b. Replace with `expected_value + match + tolerance` (e.g. `8px` + `numeric` + `abs: 1px`).
   c. Replace with a WCAG / HIG / Material rule reference.
   
   If none succeeds, tag the assertion `needs_quantification: TODO` and
   surface it in the `⚠️ TODO-visual` bucket. **Silent drop is forbidden.**

2. **Form B entry (description)** — the skill attempts to rewrite the
   description into absolute, operational language (name elements,
   concrete geometry / color / hierarchy). If no rewrite is possible
   (the underlying concern is genuinely relative to a prior state),
   **hard reject** the visual entry with reason `relative-by-implication`
   and surface in `⚠️ TODO-visual`.

3. **Step oracle match (any layer)** — **hard reject** the case.
   Oracles have no Form B fallback; they must be verifiable reads or
   matches, not prose.

## Accessibility-floor auto-injection (not user-toggleable)

For every case where steps interact with a control, auto-append the rules
below unless the case already carries them. Injection is additive — never
overrides a stricter rule the author wrote.

| Platform | Min target size | Min contrast (text) | Min contrast (UI) |
|----------|-----------------|---------------------|-------------------|
| web      | 24 CSS px (WCAG-2.5.8) | 4.5:1 (WCAG-1.4.3) | 3:1 (WCAG-1.4.11) |
| ios      | 44 pt (HIG)            | 4.5:1              | 3:1 |
| android  | 48 dp (Material)       | 4.5:1              | 3:1 |
| desktop  | 24 CSS px (when DOM-backed) | 4.5:1         | 3:1 |

## Disposition summary format

The skill's final user-facing report format:

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

Rejected cases live **only** in this report — not in the YAML, not in a
sibling `rejected.yaml`.
