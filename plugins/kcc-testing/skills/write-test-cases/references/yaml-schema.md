# YAML schema — `write-test-cases` v0.1

Every case file is one YAML document, one feature. Top-level metadata, then a
`cases:` array.

## Top-level keys

| Key | Required | Type | Notes |
|-----|----------|------|-------|
| `feature` | yes | string | Human name of the feature under test. |
| `requirement_ref` | no | string | Link / citation to PRD or ticket. |
| `platform` | yes | enum | `web`, `ios`, `android`, `desktop`. |
| `design_tokens_source` | yes | string \| null | Path to a token file, or `null`. |
| `ui_change` | yes | boolean | `true` if the feature introduces or modifies user-visible rendering; `false` for pure logic / data changes. Gates whether any case may carry `assertions.visual[]`. |
| `generated_at` | yes | string (ISO date) | Date the file was generated. |
| `generated_by` | yes | string | Must start with `kcc-testing/write-test-cases`. |
| `cases` | yes | array | One entry per case. Order = intended execution order. |

## Case fields

| Key | Required | Type | Notes |
|-----|----------|------|-------|
| `id` | yes | string | `TC-<AREA>-<NNN>`, unique within the file. |
| `title` | yes | string | Short, imperative, human-readable. |
| `priority` | yes | enum | `P0` (release blocker) / `P1` (major) / `P2` (minor). |
| `tags` | no | array of strings | Free-form category tags. |
| `preconditions.state` | yes | string | Prose description of the product state before step 1. |
| `preconditions.data_setup` | yes | array of strings | Each line is one imperative setup action. Empty array is allowed. |
| `steps` | yes | array | Ordered, ≥1. Each step must have `action` and `oracle`. |
| `steps[].n` | yes | integer | 1-based step number. |
| `steps[].action` | yes | string | Imperative; quote literal inputs with `"..."`. |
| `steps[].oracle` | yes | string | **Exactly one** verifiable expected result. |
| `assertions.visual` | no | array | Each entry: `target`, `property`, `expected`, `resolved_value`, `tolerance`. |
| `assertions.accessibility` | no | array | Each entry: `rule`, `target`, plus rule-specific fields. |
| `cleanup` | yes | array of strings | Idempotent cleanup actions. |
| `testability` | yes | object | Audit trail; see below. |

## Locator syntax per platform

The `target` string is platform-specific; always quote literal strings.
See `platform-locators.md` for the full vocabulary.

## Token references

Visual `expected` values using `{token: path.to.token}` MUST also carry a
`resolved_value` field with the concrete value at generation time. Both
survive in the file so the executor can verify *and* the author can audit.

## `testability` audit trail

```yaml
testability:
  oracle_present: true       # every step has an oracle
  state_reachable: true      # preconditions + prior steps can reach each state
  deterministic: true        # no unmasked timestamps/randomness in oracles
  isolated: true             # no reliance on other cases' leftovers
  waits_specified: "step 3 waits up to 5s for home_title"  # or "n/a"
```

All five fields are required. This is audit trail for cases that **passed**
the skill's lint. Cases that failed lint never land in a YAML file.
