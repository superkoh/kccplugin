---
description: >
  Decompose one or more UI artifacts (web / iOS / Android — code,
  HTML, SwiftUI, Jetpack Compose, or prose description) into a
  uniform hierarchical tree (Page → Section → Component → Element)
  and for every node report what each supplied artifact says per
  facet (attributes / layout / motion) with nested property-value
  detail. Reports facts only — no classification of differences,
  no recommendations, no TODO, no code generation. Caller decides
  how to interpret the tree (sync design system, translate feature
  across platforms, audit implementation alignment, etc.). Accepts
  1..N labeled inputs — works as pure decomposition for a single
  input or as N-way comparison for multiple. Does not assume any
  file path; does not write files unless the caller passes an
  explicit write target. Trigger phrases (EN) — decompose / break
  down / analyze / structure this UI, compare these platforms,
  diff these designs, N-way component compare, audit / sync /
  translate design (this skill is the neutral structural pass).
  Trigger phrases (中文) — 拆解设计, 跨端对比, 结构拆解, 设计分解,
  UI 拆解, 跨平台组件对比, 设计审计, 设计同步, 跨端翻译.
---

# decompose-design

Neutral cross-platform UI decomposer. Takes 1..N labeled UI
artifacts and emits a uniform tree: per node, per facet
(attributes / layout / motion), one nested bullet per label
carrying `property: value` pairs straight from the input.

**Reports facts. Never classifies, recommends, or invents values.**

## Scope

**This skill does:**

- Walks inputs through a fixed 4-level decomposition:
  Page → Section → Component → Element.
- Extracts `attributes`, `layout`, and `motion` facets at every
  node.
- Merges N supplied artifacts by matching node names / roles.
- Emits a uniform, detailed, nested-property tree.

**This skill does NOT:**

- Classify differences — no `platform-constraint` / `idiom` /
  `unchanged` / equivalent tokens. Classification is the caller's
  job.
- Recommend fixes, write TODOs, suggest remediation, or produce
  handoff instructions.
- Infer content the caller didn't supply. If a label is silent on
  a facet, the bullet reads `<label>: —`.
- Generate code. Callers needing code should use a
  code-generation skill or hand off to engineers.
- Rewrite user files. Default output is the skill's final message;
  files are written only when the caller passes an explicit
  `writeTo` path.
- Assume any hardcoded path, filename, or directory convention.

## When to use

Trigger phrases:

- **EN**: break down / decompose / analyze / structure this UI;
  compare these platforms; diff these designs; N-way component
  compare; audit / sync / translate design (the caller handles
  interpretation — this skill is the neutral structural pass).
- **中文**: 拆解设计 / 跨端对比 / 跨端翻译 / 设计审计 / 设计同步 /
  结构拆解.

### When NOT to use

- Generating code or frontend mockups — use a
  code-generation skill instead.
- Forward design of a new feature — use a feature-planning
  / spec-authoring workflow instead.
- Interpreting differences, writing fix-it lists, recommending
  next steps — that is the caller's job after reading this
  skill's output.

## Inputs

Invocation contract (extract from the user's request; ask once
via `AskUserQuestion` if required fields are missing or
ambiguous — do not guess):

- `artifacts` — ordered list, N ≥ 1. Each entry:
  - `label` — short identifier unique within the run
    (e.g. `ds`, `ios-impl`, `web-impl`, `source`, `target`).
  - `platform` — `web` | `ios` | `android`.
  - `source` — inline code / HTML / SwiftUI / Compose / prose, or
    a path the caller has read and passed in as text.
- `componentScope` (optional) — filter string, e.g.
  "login form only", "primary buttons across platforms".
  Default: everything.
- `writeTo` (optional, absolute path) — if present, the skill
  writes the final tree to that path. If absent, the tree appears
  only in the skill's final message.

**No default output path. No default filename. Ever.**

## Decomposition schema (inline compact)

Four levels, three facets per node.

| Level | Meaning |
|-------|---------|
| **Page** | A screen / route / top-level view. |
| **Section** | A grouped region within a page (header, main, aside, form, feed, etc.). |
| **Component** | A named, self-contained UI unit (Button, Card, TabBar, List). |
| **Element** | A leaf primitive carrying its own facets worth surfacing (icon, chevron, disclosure indicator). Surface only when non-trivial. |

Every node carries these three facets:

- **`attributes`** — static visual properties: identity, color,
  typography, shape (border / radius / shadow / opacity),
  local padding, content, state-variant inline attrs.
- **`layout`** — positional / containment: placement, dimensions,
  container params, alignment, external margin, adaptive rules,
  safe-area handling.
- **`motion`** — interaction and animation: per trigger, the
  target property, duration, curve, delay, chain, haptic.

Full field vocabulary per facet — see
[`references/decomposition-schema.md`](references/decomposition-schema.md).

## Output schema (inline compact)

Authoritative spec: [`references/output-schema.md`](references/output-schema.md).

Every node emits **three markdown tables**, one per facet.
Columns: `property` (the field name as it appears in the input),
then one column per supplied label. Rows: one per distinct
property surfaced across any label. Cells: the value that label
carries, or `—` if that label is silent on this property.

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
| <trig-1> | <prop-2> | <value>   | —         | ... |
| <trig-2> | <prop-1> | —         | <value>   | ... |

## Section: <name>
  ... (same three-table structure) ...

## Component: <name>
  ... (same) ...

### Element: <name>   ← only when non-trivial
  ... (same) ...
```

**Detail contract.**

- Every facet emits one markdown table. Motion's table has an
  extra leading `trigger` column because each trigger carries
  multiple sub-properties (`target`, `duration`, `curve`,
  `delay`, `chain`, `haptic`).
- Property names come **verbatim from the input's vocabulary**.
  If `web` uses `background-color` and `ios` uses `tint`, these
  stay as **separate rows** — never collapsed into a single
  "color" row (that would be judgement).
- Depth matches input specificity: rich input → concrete cell
  values; vague input → cell reads `unspecified` or
  `inferred from context`. **Never invent values.**
- Silence on a property for a label: cell reads `—`.
- Silence on an entire facet for a label: the column still
  exists but every row's cell for that label reads `—`.
- When only one artifact is supplied (N=1), the table still
  renders — one `property` column plus one label column.

## Platform vocabulary

Used to name primitives when parsing inputs. Carries no idiom
rules, no constraint rules — judgement lives in the caller.

See [`references/platform-vocabulary.md`](references/platform-vocabulary.md).

## Node-matching rules (when N ≥ 2)

1. Normalize node names: case-insensitive; `kebab-case`,
   `camelCase`, `PascalCase`, `snake_case` all collapse to the
   same canonical form. `submitButton`, `submit-button`,
   `SubmitButton`, `submit_button` all match.
2. Match by normalized name first; fall back to role (`Button`,
   `TextField`, `List`, `NavigationBar`, etc.).
3. Unmatched nodes surface as single-label entries — never forced
   into a sibling match.
4. Never infer an equivalent node on a label that doesn't have
   one.

## Self-check before returning

Every one of these must hold, or fix before emitting:

- Tree has `## Page`, `## Section`, `## Component` level-2
  headers as appropriate to the input (at least one — a
  decomposition without any component-level node is almost
  always wrong).
- Every node has `### attributes`, `### layout`, `### motion`
  sub-headers, each followed by its **markdown table**.
- Each table has a valid header row (`| property | <label> | ... |`),
  a separator row (`|---|---|...|`), and at least one data row.
  Motion tables have an extra leading `trigger` column.
- Property names appear verbatim from the input — no collapsing
  across labels (`background-color` and `tint` stay as separate
  rows).
- Concrete values come straight from the input. Unknowns read
  `unspecified` or `inferred from context` — never invented.
- Label silence on a property: cell reads `—`. Not blank, not
  missing.
- No classification tokens (`platform-constraint`, `idiom`,
  `unchanged`, `classification:`, etc.) appear anywhere.
- No `## TODO`, `## Summary`, `## Findings`, `## Gaps`,
  `## Recommend` sections.
- No code fences (triple-backtick fenced code blocks for any
  target language like swift / tsx / kotlin) — this skill does
  not emit code.
- If `writeTo` was passed, the file was written there; otherwise
  the tree lives only in the final message.
