# Output schema (authoritative)

Single source of truth for `decompose-design`'s output shape.
SKILL.md references this file; tests assert against shapes
described here; downstream agents consume shapes described here.

## Shape skeleton

Every node emits **three markdown tables**, one per facet.

- `attributes` and `layout` tables: columns are `property`,
  then one per supplied label.
- `motion` table: columns are `trigger`, `property`, then one per
  supplied label (motion has a third dimension — each trigger
  carries multiple sub-properties).

```markdown
# decompose-design — <short run description>

Meta:
- artifacts: [<label>(<platform>), <label>(<platform>), ...]
- scope: <component filter or "all">
- generated-at: <ISO-8601 timestamp>

## Page: <name>

### attributes
| property | <label-A> | <label-B> | ... |
|----------|-----------|-----------|-----|
| <prop-1> | <value>   | <value>   | ... |
| <prop-2> | <value>   | —         | ... |
| <prop-3> | —         | <value>   | ... |

### layout
| property | <label-A> | <label-B> | ... |
|----------|-----------|-----------|-----|
| <prop-1> | <value>   | —         | ... |
| <prop-2> | —         | <value>   | ... |

### motion
| trigger  | property  | <label-A> | <label-B> | ... |
|----------|-----------|-----------|-----------|-----|
| <trig-1> | <prop-1>  | <value>   | —         | ... |
| <trig-1> | <prop-2>  | <value>   | —         | ... |
| <trig-2> | <prop-1>  | —         | <value>   | ... |

## Section: <name>
  ... (same three-table structure) ...

## Component: <name>
  ... (same) ...

### Element: <name>   ← only when elements carry distinct facets worth surfacing
  ... (same) ...
```

## Worked example — SubmitButton on web and iOS

```markdown
## Component: SubmitButton

### attributes
| property         | web                | ios                                  |
|------------------|--------------------|--------------------------------------|
| control-type     | button             | Button                               |
| class            | btn btn-primary    | —                                    |
| background-color | #007bff            | —                                    |
| color            | #ffffff            | —                                    |
| border           | 1px solid #007bff  | —                                    |
| border-radius    | 0.25rem            | —                                    |
| font-size        | 1rem               | —                                    |
| font-weight      | 400                | —                                    |
| padding          | 0.375rem 0.75rem   | —                                    |
| label-text       | "Submit"           | "Submit"                             |
| style            | —                  | .borderedProminent                   |
| tint             | —                  | .blue (system semantic color)        |
| label-font       | —                  | unspecified (inherits system default)|

### layout
| property         | web          | ios                |
|------------------|--------------|--------------------|
| display          | inline-block | —                  |
| width            | auto         | —                  |
| margin-top       | 16px         | —                  |
| parent-container | —            | VStack             |
| order            | —            | after SecureField  |
| frame-max-width  | —            | .infinity          |
| padding-top      | —            | 16                 |

### motion
| trigger          | property         | web                                      | ios                                                                         |
|------------------|------------------|------------------------------------------|-----------------------------------------------------------------------------|
| hover            | background-color | → #0069d9                                | —                                                                           |
| hover            | transition       | 0.15s ease-in-out                        | —                                                                           |
| active           | box-shadow       | inset 0 3px 5px rgba(0,0,0,0.125)        | —                                                                           |
| active           | timing           | unspecified                              | —                                                                           |
| focus            | outline          | 3px solid rgba(0,123,255,.5)             | —                                                                           |
| focus            | timing           | unspecified                              | —                                                                           |
| touch-down       | state-layer      | —                                        | inferred from context — .borderedProminent applies system default           |
| touch-down       | timing           | —                                        | not stated in input                                                         |
| custom-animation | —                | —                                        | unspecified in input                                                        |
```

## Detail contract

- Every facet emits one markdown table. Motion's table has an
  extra leading `trigger` column because each trigger carries
  multiple sub-properties (`target`, `duration`, `curve`,
  `delay`, `chain`, `haptic`).
- Property names come **verbatim from the input's vocabulary**.
  If `web` uses `background-color` and `ios` uses `tint`, these
  stay as **separate rows**. Never collapse them into a single
  "color" row — that would be judgement (deciding that these
  two property names play the same role).
- Depth matches input specificity:
  - Rich input (code, markup with explicit values) → every
    relevant property appears as a row with a concrete value.
  - Vague input (prose) → the row still appears, and the value
    cell reads `unspecified` or `inferred from context`.
- **Never invent values.** If the input doesn't carry a value,
  the cell reads `unspecified` (or `inferred from context — ...`
  when adjacent evidence legitimately supports the inference,
  with the inference source named).
- Silence on a property for a label: cell reads `—`.
- Silence on an entire facet for a label: the column still
  exists, but every row's cell for that label reads `—`.
- When only one artifact is supplied (N=1), the table still
  renders — one `property` column plus one label column.
  Motion's table still has the `trigger` column.

### Prohibitions

- **Never invent values.** If input doesn't say `color: #007bff`,
  the cell doesn't say `color: #007bff`. Unknowns are surfaced,
  not hidden.
- **No classification tokens.** Never emit `platform-constraint`,
  `idiom`, `unchanged`, `classification:`, or equivalents — not
  as rows, not as columns, not as cell text.
- **No remediation / recommendation.** Never emit `## TODO`,
  `## Summary`, `## Findings`, `## Gaps`, `## Recommend`,
  handoff instructions, or phrases like "should change" /
  "must change" / "recommend".
- **No code fences.** No triple-backtick code blocks for target
  languages (swift / tsx / kotlin etc.). This skill does not
  emit code.
- **No cross-label property collapsing.** If two labels use
  different property names, they are different rows. Period.

### Ordering conventions

- **Label column order** — matches the order artifacts were
  supplied in the invocation.
- **Property row order** within a facet — properties the first
  label carries appear first (in the order that label lists
  them), then properties unique to subsequent labels. This keeps
  output deterministic across runs with the same inputs and
  makes diffing across runs tractable.
- **Node order** — follows the input structure (top-to-bottom for
  a code file, page reading order for prose). Not alphabetized.
