---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T6 in the dev-plan-<slug> team. Performs multi-agent review + vote on the YAML test cases and conditionally rewrites them to the consensus outcome. Spawns 3 reviewer subagents with distinct personas (Coverage / Testability / Quality lenses) across 2 rounds (independent + cross-read rebuttal), synthesizes findings, votes on a verdict, and if verdict ≤ approve-with-nits executes a rewrite via a rewriter-yaml subagent guarded by pre-backup and post-rewrite kcc-testing-compatible lint. Finally appends a "## test-cases" section to review.md.
---

# Step 6 — Test Case Reviewer (teammate T6, multi-agent review + vote)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T6 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent** (T6). No `AskUserQuestion`. The `Agent`
tool IS used to spawn 3 reviewer subagents (×2 rounds) plus one
rewriter subagent when rewrite is applied. No Path A — `kcc-testing`
ships no standalone test-case review skill and no `superpowers` skill
is a fit.

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — Phase 0.
- `.kcc/specs/<feature-slug>/spec.md` — T1 (possibly rewritten by T4).
- `.kcc/specs/<feature-slug>/ac.md` — T3 (possibly rewritten by T4).
- `.kcc/tests/cases/<feature-slug>.yaml` — T5.

## Outputs

- `.kcc/specs/<feature-slug>/review.md` — appended with a
  `## test-cases` section. The file already exists (created by T4
  with the `# Review — <feature-name>` header and `## spec-ac`
  section).
- `.kcc/specs/<feature-slug>/review-drafts/` — six reviewer drafts
  (`tc-reviewer-<N>-round<R>.md`) plus `tc-rewrite-plan.md` if rewrite
  runs.
- `.kcc/specs/<feature-slug>/.pre-review/tests-cases-<feature-slug>.yaml`
  — backup taken before rewrite (present only if rewrite applied).
- `.kcc/tests/cases/<feature-slug>.yaml` may be rewritten in-place
  when verdict ≤ approve-with-nits.

## Artifact layout

```
.kcc/specs/<slug>/
├── review.md                              (T6 appends ## test-cases)
├── .pre-review/
│   ├── spec.md                            (from T4, may be present)
│   ├── ac.md                              (from T4, may be present)
│   └── tests-cases-<slug>.yaml            (T6 backup if rewrite applied)
└── review-drafts/
    ├── reviewer-*-round*.md               (from T4)
    ├── tc-reviewer-1-round1.md
    ├── tc-reviewer-1-round2.md
    ├── tc-reviewer-2-round1.md
    ├── tc-reviewer-2-round2.md
    ├── tc-reviewer-3-round1.md
    ├── tc-reviewer-3-round2.md
    └── tc-rewrite-plan.md                 (only if rewrite applied)
.kcc/tests/cases/<slug>.yaml               (T6 may rewrite in place)
```

The `tc-` prefix keeps T6 artifacts distinct from T4's in the shared
`review-drafts/` directory.

## Reviewer personas (avoid homogeneity)

- **R1 — Coverage lens**: Every FR / US / NFR / edge-case from spec is
  cited by at least one case's `requirement_ref`? Every AC-F / AC-N /
  AC-E has a matching case? Every active `coverage_triggers.X` has a
  case tagged `X`? `rtm_summary` counts match reality?
  `unreferenced_cases: []`?
- **R2 — Testability lens**: Is every case's `oracle` mechanically
  verifiable? Are `preconditions` reachable with only `data_setup`?
  Does each `testability` field reflect the case honestly? Do async
  steps carry `has_explicit_wait: true` with a concrete `wait_spec`?
  Does each step have one oracle per reaction to the same event
  (composite-oracle array only, no cross-event bundling)?
- **R3 — Quality lens**: Locator discipline (ARIA role + accessible
  name, not color / position)? Every `assertions.visual[]` is pure
  Form A or pure Form B (no mixing)? No blacklisted visual language
  (L1 vague / L2 baseline / L3 relative-comparative)? Priority
  distribution reasonable (≤ 3 P0, 1-3 P1, rest P2)? `ui_change: true`
  → at least one case carries `assertions.visual[]`?

Every reviewer subagent receives the same base prompt PLUS a persona
directive so their drafts do not converge to the same findings.

## Process

### Phase R0 — Idempotence check (resume fast-path)

If `.kcc/specs/<feature-slug>/review.md` already contains a complete
`## test-cases` section with all 7 required sub-sections
(`### Reviewers`, `### Round 2 convergence highlights`,
`### Consensus findings` with all four severity sub-headers,
`### Coverage audit`, `### Vote`, `### Final verdict`, `### Rewrite`),
AND `### Final verdict` carries one of the three allowed values
(approve / approve-with-nits / request-changes), AND (if the Rewrite
sub-section says `applied`)
`.pre-review/tests-cases-<feature-slug>.yaml` exists — then:

1. Call `TaskUpdate(taskId=T6, status=completed)`.
2. Reply `done (already present — resumed)` with the review.md path.
3. Stop. Do NOT spawn reviewer or rewriter-yaml subagents. Do NOT
   modify the YAML.

Partial state (some `tc-reviewer-*-round*.md` drafts in
`review-drafts/` but no complete `## test-cases` section in
`review.md`) counts as a fail for this check — drop through to
Phase R1 and regenerate.

### Phase R1 — Parallel independent review

Spawn 3 reviewer subagents in parallel via `Agent`:

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  team_name="dev-plan-<slug>",
  name="tc-reviewer-<N>-round1",
  prompt=<reviewer base prompt + persona <N>>
)
```

Each reviewer writes
`.kcc/specs/<slug>/review-drafts/tc-reviewer-<N>-round1.md` with the
per-reviewer draft schema (below), replies `done`, stops.

Wait for all three idle notifications before Phase R2. If any reviewer
fails, retry once; failing again marks that reviewer absent for
downstream vote accounting.

### Phase R2 — Cross-read & rebuttal

Spawn the same 3 personas again, each instructed to **read the other
two reviewers' round-1 drafts first** and then revise their own
position:

```
name="tc-reviewer-<N>-round2"
prompt=<reviewer base prompt
       + persona <N>
       + "Before drafting, read tc-reviewer-<A>-round1.md and
          tc-reviewer-<B>-round1.md. For each finding they raised:
          explicitly concur, refine, or refute with justification.
          For your own round-1 findings: keep, demote severity, or
          retract with justification. Also update your verdict if
          your position has changed."
       + "Write .../tc-reviewer-<N>-round2.md">
```

All three round-2 drafts complete before Phase R3.

### Phase R3 — Synthesis (T6 inline)

Do not spawn subagents. Read all 6 drafts. Compute:

1. **Consensus findings**: merge substantively-same findings across
   reviewers. Supported by ≥ 2/3 round-2 reviewers → include at the
   majority severity. Singletons (1/3) → T6 judgment: include as Minor
   if plausible; as Major with `raised by R<N> only` note if severe;
   drop if weak and refuted.
2. **Coverage audit**: run mechanically against `<slug>.yaml`:
   - AC-F / AC-N / AC-E without any case citing them in `requirement_ref`.
   - `coverage_triggers.X: true` without any case tagged `X`.
   - `rtm_summary.requirement_branches_total` vs actual `#FR + #NFR +
     #edge-cases` from spec; `requirement_branches_covered` vs count
     of branches cited by ≥ 1 case.
   - `rtm_summary.unreferenced_cases` — must be `[]` (cases without
     `requirement_ref`).
3. **Vote tally**: collect each reviewer's round-1 and round-2 verdicts.
4. **Preliminary verdict**: majority of round-2 verdicts. Three-way tie
   → most conservative (`request-changes`).
5. **Schema-level override**: if any Consensus finding OR Coverage
   audit item falls into the schema-level list below, T6 **overrides
   the verdict to request-changes** regardless of reviewer vote:
   - Any top-level required field missing (`feature`, `platform`,
     `design_tokens_source`, `ui_change`, `coverage_triggers`,
     `generated_at`, `generated_by`, `rtm_summary`, `cases[]`).
   - `ui_change: true` but zero `assertions.visual[]` in the file.
   - Any case missing `id`, `requirement_ref`, `steps[]`, or any of
     the six `testability` fields.
   - Any `assertions.visual[]` entry mixes Form A and Form B fields.
   - Any case carries snapshot / baseline language (`matches baseline`,
     `same as previous run`, `baseline diff`).
6. **Absent-reviewer rule**: if a reviewer is absent (R1 or R2 failed
   twice), the remaining two must agree for verdict ≠ request-changes;
   disagreement → `request-changes`.

### Phase R4 — Conditional rewrite (verdict ≤ approve-with-nits)

If final verdict is `request-changes`, skip to R5.

#### R4.1 Generate the rewrite plan

T6 inline writes
`.kcc/specs/<slug>/review-drafts/tc-rewrite-plan.md`, translating
Consensus findings at Critical / Major / Minor severity into concrete
edit operations on `<slug>.yaml`. Each operation: `reason` (cites
Consensus finding), `loc` (top-level field name or case `id`), and
content (`before`/`after` for EDIT, `content` for ADD, `reason` for
REMOVE).

Schema:

```markdown
# tc-rewrite-plan

## <slug>.yaml edits

- EDIT   — case TC-API-03 → steps[2].oracle
  reason: consensus finding Major#2 (oracle not mechanically verifiable)
  before: "The response should be fast enough."
  after:  "Response time ≤ 300 ms, measured from submit to DOM update."

- ADD    — cases[] (new TC-SEC-02)
  reason: consensus finding Major#3 (coverage_triggers.security true
          but only one security-tagged case)
  content: |
    - id: "TC-SEC-02"
      title: "reject XSS payload in description field"
      priority: P1
      requirement_ref: "spec §NFR-02"
      tags: [security]
      preconditions:
        state: "user logged in on the editor screen"
        data_setup: []
      steps:
        - n: 1
          action: 'Type "<script>alert(1)</script>" into the description field and submit'
          oracle: "payload stored escaped; no script executes; field shows the literal text"
      cleanup: []
      testability:
        oracle_present: true
        state_reachable: true
        deterministic: true
        isolated: true
        has_explicit_wait: false
        wait_spec: "n/a — synchronous DOM read"

- EDIT   — rtm_summary.requirement_branches_covered
  reason: post-ADD count update
  before: 7
  after:  8
```

**In-scope operations** — wording tightening, oracle quantification
(only when spec has a number to cite), adding a missing case for an
uncovered AC, adding a trigger-tagged case, updating `rtm_summary`
counts, adding a minimal Form A visual assertion when `ui_change:
true` has none.

**Out-of-scope** — top-level schema restructuring, Form A ↔ Form B
conversions, mass renumbering of `id` or `requirement_ref`,
introducing snapshot/baseline language. These must have already
triggered the schema-level override in R3; if they appear in the plan
here, abort and downgrade verdict to `request-changes`.

#### R4.2 Back up original

```
mkdir -p .kcc/specs/<slug>/.pre-review
cp .kcc/tests/cases/<slug>.yaml .kcc/specs/<slug>/.pre-review/tests-cases-<slug>.yaml
```

#### R4.3 Apply via `rewriter-yaml` subagent

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  team_name="dev-plan-<slug>",
  name="rewriter-yaml",
  prompt="""
    Apply the rewrite plan to the YAML test cases file exactly as
    specified.

    Inputs:
    - current file: .kcc/tests/cases/<slug>.yaml
    - rewrite plan: .kcc/specs/<slug>/review-drafts/tc-rewrite-plan.md

    Constraints:
    - Apply every EDIT / ADD / REMOVE in order
    - Preserve top-level schema (feature / platform / design_tokens_source
      / ui_change / coverage_triggers / generated_at / generated_by /
      cases / rtm_summary) — do NOT change keys or add new top-level
      fields
    - Preserve every case id not touched by the plan
    - When ADDing a new case, assign the next unused `TC-<AREA>-<NNN>`
      with two-digit+ zero padding; do not reuse an existing id
    - When an EDIT changes a numeric rtm_summary field, keep the
      counts internally consistent with the final case list
    - Do NOT invent changes beyond the plan
    - Do NOT modify spec.md, ac.md, or any other file
    - Write the result back to .kcc/tests/cases/<slug>.yaml
    - Reply 'done' with a 3-line summary of ids touched
  """
)
```

Wait for idle before R4.4.

#### R4.4 Post-rewrite lint (kcc-testing-compatible, 7 checks)

T6 reruns the mechanical lint on the rewritten YAML:

1. All 9 top-level required fields present and non-null (where
   applicable); `cases[]` non-empty.
2. `ui_change: true` → at least one case carries `assertions.visual[]`.
3. Every `coverage_triggers.X: true` has at least one case tagged `X`.
4. Every case has a non-empty `requirement_ref` that resolves to a
   real identifier in spec.md (FR-NN / US-NN / NFR-NN) or kickoff.md
   (Key-Scenarios item).
5. Every case's `testability` block has all six fields filled.
6. `rtm_summary.requirement_branches_total` equals `#FR + #NFR +
   #edge-cases` from spec; `requirement_branches_covered` equals the
   count of branches cited by ≥ 1 surviving case;
   `unreferenced_cases: []`.
7. At least one `P0`.

#### R4.5 Rollback if lint failed

If any lint item fails:

```
cp .kcc/specs/<slug>/.pre-review/tests-cases-<slug>.yaml .kcc/tests/cases/<slug>.yaml
```

Then downgrade verdict to `request-changes` and record the failure
detail in the `Rewrite` subsection of review.md (step R5):
`failed — rewrite aborted (<specific lint failure>)`.

#### R4.6 Accept on clean lint

If every lint line is clean, keep the rewritten YAML. The `Rewrite`
subsection records `applied` with the list of touched ids.

### Phase R5 — Append `## test-cases` to review.md

Append to `.kcc/specs/<slug>/review.md` (the file exists; do not
recreate its top-level header). The appended content MUST begin with
`## test-cases` and contain, in order:

```markdown
## test-cases

### Reviewers
- R1: Coverage lens      → review-drafts/tc-reviewer-1-round{1,2}.md
- R2: Testability lens   → review-drafts/tc-reviewer-2-round{1,2}.md
- R3: Quality lens       → review-drafts/tc-reviewer-3-round{1,2}.md

### Round 2 convergence highlights
- <which round-1 disagreements converged in round-2 and how>
- <which remained contested, and how T6 resolved them>

### Consensus findings

#### Critical
- _none_

#### Major
- _none_

#### Minor
- _none_

#### Nit
- _none_

### Coverage audit (post-round2, pre-rewrite)
- AC-F without case: none
- AC-N without case: none
- AC-E without case: none
- coverage_triggers.X without tagged case: none
- rtm_summary counts consistent? yes
- unreferenced_cases: []

### Vote
| Reviewer | Round 1 verdict | Round 2 verdict |
|---|---|---|
| R1 | ... | ... |
| R2 | ... | ... |
| R3 | ... | ... |

### Final verdict
- **Outcome:** approve | approve-with-nits | request-changes
- **Rationale:** <one-line, tied to Consensus findings + Coverage audit>

### Rewrite
- **Applied?** yes | no (skipped because verdict = request-changes)
- **Changed case ids:** <list + one-line summary each, or `-` if none>
- **Changed top-level fields:** <list, or `-`>
- **Backup location:** .kcc/specs/<slug>/.pre-review/tests-cases-<slug>.yaml
- **Post-rewrite lint:** all green | failed — rewrite aborted (<detail>)
```

Use `_none_` as the placeholder for empty severity buckets — do not
omit any severity sub-header.

### Phase R6 — Finalize

1. Run the structural self-check below.
2. `TaskUpdate(taskId=T6, status=completed)`.
3. Reply `done` with the output path, then stop.

## Per-reviewer draft schema

```markdown
# TC Reviewer <N> — <persona name> — Round <R>

## Summary
<1–2 paragraphs overall take + scope of the audit>

## Findings

### Critical
- <finding> — loc: <yaml key path or case id + field> — fix: <suggestion>
- _none_

### Major
- _none_

### Minor
- _none_

### Nit
- _none_

## Coverage audit (this reviewer's independent pass)
- AC-F without case: ...
- AC-N without case: ...
- AC-E without case: ...
- coverage_triggers.X without tagged case: ...
- rtm_summary counts consistent? ...
- unreferenced_cases: ...

## Verdict
- approve | approve-with-nits | request-changes
- Rationale: <one-line>
```

## Definition of Done

- 6 reviewer drafts exist under `review-drafts/`
  (`tc-reviewer-<N>-round{1,2}.md` for N ∈ {1,2,3}).
- `review.md` contains a `## test-cases` section with all 7
  sub-sections listed above.
- Final verdict is one of `approve` / `approve-with-nits` /
  `request-changes`.
- Verdict is consistent with rules: schema-level consensus or
  coverage-audit items force `request-changes`; majority of round-2
  reviewer verdicts otherwise; 3-way tie → most conservative.
- If the Rewrite section says `applied`:
  - `.pre-review/tests-cases-<slug>.yaml` exists.
  - `review-drafts/tc-rewrite-plan.md` exists.
  - Post-rewrite lint is all green.
- If the Rewrite section says `failed — rewrite aborted`:
  - `<slug>.yaml` on disk matches the backup (rolled back).
  - Final verdict has been downgraded to `request-changes`.
- Task T6 has been marked `completed` via `TaskUpdate`.

## Structural self-check (run before TaskUpdate)

- `review.md` exists with a top-level `# Review — <feature-name>`
  header and an earlier `## spec-ac` section.
- `## test-cases` section contains all 7 sub-sections: `### Reviewers`,
  `### Round 2 convergence highlights`, `### Consensus findings`
  (with `#### Critical`, `#### Major`, `#### Minor`, `#### Nit`),
  `### Coverage audit`, `### Vote`, `### Final verdict`,
  `### Rewrite`.
- Every severity bucket has at least one bullet (`_none_` placeholder
  is valid).
- Vote table has 3 reviewer rows × 2 round columns.
- Final verdict is one of the three allowed values.
- Rewrite section's `Applied?` value matches reality (yes implies
  backup present; no implies verdict = request-changes or lint
  failed).
- No bullet is exactly `TBD`.
- 6 reviewer drafts present on disk (absent reviewers allowed only
  with the vote row marked `absent` and the two-must-agree rule
  respected).

## Anti-patterns

- **Do not skip Round 2.** Without cross-read the three reviewers are
  three parallel opinions, not a discussion.
- **Do not use identical prompts for R1/R2/R3.** Inject the persona
  directive; otherwise reviews converge.
- **Do not rewrite on verdict = request-changes.** Those findings
  require upstream iteration.
- **Do not rewrite schema-level issues.** If consensus has any such
  finding, verdict flips to `request-changes` and rewrite is skipped.
- **Do not mix Form A and Form B in `assertions.visual[]`** via
  rewrite. That is a schema-level issue — it forces request-changes.
- **Do not skip the post-rewrite lint.** The rewriter subagent is a
  content generator; T6 verifies.
- **Do not leave `review-drafts/` stale** from a prior T6 run — remove
  any unrelated `tc-*` files before Phase R1.
- **Do not modify `<slug>.yaml` outside Phase R4.3.** The rewriter
  subagent is the only writer.
- **Do not TaskUpdate before self-check passes.**

## Failure modes

- **kickoff / spec / ac / yaml missing** — abort with a clear error;
  do not proceed to R1.
- **YAML unparseable** — abort; upstream-contract violation.
- **A reviewer subagent fails** — retry once. If it fails again, mark
  absent; downstream vote uses only the remaining reviewers. Absent
  rule: two must agree for verdict ≠ request-changes; disagreement
  → `request-changes`.
- **Rewriter subagent fails or returns malformed output** — do not
  accept; treat as rewrite failure: rollback and downgrade verdict to
  `request-changes`.
- **Post-rewrite lint fails** — rollback from backup; downgrade
  verdict; note the specific lint failure in the Rewrite subsection.

<!-- kcc-dev-workflow-step-test-case-reviewer-sentinel: v1 -->
