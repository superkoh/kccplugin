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

## 7. Visual regression
For features with new UI, at least one case should carry `assertions.visual`
tied to design tokens.

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
