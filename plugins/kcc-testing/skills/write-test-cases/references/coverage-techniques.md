# Coverage techniques

Use this cheat sheet when enumerating cases from a feature. Each feature
should produce 8–15 cases across these angles; fewer if the feature is
truly trivial, never more than ~20.

## 1. Happy path
The single most likely successful end-to-end flow. Always the first case.

## 2. Equivalence partitioning
Split each input domain into classes; pick one value per class. For a
"quantity" field (1–99), classes are: invalid-low (0, -1), valid (1, 50,
99), invalid-high (100, 9999).

## 3. Boundary-value analysis
For each numeric/string-length input, test *at* the boundary and *one off*
each side. Example: min=1 → test 0, 1, 2; max=99 → test 98, 99, 100.

## 4. State transition
If the feature moves through named states (draft → review → published),
test each legal transition AND at least one illegal transition (reject
published → draft if forbidden).

## 5. Error handling
For every user-facing error path the requirement mentions (network loss,
invalid input, permission denied), write one case that triggers it and
asserts the message + that no partial state change persists.

## 6. Accessibility
At least one case per feature should exercise keyboard-only flow or
assistive-tech announcement (`role=alert` showing on error). For GUI
features this is **mandatory**, not a nice-to-have.

## 7. Visual regression — gated by `ui_change`

The top-level `ui_change` flag is the single switch that decides whether
any case in this file may carry `assertions.visual[]`.

**`ui_change: true`** — the feature introduces or modifies user-visible
rendering. Any of these counts:
- New visible element (new button, modal, screen, field, icon).
- Changed style (color, typography, spacing, radius, elevation).
- New visual state (new error / empty / loading / success surface).
- Layout restructure (reflow, alignment, responsive breakpoint, RTL).

Rule: **at least one case in the file MUST carry `assertions.visual[]`**.
Prefer `{token: ...}` + `resolved_value` when `design_tokens_source` is
non-null. If tokens are unavailable, fall back to `number + unit +
tolerance` or a WCAG / HIG / Material rule reference — but the visual
case still happens. Token absence does NOT waive the visual requirement.

**`ui_change: false`** — the feature is pure logic / data / algorithm
with no visible rendering change. A new backend validation rule that
surfaces through an existing error component does **not** count as UI
change (the component already existed).

Rule: **no case in the file may carry `assertions.visual[]`**. Writing
one is a hard-reject anti-pattern — the `ui_change` consistency lint
(see `lint-rules.md`) blocks the file from landing.

`assertions.accessibility[]` auto-injection is independent of this gate.
Any case touching an interactive control still gets the platform a11y
floor appended, regardless of `ui_change`.

## 8. Error guessing (free-form)
Senior-QA adversarial case — what would break this? Double-submit, rapid
toggling, paste with emoji, unusual unicode, RTL input. One per feature if
any plausible bet surfaces.

## Priority distribution heuristic

- Exactly one `P0` — the happy path.
- 1–3 `P1` — high-impact error / boundary cases.
- The rest `P2` — lower-likelihood paths, a11y-only checks, adversarial.

If the enumeration produces more than ~15 cases, drop the lowest-priority
`P2`s until at or under 15. Document which were dropped in the summary,
not in the file.
