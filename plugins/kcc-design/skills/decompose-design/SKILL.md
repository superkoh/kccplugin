---
description: >
  Decompose one or more UI artifacts (web / iOS / Android — code, HTML,
  SwiftUI, Jetpack Compose, or prose) into a uniform tree
  (Page → Section → Component → Element) and per node report what each
  supplied artifact says per facet (attributes / layout / motion) with
  nested property-value detail. Facts only — no classification, no
  recommendations, no TODO, no code generation. Caller interprets.
  Accepts 1..N labeled inputs (single-input decomposition or N-way
  comparison). Doesn't assume any file path; writes files only when the
  caller passes an explicit write target. Trigger phrases (EN) —
  decompose / break down / analyze / structure this UI; compare these
  platforms; diff these designs; N-way component compare; audit / sync
  / translate design. Trigger phrases (中文) — 拆解设计, 跨端对比,
  结构拆解, 设计分解, UI 拆解, 跨平台组件对比, 设计审计, 设计同步, 跨端翻译.
---

# decompose-design

Neutral cross-platform UI decomposer. Takes 1..N labeled UI artifacts
and emits a uniform tree: per node, per facet (attributes / layout /
motion), one nested bullet per label carrying `property: value` pairs
straight from the input.

**Reports facts. Never classifies, recommends, or invents values.**

## Scope

Walks inputs through a fixed 4-level decomposition (Page → Section →
Component → Element), extracts `attributes` / `layout` / `motion`
facets at every node, merges N artifacts by matching node names /
roles, and emits a uniform nested-property tree.

Out of scope: classification (no `platform-constraint` / `idiom` /
`unchanged` tokens — that's the caller's job); recommendations / TODO /
remediation; inferring content the caller didn't supply (silent facets
render `<label>: —`); code generation; rewriting user files (default
output is the skill's final message, files written only when caller
passes an explicit `writeTo` path); hardcoded paths or filenames.

## When to use

- **EN**: break down / decompose / analyze / structure this UI;
  compare these platforms; diff these designs; N-way component
  compare; audit / sync / translate design.
- **中文**: 拆解设计 / 跨端对比 / 跨端翻译 / 设计审计 / 设计同步 /
  结构拆解.

### When NOT to use

- Generating code or frontend mockups — use a code-generation skill.
- Forward design of a new feature — use a feature-planning / spec
  workflow.
- Interpreting differences or writing fix-it lists — caller's job after
  reading this skill's output.

## Inputs

Extract from the user's request; ask once via `AskUserQuestion` if
required fields are missing or ambiguous — don't guess:

- `artifacts` — ordered list, N ≥ 1. Each entry:
  - `label` — short identifier unique within the run (e.g. `ds`,
    `ios-impl`, `web-impl`, `source`, `target`).
  - `platform` — `web` | `ios` | `android`.
  - `source` — inline code / HTML / SwiftUI / Compose / prose, or a
    path the caller has read and passed in as text.
- `componentScope` (optional) — filter string ("login form only",
  "primary buttons across platforms"). Default: everything.
- `writeTo` (optional, absolute path) — if present, the skill writes
  the final tree there. If absent, the tree appears only in the
  skill's final message.

**No default output path. No default filename. Ever.**

## Decomposition schema

| Level | Meaning |
|-------|---------|
| **Page** | A screen / route / top-level view. |
| **Section** | A grouped region within a page (header, main, aside, form, feed). |
| **Component** | A named, self-contained UI unit (Button, Card, TabBar, List). |
| **Element** | A leaf primitive carrying its own facets worth surfacing (icon, chevron, disclosure indicator). Surface only when non-trivial. |

Three facets per node:

- **`attributes`** — static visual: identity, color, typography, shape
  (border / radius / shadow / opacity), local padding, content,
  state-variant inline attrs.
- **`layout`** — positional / containment: placement, dimensions,
  container params, alignment, external margin, adaptive rules,
  safe-area handling.
- **`motion`** — interaction and animation: per trigger, the target
  property, duration, curve, delay, chain, haptic.

Full field vocabulary per facet: [`references/decomposition-schema.md`](references/decomposition-schema.md).

## Output schema

Authoritative spec: [`references/output-schema.md`](references/output-schema.md).

Every node emits **three markdown tables**, one per facet. Columns:
`property` (the field name verbatim from the input), then one column
per supplied label. Rows: one per distinct property surfaced across any
label. Cells: the value that label carries, or `—` if silent.

```markdown
# decompose-design — <short run description>

Meta:
- artifacts: [<label>(<platform>), ...]
- scope: <filter or "all">
- generated-at: <ISO-8601>

## Page: <name>

### attributes
| property | <label-A> | <label-B> | ... |
|----------|-----------|-----------|-----|
| <prop-1> | <value>   | <value>   | ... |
| <prop-2> | <value>   | —         | ... |

### layout
| property | <label-A> | <label-B> | ... |
|----------|-----------|-----------|-----|
| <prop-1> | <value>   | —         | ... |

### motion
| trigger  | property | <label-A> | <label-B> | ... |
|----------|----------|-----------|-----------|-----|
| <trig-1> | <prop-1> | <value>   | —         | ... |
| <trig-2> | <prop-1> | —         | <value>   | ... |

## Section: <name>
  ... (same three-table structure) ...

## Component: <name>
  ... (same) ...

### Element: <name>   ← only when non-trivial
  ... (same) ...
```

Detail contract:

- Motion's table has an extra leading `trigger` column because each
  trigger carries multiple sub-properties (`target`, `duration`,
  `curve`, `delay`, `chain`, `haptic`).
- Property names are **verbatim from the input vocabulary**. If `web`
  uses `background-color` and `ios` uses `tint`, they stay as
  **separate rows** — collapsing them into a single "color" row is
  judgement.
- Depth matches input specificity: rich input → concrete cell values;
  vague input → cell reads `unspecified` or `inferred from context`.
  Never invent values.
- Silence on a property for a label: cell reads `—`. Silence on an
  entire facet: column still exists, every row's cell reads `—`.
- When only one artifact is supplied (N=1), the table still renders —
  one `property` column plus one label column.

## Platform vocabulary

Used to name primitives when parsing inputs. Carries no idiom rules,
no constraint rules — judgement lives in the caller.

See [`references/platform-vocabulary.md`](references/platform-vocabulary.md).

## Node-matching rules (when N ≥ 2)

1. Normalize node names: case-insensitive; `kebab-case`, `camelCase`,
   `PascalCase`, `snake_case` all collapse to the same canonical form.
   `submitButton`, `submit-button`, `SubmitButton`, `submit_button` all
   match.
2. Match by normalized name first; fall back to role (`Button`,
   `TextField`, `List`, `NavigationBar`).
3. Unmatched nodes surface as single-label entries — never force a
   sibling match.
4. Don't infer an equivalent node on a label that doesn't have one.

## Self-check before returning

- Tree has `## Page`, `## Section`, `## Component` level-2 headers as
  appropriate to the input (at least one — a decomposition without any
  component-level node is almost always wrong).
- Every node has `### attributes`, `### layout`, `### motion`
  sub-headers, each followed by its **markdown table** with a valid
  header row (`| property | <label> | ... |`), separator row
  (`|---|---|...|`), and at least one data row. Motion tables have an
  extra leading `trigger` column.
- No classification tokens (`platform-constraint`, `idiom`,
  `unchanged`, `classification:`, etc.) appear anywhere.
- No `## TODO`, `## Summary`, `## Findings`, `## Gaps`, `## Recommend`
  sections.
- No code fences (no triple-backtick fenced blocks for swift / tsx /
  kotlin / any target language) — this skill doesn't emit code.
- If `writeTo` was passed, the file was written there; otherwise the
  tree lives only in the final message.
