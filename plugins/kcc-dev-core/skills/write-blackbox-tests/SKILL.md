---
description: Use when the user asks to 写黑盒测试 / 写黑盒用例 / 把 spec 转成黑盒用例 / 写验收标准 / 出 AC / write black-box test cases / cover this spec with black-box tests / write acceptance criteria. Before any implementation exists, turns the requirements in the current context into a single blackbox.md of implementation-independent test cases — grouped Main Flow / Corner Cases / Non-functional, each traced to a requirement, tagged automated or llm-driven, and verifiable purely from outside the system. Case definitions only — generating runnable test code (写黑盒测试代码) is kcc-dev-core:materialize-blackbox-tests, not this skill. Standalone capability — no workflow, no orchestration, no team.
---

# Writing black-box test cases

Produces **one** `blackbox.md` of black-box test cases, written **before
any implementation exists**, that doubles as the task's Definition of
Done: implementation is complete when every case passes. Reads whatever
requirements are available in the session — preferring an existing
`spec.md`, otherwise deriving from the feature description.
Self-contained: read → confirm scope → write → self-check → gap sweep.

Output path: `<project-root>/.kcc/specs/<feature-slug>/blackbox.md`. If a
`spec.md` already lives in `.kcc/specs/<feature-slug>/`, write
`blackbox.md` beside it and reuse that slug. When inventing a new slug,
follow `write-spec`'s rule: ASCII-only kebab-case, max 64 chars.

## The black-box contract

Every case must satisfy all of these — they are what "black-box" means:

- **Written before implementation, from requirements only.** Never read
  an implementation — not the one that doesn't exist yet, and not the
  existing product being modified either.
- **Zero dependency on implementation.** Cases — and any test code later
  generated from them — live entirely outside the system and touch only
  its contracted external surfaces (API endpoints, UI flows, CLI).
- **Setup and cleanup are external too.** Data preparation goes through
  public surfaces, not direct DB writes. If a case genuinely cannot be
  prepared externally, mark it `[EXTERNAL-SETUP: blocked — <reason>]` on
  its `Traces to:` line and flag it in the report — don't silently open
  a backdoor.
- **Decidable from requirements alone.** Each **Then** is an observable,
  pass/fail-decidable outcome stated in requirement language. "Works
  correctly" is not an outcome; neither is anything relative to a prior
  state of the product ("same as before").
- **No invented interfaces.** A case binds only to a surface the spec
  pins down. An unpinned surface sends the case to `## Pending cases`
  and flags the gap back to the spec — never guess an endpoint or
  screen into existence.
- **Red-first.** All cases start red (or unrunnable). That is the
  normal, expected state before implementation, not a defect. The one
  exception: cases that pin unchanged existing behavior, annotated
  `[PRE-IMPL: green — existing behavior]`.

## When to use

Trigger phrases: 写黑盒测试 / 写黑盒用例 / 把 spec 转成黑盒用例 /
写验收标准 / 出 AC / write black-box test cases / cover this spec with
black-box tests / write acceptance criteria.

### When NOT to use

- Writing the spec itself → `kcc-dev-core:write-spec`.
- Unit tests or any white-box tests — those are written during
  implementation, against code → `kcc-dev-core:write-unit-tests`.
- Materializing `Mode: automated` cases into runnable test code →
  `kcc-dev-core:materialize-blackbox-tests`, after the cases here have
  been reviewed.

## Process

### 1. Locate the requirement source

In order of preference:
1. An existing `.kcc/specs/<slug>/spec.md` — authoritative source of
   `FR-NN` / `US-NN` / `NFR-NN` and edge-case entries. Read it in full.
2. A spec / PRD file referenced in the conversation.
3. The feature description in the last ~20 turns.

If only a loose description exists (no numbered requirements), enumerate
the implicit requirements yourself before writing cases, and say so when
reporting.

While reading, inventory the **contracted external surfaces**
(endpoints, screens, commands) and note every requirement whose surface
is still unpinned.

### 2. Confirm scope with `AskUserQuestion` — only if genuinely ambiguous

Confirm which feature / spec you're writing cases for (your detected
source as the recommended option), and surface any assumption — scope
or surface — that materially changes coverage. If the context already
pins these down, don't manufacture a question — state your reading in
one line and proceed.

### 3. Enumerate cases

Work through the angle catalog in
[`references/coverage-angles.md`](references/coverage-angles.md): main
flow first, then every angle whose applicability test matches the
feature. Business-scenario pitfalls — idempotency, concurrency and
races, partial failure — deserve particular suspicion; they are the
bugs black-box-first exists to catch.

### 4. Write blackbox.md

```markdown
# Black-box Test Cases — <feature-name>

## Main Flow

### BB-M01: <short title>
- Traces to: FR-03, US-02
- Priority: P0
- Mode: automated
- Surface: `POST /orders` (spec §System Design)
- **Given** <world state, prepared via external surfaces>
- **When** <action on the surface>
- **Then** <observable outcome>

## Corner Cases

### BB-C01: <short title>
- Traces to: §Edge Cases item #3
- Priority: P1
- Mode: llm-driven
- Surface: checkout page (spec §User Stories US-02)
- **Given** …
- **When** …
- **Then** …

## Non-functional

### BB-N01: <short title>
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: `GET /search` (spec §Non-functional Requirements)
- **Given** …
- **When** …
- **Then** <threshold from the NFR, e.g. p95 response time < 500 ms>
```

Rules:

- Numbering is two-digit zero-padded **per group**: `BB-M01`, `BB-C01`,
  `BB-N01`.
- Every case has the seven fields in order: `Traces to:`, `Priority:`,
  `Mode:`, `Surface:`, `**Given**`, `**When**`, `**Then**`. Optional
  `Setup:` / `Cleanup:` lines sit between `Surface:` and `**Given**`,
  every action going through an external surface.
- `Traces to:` is a comma-separated list of `FR-NN` / `US-NN` / `NFR-NN`
  identifiers, or `§Edge Cases item #<N>` when no numbered id exists.
  Don't fake traces to hit coverage — leave honest gaps in the report.
- `Mode:` is `automated` when the check is deterministic and scriptable
  at contract level; `llm-driven` when deciding it takes page- or
  flow-level judgment (an LLM agent drives the UI or calls and judges
  the outcome). Prefer `automated` when both would work. This plugin
  ships no llm-driven executor — those cases are run later by an LLM
  agent or a human.
- `Surface:` names the contracted surface the case binds to, with its
  spec anchor. Unpinned surface → the case moves to Pending.
- A concurrency **Then** asserts invariants — exactly one effect, no
  lost update, no partial state — never timing or ordering. A
  performance **Then** carries the spec's NFR number; if the spec has
  no number, the case goes to Pending and the gap is flagged — don't
  invent thresholds.
- UI targets are named by role + visible label from the spec, never by
  position or color.
- `[ASSUMED: …]` markers from the spec propagate onto the derived
  cases, on the same line as `Traces to:`.
- When the feature modifies an existing product, a case that pins
  behavior already working today carries `[PRE-IMPL: green — existing
  behavior]` on the `Traces to:` line. Unannotated cases are expected
  to fail before implementation.
- If the spec carries unresolved items (`### Carried forward`) or any
  surface is unpinned, append a final `## Pending cases (blocked by
  open items)` section: one entry per item, sketching the case shape
  (a pointer for review, not a real case). Pending entries are not
  cases — no BB-ID, exempt from the seven-field rule, and skipped by
  `materialize-blackbox-tests`.

### 5. Coverage self-check

Before reporting done, verify against the source:
- Every `FR-NN` is referenced by ≥ 1 case.
- Every `US-NN` is referenced by ≥ 1 case; `## Main Flow` holds ≥ 1
  `P0` end-to-end case.
- Every `NFR-NN` is referenced by ≥ 1 `BB-N*`.
- Every edge-case entry is referenced by ≥ 1 case (usually `BB-C*`).
- Total cases ≥ `#FR + #NFR + #edge-cases` (a single FR often needs a
  happy-path AND a guard / reverse case).
- All three group headers present; every case has all seven fields;
  numbering correct; every `Mode:` / `Surface:` valid; no bare `TBD`;
  `[ASSUMED: …]` markers propagated; Pending section present iff open
  items or unpinned surfaces exist.

### 6. Adversarial gap sweep

After the self-check passes, spawn one fresh-context reviewer subagent
carrying only the requirement source and the drafted `blackbox.md`,
with a single question: **"What user-visible behavior could break
without any of these cases going red?"** Each finding becomes a new
case (which must itself pass step 5) or, when it exposes a requirement
gap, a `## Pending cases` entry flagged back to the spec. One reviewer
is the default; use 2–3 only when the user asks for thorough coverage.

### 7. Report

State the output path and a one-line coverage summary: case count per
group, whether every requirement is covered (or which aren't, and why),
gap-sweep findings adopted, and any surface gaps or external-setup
exceptions flagged back to the spec.

<!-- kcc-dev-core-write-blackbox-tests-sentinel: v2 -->
