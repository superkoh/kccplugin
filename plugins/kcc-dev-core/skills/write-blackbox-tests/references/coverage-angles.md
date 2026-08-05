# Coverage angles

Work the catalog top to bottom when enumerating cases. §1 always
produces cases; every other angle has an **applicability test** — when
it matches the feature it must produce at least one case, and when it
doesn't, skip it without comment. A typical feature yields 8–15 cases;
past ~20, trim the lowest-priority P2s — but never below SKILL.md
step 5's coverage floor (`#FR + #NFR + #edge-cases`). When the floor
itself exceeds ~20, keep every case and say so in the report instead
of trimming. Report whatever was dropped.

Angles map onto the output groups: §1 → `## Main Flow`; cases whose
oracle is an NFR-pinned threshold (§9 and kin) → `## Non-functional`;
everything else → `## Corner Cases`.

## 1. Main flow (always)

The most likely successful end-to-end journey, driven exactly as a real
user or client would. Always `P0`. Genuinely parallel roles or
platforms may each own a `P0`; keep the total small (1–3) and justify
multiplicity in the report.

## 2. Equivalence & boundary

Applies when: any input domain exists.
Split each input into classes and pick one value per class; test *at*
each boundary and one off each side (min=1 → 0, 1, 2). Strings get the
empty string `""`, whitespace-only, at-cap, cap+1, and far-above-cap
(silent truncation) classes.

## 3. State transitions

Applies when: the feature moves through named states
(draft → review → published).
Cover each legal transition and at least one forbidden one — assert the
rejection AND that the state did not change.

## 4. Error handling

Applies when: the requirements mention any failure path (invalid input,
permission denied, dependency down, network loss).
One case per mentioned path: trigger it from outside, assert the
user-visible error AND that no partial state change persists.

## 5. Idempotency & retry

Applies when: any action mutates state.
Submit the same action twice; replay it after a timeout; assert exactly
one effect and no duplicate resource.

## 6. Concurrency & races

Applies when: two actors (or two sessions of one actor) can touch the
same resource, or a state can be toggled rapidly.
Drive the race from outside — parallel requests, double-click within
~200 ms, rapid toggle — and assert **invariants**: exactly one winner,
no lost update, no dirty read, consistent final state. Never assert
timing or ordering; that is flakiness, not coverage.

## 7. Security & permissions

Applies when: input reaches the server, the feature makes auth
decisions, renders content from other users, or mutates owned
resources.
Sub-angles (≥ 1 case each where the feature exposes it):

- **Injection** — XSS / SQL-ish / template payloads through public inputs.
- **Unicode & encoding** — homoglyphs, BiDi override (`‮`), NULL
  byte, normalization bypass.
- **Authz, horizontal** — user A reaches user B's resource (same role).
- **Authz, vertical** — lower privilege attempts a higher-privilege action.
- **Session** — expired / revoked / replayed token.

Each oracle asserts both what did **not** happen (no leak, no mutation)
and what the user sees (error copy, no stack trace).

## 8. Internationalization

Applies when: the feature renders localized text / dates / currency, or
displays user text back.
Locale-format oracles use format rules or regexes, never exact literals
(`"¥90.00"` is locale-fragile). Add expansion-language length, RTL, and
CJK / emoji round-trip cases where the platform supports them.

## 9. Performance

Applies when: an NFR pins a latency / throughput number, or the feature
has a latency-visible action.
Thresholds come from the spec's NFR — never invented; a performance
case without a spec number goes to Pending (SKILL.md step 4 rules).
The **Then** asserts the NFR's number as a hard pass/fail bound — the
oracle stays decidable. Add cold-vs-warm and under-load variants where
the NFR distinguishes them.

## 10. Accessibility

Applies when: the surface is a UI.
At least one keyboard-only (or assistive-announcement) traversal of the
main flow.

## 11. Error guessing

Always worth one adversarial bet if any plausible one surfaces: what
would a hostile or clumsy user try first? Paste with emoji, back button
mid-flow, stale tab after re-login, submit from a second window.

## Priority distribution

- `P0` — release-blocker main flows only (≤ 3, usually 1).
- `P1` — high-impact corner / security-authz / race / SLA cases (1–3).
- `P2` — the rest.
