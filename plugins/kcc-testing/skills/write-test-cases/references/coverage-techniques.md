# Coverage techniques

Use this cheat sheet when enumerating cases from a feature. Each feature
should produce 8–15 cases across these angles; fewer if the feature is
truly trivial, never more than ~20.

§§ 1–8 are the baseline eight. §§ 9–11 are **conditional** — they activate
only when the matching `coverage_triggers` flag is `true`. When active, the
file MUST contain at least one case tagged with that trigger's keyword;
`lint-rules.md` §"Coverage-trigger fulfilment" enforces this.

## 1. Happy path
The most likely successful end-to-end flow. Always present. For features with
genuinely parallel user roles or platforms, each role's happy path can be its
own `P0`; keep the total small (usually 1, at most 2–3) and explain the
multiplicity in the summary.

## 2. Equivalence partitioning
Split each input domain into classes; pick one value per class. For a
"quantity" field (1–99), classes are: invalid-low (0, -1), valid (1, 50,
99), invalid-high (100, 9999). For string inputs, always include the empty
string `""` and a whitespace-only `"   "` as their own classes.

## 3. Boundary-value analysis
For each numeric / string-length input, test *at* the boundary and *one off*
each side. Example: min=1 → test 0, 1, 2; max=99 → test 98, 99, 100. For
string length caps, include one case at `cap + 1` and one well above cap
(e.g. 10k characters) to catch silent truncation.

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

## 7. Visual assertions — gated by `ui_change`

> Renamed from "Visual regression" in v0.1. "Regression" implies a baseline;
> this skill does not maintain baselines. See the philosophy note at the
> end of this section.

The top-level `ui_change` flag is the single switch that decides whether
any case in this file may carry `assertions.visual[]`.

**`ui_change: true`** — the feature introduces or modifies user-visible
rendering. Any of these counts:
- New visible element (new button, modal, screen, field, icon).
- Changed style (color, typography, spacing, radius, elevation).
- New visual state (new error / empty / loading / success surface).
- Layout restructure (reflow, alignment, responsive breakpoint, RTL).

Rule: **at least one case in the file MUST carry `assertions.visual[]`**.
Every entry uses one of the two forms in `yaml-schema.md`:

- **Form A (property-based)** — `property + expected_value + match + tolerance`. Use when the claim reduces to a single computed property or layout metric.
- **Form B (description-based)** — `description + judge_by: llm-vision`. Use when the claim is composite (geometry + color + hierarchy) but the standard is **absolute** (describable without reference to a historical rendering).

**`ui_change: false`** — the feature is pure logic / data / algorithm with
no visible rendering change. A new backend validation rule that surfaces
through an existing error component does **not** count as UI change (the
component already existed).

Rule: **no case in the file may carry `assertions.visual[]`**. Writing one
is a hard-reject anti-pattern — the `ui_change` consistency lint (see
`lint-rules.md`) blocks the file from landing.

`assertions.accessibility[]` auto-injection is independent of this gate.
Any case touching an interactive control still gets the platform a11y
floor appended, regardless of `ui_change`.

### No baselines — philosophy note

Visual regression tooling (Percy, Chromatic, Applitools, reg-suit) compares
each run against a stored "golden" image and flags pixel or structural
differences. That model requires **baseline lifecycle management** — who
stores the image, who reviews the diff, when to update after intentional
redesigns, how to mask animations and subpixel noise. All of that is
deliberately out of scope for this skill.

The discipline here is **absolute verification**: every visual claim —
whether a property value or a prose description — must be decidable by
looking at **only** the current rendering plus the YAML. No "is this the
same as last month?" lookups. Relative-language phrasings ("仍然居中", "和
之前一样", "slightly tighter than before") are hard-rejected by lint
precisely because they smuggle a baseline back in.

Overall aesthetic coherence — the kind of thing that honestly does need a
designer's eye against prior work — is covered by **Form C** (explicit
out-of-scope) in `yaml-schema.md`, and belongs to human design review or a
separate visual-regression automation layer, not this skill.

## 8. Error guessing (free-form)
Senior-QA adversarial case — what would break this? Double-submit, rapid
toggling, paste with emoji, unusual unicode, RTL input. One per feature if
any plausible bet surfaces.

## 9. Security & permissions — when `coverage_triggers.security: true`

Activate when the feature:
- accepts user-controlled input that reaches the server,
- performs authentication or authorization decisions,
- renders content influenced by another user, or
- modifies resources owned by an identity.

**Required angles (at least one case each, unless the feature genuinely
doesn't expose the angle):**

| Angle | Concrete trigger to write |
|-------|---------------------------|
| **Injection** | XSS payload in a text field (`<script>` / `javascript:` / `"><img onerror>`); SQL-ish payload if the input reaches a query layer; template-injection payload if the input reaches a renderer. |
| **Unicode / encoding** | Homoglyphs, BiDi override (`\u202e`), NULL byte, overlong UTF-8, unicode-normalization bypass (`ﬁ` vs `fi`). |
| **Authz — horizontal** | User A attempts to read/modify resource owned by User B (same role, different principal). |
| **Authz — vertical** | Lower-privilege user attempts an action reserved for higher privilege. |
| **Session** | Expired token / revoked token / replay of old token / missing CSRF token where applicable. |

Each case's oracle asserts both **what did not happen** (no resource
leaked, no state mutated) **and** **what the user sees** (error copy,
status code if surfaced, no stack trace in UI).

## 10. Internationalization — when `coverage_triggers.i18n: true`

Activate when the feature renders localized content (text, dates, numbers,
currency) or accepts text input meant to be displayed back.

**Required angles:**

| Angle | Concrete trigger |
|-------|------------------|
| **Locale formatting** | Same numeric/date value in at least two locales (e.g. `zh-CN` `¥90.00` vs `de-DE` `90,00 €`). Oracle is the format rule, not the literal. |
| **Translation length** | One case in a language known to expand (German, Finnish, Russian) — verify no truncation, no layout break. |
| **RTL** | At least one case in Arabic or Hebrew if the platform supports RTL — verify mirrored layout and logical-order text. |
| **Character sets** | Full-width CJK punctuation, emoji ZWJ sequences (`👨‍👩‍👧‍👦`), combining marks — verify rendering and round-trip. |

For oracles involving formatted values: **use a format rule or regex, not
an exact literal**. `currency matches /^[¥$€][0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}$/
in en-US locale` is correct; `total equals "¥90.00"` is locale-fragile.

## 11. Performance & concurrency — when `coverage_triggers.performance: true`

Activate when the feature has a latency-visible action (form submit, list
render, search, media load) or a state that can be toggled rapidly.

**Required angles:**

| Angle | Concrete trigger |
|-------|------------------|
| **Latency floor** | Soft assertion on time-to-visible-result (e.g. `≤ 2s on 4G profile`). Fail-soft — record, don't block — unless the requirement pins a hard SLA. |
| **Cold vs warm** | First-render vs subsequent-render — the second should be faster or at least not worse. |
| **Double-submit / rapid toggle** | Click the action twice within 200 ms; verify exactly one effect and no duplicate resource. |
| **Offline → online** | Start offline, perform the action, go online; verify queued action either completes or surfaces a recoverable error. |

Performance cases have `tags: [performance]` and — if they specify a
latency target — declare it in a `targets:` block on the step, not buried
in prose.

## Priority distribution heuristic

- 1 (or up to 3) `P0` — release-blocker happy paths; each parallel user role
  / platform may own its own `P0`.
- 1–3 `P1` — high-impact error / boundary / security-authz / performance-SLA.
- The rest `P2` — lower-likelihood paths, a11y-only checks, adversarial, i18n
  variants beyond the first.

If the enumeration produces more than ~15 cases, drop the lowest-priority
`P2`s until at or under 15. Document which were dropped in the summary,
not in the file. When the file's `P0` count > 1, briefly justify each in
the summary.
