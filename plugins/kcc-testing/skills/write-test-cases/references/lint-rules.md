# Lint rules

Every case passes three lint passes **at generation time**, before being
written to disk. Cases that fail a hard check never land in the YAML file;
they are listed in the user-facing summary's `rejected` bucket with a reason.

## UI-change consistency (file-level)

The top-level `ui_change` flag gates all visual assertions in the file.
This check runs first because it can reject whole cases before the
finer-grained passes.

| `ui_change` | Requirement | Violation disposition |
|-------------|-------------|----------------------|
| `true`  | At least one case in the file MUST carry a non-empty `assertions.visual[]`. | **Hard reject file** — regenerate step 3 with a visual-regression case added. |
| `false` | No case in the file MAY carry `assertions.visual[]`. | **Hard reject case** — drop the visual block from the offending case and list it in the summary's `rejected` bucket. |
| missing | N/A | **Hard reject file** — `ui_change` is a required top-level field. |

See `coverage-techniques.md` §7 for the definition of what counts as a
UI change.

## Testability five-check

| Check | Reject pattern | Disposition |
|-------|----------------|-------------|
| `oracle_present` | A step without `oracle`, or oracle reads "看起来对" / "confirm it works" / "check it looks right" | **Hard reject** |
| `state_reachable` | Preconditions + earlier steps cannot reach the state a later step depends on | **Hard reject** |
| `deterministic` | Unmasked timestamps / random IDs / order-dependent list indexes in an oracle | **Warn + auto-mask**: rewrite the oracle to use `{{date}}` / `{{uuid}}` patterns or loose regex |
| `isolated` | Precondition or oracle references "the order from TC-XXX" / "leftover data from the previous run" | **Hard reject** |
| `waits_specified` | Async step with no explicit wait condition | **Warn + auto-insert** `等待 <target> 在 N 秒内出现` |

## UIUX quantification check

Apply these blacklist patterns to every `step.oracle` and every
`assertions.visual[].expected`:

```
/看起来.*(对|正常|好)/
/nicely|properly|clearly|correctly|appropriate/i
/合适的|漂亮的|明显的/
/similar to|类似|差不多/
```

On match, the skill attempts (in order):

1. Replace with a `{token: ...}` reference resolved against
   `design_tokens_source`.
2. Replace with `number + unit + tolerance`, e.g. `8px ±1px`,
   `#1E6FFF ΔE<2.3`, `100ms ±20ms`.
3. Replace with a WCAG / HIG / Material rule reference.

If none succeeds, the skill attaches `needs_quantification: TODO` to the
assertion and surfaces it in the summary's `⚠️ TODO-visual` bucket. **Silent
drop is forbidden.**

## Accessibility-floor auto-injection (not user-toggleable)

For every case where steps interact with a control, auto-append the rules
below unless the case already carries them:

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
⚠️ TODO-visual: <N>
    TC-<id>: <which visual assertion, why unresolved>
    ...
❌ rejected: <N>
    TC-<id>: <which testability check failed, short reason>
    ...
```

Rejected cases live **only** in this report — not in the YAML, not in a
sibling `rejected.yaml`.
