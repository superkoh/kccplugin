# Decomposition schema

The 4-level tree and per-facet field vocabulary used by
`decompose-design`.

## Levels

1. **Page** — a screen / route / top-level view.
2. **Section** — a grouped region within a page (header, main,
   aside, form, feed, etc.).
3. **Component** — a named, self-contained UI unit (`Button`,
   `Card`, `TabBar`, `List`).
4. **Element** — a leaf primitive (icon, chevron, disclosure
   indicator). Surface only when the element carries distinct
   facets worth surfacing separately from its parent component.

Below the element level, surfacing individual pixels /
characters is out of scope for v0.1.

## Facets and field vocabularies

Every node carries three facets: `attributes`, `layout`,
`motion`. Each facet has a vocabulary of fields the skill pulls
from input — **not a required-fields checklist**. Report what
the input specifies; mark the rest `unspecified` or
`inferred from context`.

### `attributes` — static visual properties

| group | fields |
|-------|--------|
| identity | `tag` / `control-type`, `class`, `id`, `role`, `accessibility-label` |
| color | `background-color`, `color` / `text-color`, `border-color`, `tint` |
| typography | `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `text-align` |
| shape | `border-width`, `border-style`, `border-radius`, `shadow`, `opacity` |
| local spacing | `padding-top`, `padding-right`, `padding-bottom`, `padding-left` (spacing that belongs to the component itself, not to its parent's layout) |
| content | `text`, `placeholder`, `icon` / `image` reference |
| inline state variants | `disabled`, `selected`, `pressed`, `focused` visual attrs declared alongside the base style |

### `layout` — positional / containment properties

| group | fields |
|-------|--------|
| placement | `parent-container` (`VStack`, `HStack`, `Row`, `Column`, `flex`, `grid`, `absolute`, ...), `order` / `index` within parent |
| dimensions | `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio` |
| container params | stack `spacing`, `flex-grow`, `flex-shrink`, `flex-basis`, `grid-template`, `gap` |
| alignment | `align-self`, `justify-self`, cross-axis alignment |
| external spacing | `margin-top`, `margin-right`, `margin-bottom`, `margin-left` (spacing between this node and siblings) |
| adaptive | responsive breakpoints, orientation rules, size-class handling |
| safe-area / insets | `safe-area-top`, `safe-area-bottom`, `safe-area-leading`, `safe-area-trailing`, keyboard-avoidance |

### `motion` — interaction and animation definitions

For each trigger the input declares, the definition carries:

- `target` — which property changes (color, transform, opacity,
  position, ...).
- `duration` — numeric with unit (`ms`, `s`).
- `curve` — easing function or spring parameters.
- `delay` — if any.
- `chain` / `sequence` — what follows this animation.
- `haptic` — feedback type (`light`, `medium`, `heavy`, custom),
  if applicable.

Typical triggers per platform:

- **Web**: `hover`, `active`, `focus`, `visited`, `checked`,
  `disabled`, custom JS-triggered animations.
- **iOS**: `touch-down`, `press`, `long-press`, `swipe`, state
  changes via `.animation()`, transitions via `.transition()`.
- **Android**: `pressed`, `focused`, `selected`, state-list
  animations, shared-element transitions, Material Motion.

## Worked example — LoginScreen

Same login screen decomposed on web and iOS (abbreviated; see
`output-schema.md` for the full nested SubmitButton detail).

```markdown
## Page: LoginScreen
### attributes
  - web:
    - tag: body
    - background-color: #f5f5f7
    - font-family: system-ui
  - ios:
    - view-type: NavigationStack
    - background: .background (system)

### layout
  - web:
    - main-container: flex column, align-items: center
    - max-width: 420px
    - margin: 0 auto
  - ios:
    - root-container: VStack(spacing: 16)
    - safe-area: respected (default)

### motion
  - web:
    - page-enter: unspecified
  - ios:
    - page-enter: inferred from context — NavigationStack applies a default push transition; timing not stated in input

## Section: CredentialForm
  ... (email input, password input, submit button as children) ...

## Component: SubmitButton
  ... (see output-schema.md worked example for full nested detail) ...
```
