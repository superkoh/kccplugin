---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T4 in the dev-plan-<slug> team. Reads kickoff.md + spec.md + ac.md, derives the 5 scoping answers kcc-testing normally asks the user, then either invokes kcc-testing:write-test-cases with a scope override that skips its Step 2 AskUserQuestion (Path A — when the skill is available) or synthesizes a minimum-viable kcc-testing-schema-compatible YAML inline (Path B fallback). Output always lands at .kcc/tests/cases/<slug>.yaml.
---

# Step 4 — Test Case Writer (teammate T4)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T4 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent** (T4). No `AskUserQuestion`. The
`Skill` tool IS available — this step may invoke
`kcc-testing:write-test-cases` when that skill is present in the
teammate's session (Path A). Otherwise it synthesizes YAML inline
(Path B).

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — from Phase 0. Supplies
  feature name, platform, input-material path.
- `.kcc/specs/<feature-slug>/spec.md` — from T1. Supplies FR-NN /
  US-NN / NFR-NN / edge-case list and System Design cues.
- `.kcc/specs/<feature-slug>/ac.md` — from T2 (possibly rewritten by
  T3). Supplies AC-F / AC-N / AC-E and Traces-to map.

## Output

Single file: `.kcc/tests/cases/<feature-slug>.yaml`. This path exactly
matches `kcc-testing:write-test-cases`'s default output location — do
not change it.

## Pre-answer derivation (both paths)

Before dispatching to Path A or Path B, T4 derives the five answers
that `kcc-testing:write-test-cases` normally collects via
`AskUserQuestion` in its Step 2:

| Field | Source |
|---|---|
| `feature` | kickoff `## Metadata` → `feature name` |
| `platform` | kickoff `## Metadata` → `platform` |
| `design_tokens_source` | spec `## System Design` / `### Architecture` — use the token file path if cited; otherwise `null` |
| `ui_change` | `true` if spec System Design describes user-visible UI elements or the State Machine has observable states; `false` only when the feature is pure data/API with no surfaced rendering |
| `coverage_triggers` | inspect spec `## Non-functional Requirements` + `## Edge Cases`: security/auth/input-reaching-server NFR → `security: true`; i18n / locale / RTL NFR → `i18n: true`; latency / performance NFR → `performance: true` |

If any value cannot be derived confidently, pick the **conservative
default**: `ui_change: true`, each `coverage_triggers` flag `true`.
False negatives here ship features without coverage; false positives
only cost one extra case per angle.

## Dispatch — Path A or Path B

Inspect the teammate's available skills list. If it contains
`kcc-testing:write-test-cases`, take **Path A**; otherwise **Path B**.

### Path A — leverage `kcc-testing:write-test-cases`

Invoke via the `Skill` tool. Pass this scope override verbatim as
`args`, substituting the five pre-answers you derived:

```
Scope: invoked inside kcc-dev-workflow:step-test-case-writer as
teammate T4 in dev-plan-<slug>. The design artifacts are fully
captured in:
- .kcc/specs/<slug>/kickoff.md
- .kcc/specs/<slug>/spec.md
- .kcc/specs/<slug>/ac.md

SKIP your Step 1 (context scan / hypothesis) and Step 2
(AskUserQuestion). All step-2 answers are pre-supplied here — use them
verbatim and do NOT call AskUserQuestion (teammate context has no user
access):

- feature: "<pre-filled from kickoff>"
- platform: "<pre-filled>"
- design_tokens_source: <pre-filled path or null>
- ui_change: <true|false>
- coverage_triggers:
    security:    <true|false>
    i18n:        <true|false>
    performance: <true|false>

Seed your Step 1 requirement-branches enumeration from spec.md's
FR-NN / US-NN / NFR-NN list and ac.md's AC-F / AC-N / AC-E Traces-to
map. Every FR / US / NFR / edge-case already carries a stable
identifier you can cite as requirement_ref — examples:
`spec §FR-03`, `spec §NFR-01`, `ac §AC-F02`,
`kickoff §Key Scenarios item #2`.

Run Steps 3-6 normally (generate candidates, populate YAML, lint,
write + report).

Output path MUST be .kcc/tests/cases/<slug>.yaml where <slug> equals
"<slug-from-kickoff>" exactly — do NOT reslugify from feature name.

Do NOT:
- Invoke AskUserQuestion for any reason
- Change the output path
- Write anywhere outside .kcc/tests/cases/
- Commit anything
```

When `kcc-testing:write-test-cases` returns, proceed to the
post-invocation checks (below).

#### Path A post-invocation checks

1. **Output path check**: verify `.kcc/tests/cases/<slug>.yaml` exists
   and was written during this invocation. If kcc-testing wrote to a
   different slug (e.g. it reslugified the feature name), attempt
   `mv <actual> .kcc/tests/cases/<slug>.yaml` and record a warning in
   the teammate reply. If the move fails → treat as Path A failure and
   fall back to Path B (see below).
2. **Cross-artifact leak check**: verify nothing was written under
   `docs/superpowers/specs/` or outside `.kcc/tests/cases/` during
   this invocation.
3. **Schema sanity**: the file parses as YAML and carries the top-level
   required fields (`feature`, `platform`, `design_tokens_source`,
   `ui_change`, `coverage_triggers`, `generated_at`, `generated_by`,
   `cases`, `rtm_summary`).

#### Path A fallback condition

Fall back to Path B when ANY of:

- `kcc-testing:write-test-cases` refuses to skip Step 2 / attempts
  `AskUserQuestion`.
- The invocation errors out or returns without writing the output
  file.
- Output lands at a path other than `.kcc/tests/cases/<slug>.yaml` and
  cannot be moved.
- Schema sanity fails after the invocation.

When falling back, the teammate reply MUST explicitly state
`fell back to Path B (reason: <one-line>)`. No silent downgrade.

### Path B — inline minimum-viable generation

Synthesize `.kcc/tests/cases/<slug>.yaml` directly using the kcc-testing
schema. Produce only the **minimum required fields** (enough to pass a
kcc-testing validator). Visual / a11y assertion richness is
deliberately reduced in fallback mode.

#### Required top-level fields

```yaml
feature: "<from kickoff>"
requirement_ref: "spec.md + ac.md"            # file-level ref only
platform: <from kickoff>
design_tokens_source: <path or null>
ui_change: <bool>
coverage_triggers:
  security: <bool>
  i18n: <bool>
  performance: <bool>
generated_at: "<ISO 8601 date>"
generated_by: "kcc-dev-workflow/step-test-case-writer/v1 (Path B fallback)"
cases: [...]
rtm_summary: {...}
```

#### Required per-case fields

Every entry in `cases[]` carries:

- `id` — `TC-<AREA>-<NNN>`, two-digit+ zero-padded, unique.
- `title` — imperative, short.
- `priority` — `P0` / `P1` / `P2`. At least one case is `P0`.
- `requirement_ref` — cites a specific spec/ac identifier, e.g.
  `"spec §FR-03"` or `"ac §AC-E02"`. Never empty.
- `tags` — array; includes matching keyword for any active
  `coverage_triggers`.
- `preconditions.state` — prose description of pre-step-1 state.
- `preconditions.data_setup` — array of imperative setup lines (empty
  array allowed; must be idempotent).
- `steps[]` — ≥ 1 entry, each with `n` (1-based integer), `action`
  (imperative, quote literals), `oracle` (string or array).
- `cleanup` — array of idempotent cleanup actions (empty allowed only
  if `data_setup` is also empty).
- `testability` — six required fields: `oracle_present` (bool),
  `state_reachable` (bool), `deterministic` (bool), `isolated` (bool),
  `has_explicit_wait` (bool), `wait_spec` (string — concrete wait spec
  or `"n/a — all oracles are sync DOM reads"`).

#### Optional per-case fields

- `assertions.visual[]` — **Path B default: omit.** Only when
  `ui_change: true`, include at least one minimal Form A entry
  (property-based) on a representative case. Reference a design token
  or a concrete WCAG/HIG rule; do not hand-craft a Form B description
  in Path B.
- `assertions.accessibility[]` — inject platform a11y floor on
  interactive-control cases only (e.g. role present, name present).

#### Required `rtm_summary`

```yaml
rtm_summary:
  requirement_branches_total: <number of FR + NFR + edge-case entries>
  requirement_branches_covered: <count cited by at least one case>
  uncovered_branches:
    - "<open-item verbatim from spec §Carried forward>: deferred — blocked by open item"
    # list zero or more; empty if no Open Items
  unreferenced_cases: []
```

#### Case-generation rules (Path B)

Derive cases from the AC-first model:

- Every `AC-F*` → at least 1 case (P1 default; elevate to P0 if the AC
  traces to a P0-level FR or a critical US).
- Every `AC-E*` → at least 1 edge case (P0 or P1 — pick P0 for
  safety-critical edges, P1 otherwise).
- Every `AC-N*` → at least 1 case tied to the NFR's quantified
  threshold.
- For each `coverage_triggers.X: true`, ensure at least one case
  carries the tag `X` (`security` / `i18n` / `performance`).
- Total ≥ 1 `P0` across the file.

Do not manufacture cases without AC citation. If an AC cannot be
mechanically translated into a case (e.g. its Given requires data the
feature does not yet expose), add it to `uncovered_branches` with the
reason `"untestable as written — revisit after implementation"` and
do not force a case.

### Path B lint (inline, before self-check)

Run these checks on the synthesized file. Failures are hard — fix or
drop the offending case before writing, not after:

1. All top-level required fields present.
2. `ui_change: true` → at least one case has `assertions.visual[]`.
3. For each `coverage_triggers.X: true`, at least one case is tagged
   `X`.
4. Every case `requirement_ref` is non-empty and resolves to a real
   identifier in spec.md or kickoff.md.
5. Every case's `testability` block has all six fields filled.
6. `rtm_summary.requirement_branches_total` equals
   `#FR + #NFR + #edge-cases` from spec.
7. `rtm_summary.requirement_branches_covered` equals the number of
   branches cited by at least one surviving case.
8. At least one `P0`.

## Process

1. Read `kickoff.md` + `spec.md` + `ac.md`.
2. Derive the five pre-answers (table above).
3. Inspect the teammate session's available skills. Pick Path A
   (if `kcc-testing:write-test-cases` present) or Path B.
4. Execute the chosen path.
5. Run the path-appropriate checks (Path A post-invocation checks, or
   Path B lint).
6. Structural self-check (below).
7. `TaskUpdate(taskId=T4, status=completed)`.
8. Reply `done` with the output path (and `fell back to Path B
   (reason: …)` if that happened), then stop.

## Structural self-check

Before `TaskUpdate`:

- `.kcc/tests/cases/<slug>.yaml` exists.
- File parses as YAML.
- `feature` equals the feature name from kickoff.
- `platform` equals kickoff's `platform`.
- `ui_change` is a boolean.
- `coverage_triggers` is an object with all three keys (`security`,
  `i18n`, `performance`), each a boolean.
- `cases[]` is a non-empty list; at least one entry has `priority: P0`.
- Every case has all required per-case fields (`id`, `title`,
  `priority`, `requirement_ref`, `tags`, `preconditions.state`,
  `preconditions.data_setup`, `steps[]`, `cleanup`, `testability` with
  all six fields).
- Every case `requirement_ref` resolves to a known identifier in spec
  or kickoff.
- `rtm_summary` has all four required fields and the counts are
  consistent.
- For Path B: all 8 Path B lint checks passed.
- For Path A: Path A post-invocation checks passed.

## Definition of Done

- `.kcc/tests/cases/<slug>.yaml` exists and passes every structural
  self-check item.
- The path used (A or B) is visible in the teammate reply; Path A →
  Path B fallbacks are explicitly justified.
- Task T4 has been marked `completed` via `TaskUpdate`.

## Anti-patterns

- **Do not hand-craft a YAML that diverges from kcc-testing's schema.**
  The output is consumed by kcc-testing's validator downstream.
- **Do not silently fall back from Path A to Path B.** State the
  fallback reason in the teammate reply.
- **Do not fabricate visual assertions in Path B** just to pass the
  `ui_change: true` rule. Use a minimal Form A with a token or concrete
  rule reference, or set `ui_change: false` only when truly justified
  by the spec.
- **Do not invoke AskUserQuestion**, directly or via any invoked
  skill.
- **Do not change the output path** away from `.kcc/tests/cases/<slug>.yaml`.
- **Do not write any case without a non-empty `requirement_ref`.**
  Uncovered branches go into `rtm_summary.uncovered_branches`, not
  into fake `requirement_ref` strings.
- **Do not TaskUpdate before self-check passes.**

## Failure modes

- **Any of kickoff / spec / ac missing** — abort with a clear error.
- **spec has zero FR, zero NFR, or zero edge-case entries in an
  engineer-ready feature** — abort; upstream-contract violation.
- **Path A: `kcc-testing:write-test-cases` attempts AskUserQuestion,
  fails, errors, or writes to the wrong path** — fall back to Path B
  with explicit reason.
- **Path B lint fails irrecoverably** — abort; surface which lint
  rule(s) failed.
- **Resulting YAML does not parse** — abort; do not TaskUpdate.

<!-- kcc-dev-workflow-step-test-case-writer-sentinel: v1 -->
