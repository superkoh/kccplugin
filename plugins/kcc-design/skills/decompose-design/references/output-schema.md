# Output schema (authoritative)

Single source of truth for `decompose-design`'s output shape.
SKILL.md references this file; tests assert against shapes
described here; downstream agents consume shapes described here.

## Shape skeleton

```markdown
# decompose-design — <short run description>

Meta:
- artifacts: [<label>(<platform>), <label>(<platform>), ...]
- scope: <component filter or "all">
- generated-at: <ISO-8601 timestamp>

## Page: <name>
### attributes
  - <label-1>:
    - <property>: <value>
    - <property>: <value>
  - <label-2>:
    - <property>: <value>
    - <property>: <value>

### layout
  - <label-1>:
    - <property>: <value>
  - <label-2>:
    - <property>: <value>

### motion
  - <label-1>:
    - <trigger>: <definition>
  - <label-2>:
    - <trigger>: <definition>

## Section: <name>
  ... (same per-facet structure) ...

## Component: <name>
  ... (same) ...

### Element: <name>   ← only when elements carry distinct facets worth surfacing
  ... (same) ...
```

## Worked example — SubmitButton on web and iOS

```markdown
## Component: SubmitButton

### attributes
  - web:
    - tag: button
    - class: btn btn-primary
    - background-color: #007bff
    - color: #ffffff
    - border: 1px solid #007bff
    - border-radius: 0.25rem
    - font-size: 1rem
    - font-weight: 400
    - padding: 0.375rem 0.75rem
    - label-text: "Submit"
  - ios:
    - control-type: Button
    - style: .borderedProminent
    - tint: .blue (system semantic color)
    - label-text: "Submit"
    - label-font: unspecified (inherits system default)

### layout
  - web:
    - display: inline-block
    - width: auto
    - margin-top: 16px
  - ios:
    - parent-container: VStack
    - order: after SecureField
    - frame-max-width: .infinity
    - padding-top: 16

### motion
  - web:
    - hover: background-color → #0069d9; transition 0.15s ease-in-out
    - active: box-shadow inset 0 3px 5px rgba(0,0,0,0.125); timing unspecified
    - focus: outline 3px solid rgba(0,123,255,.5); timing unspecified
  - ios:
    - touch-down: inferred from context — .borderedProminent applies system default state-layer behavior; timing not stated in input
    - custom-animation: unspecified in input
```

## Detail contract

- Each label's bullet **expands into nested `property: value`
  sub-bullets**, not a single-line summary.
- `attributes` carry concrete visual property values: colors,
  typography, border, radius, shadow, opacity, padding, text
  content, iconography.
- `layout` carries placement, dimensions, container / stack /
  flex / grid parameters, spacing, alignment, safe-area handling.
- `motion` carries full trigger definitions: target property,
  duration, curve, delay, chain or sequencing, haptics where
  applicable.

### Depth matches input specificity

- Rich input (code, markup with explicit values) → rich output
  with concrete values.
- Vague input (prose, "a blue button") → output still enumerates
  the property vocabulary for the facet; values the input doesn't
  carry get marked `unspecified` or `inferred from context`.
- The property list appears either way; what varies is whether
  the values are concrete or marked as missing.

### Prohibitions

- **Never invent values.** If the input doesn't say
  `color: #007bff`, the output does not write `color: #007bff`.
  Unknowns are surfaced, not hidden.
- **No classification tokens.** Never emit `platform-constraint`,
  `idiom`, `unchanged`, `classification:`, or equivalents.
- **No remediation / recommendation.** Never emit `## TODO`,
  `## Summary`, `## Findings`, `## Gaps`, `## Recommend`, handoff
  instructions, or phrases like "should change" / "must change" /
  "recommend".
- **No code fences.** No ` ```swift `, ` ```tsx `, ` ```kotlin `
  in output. This skill does not emit code.

### Silence

- A whole facet being silent for a label is still explicit:
  `<label>: —`. Never implicit.
- A property mentioned in the vocabulary but missing from a
  label's input reads `<property>: unspecified` (or
  `inferred from context` if the skill inferred it from adjacent
  evidence and wants to mark that inference).
