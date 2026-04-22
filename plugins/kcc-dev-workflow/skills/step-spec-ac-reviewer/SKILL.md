---
description: Internal step skill for kcc-dev-workflow:plan-feature orchestrator. Do not invoke directly — trigger only via the orchestrator. Runs as teammate T4 in the dev-plan-<slug> team. Performs multi-agent review + vote on spec.md, ui.md, and ac.md, then conditionally rewrites all three to the consensus outcome. Spawns 4 reviewer subagents with distinct personas (Requirements / Testability / Risk-Architecture / UX lenses) across 2 rounds (independent review + cross-read rebuttal), synthesizes findings, votes on a verdict, and if verdict ≤ approve-with-nits executes a rewrite via three rewriter subagents (one per file) guarded by pre-backup and post-rewrite traceability audit. Finally appends a structured "## spec-ac" section to review.md.
---

# Step 4 — Spec+AC Reviewer (teammate T4, multi-agent review + vote)

> ⚠️ Orchestrator-only. Direct invocation is unsupported. This skill is
> invoked by a teammate spawned by `kcc-dev-workflow:plan-feature` as
> task T4 in the `dev-plan-<slug>` team.

## Where this runs

**Inside a teammate subagent** (T4). No `AskUserQuestion`. However,
this step **does spawn further subagents** via the `Agent` tool: 4
reviewer subagents (×2 rounds) plus up to 3 rewriter subagents. There
is no Path A here — `superpowers` ships no standalone spec/AC review
skill. This step runs inline with its own multi-agent choreography.

## Inputs

- `.kcc/specs/<feature-slug>/kickoff.md` — from Phase 0.
- `.kcc/specs/<feature-slug>/spec.md` — from T1 (step-spec-writer).
- `.kcc/specs/<feature-slug>/ui.md` — from T2 (step-ui-ux-designer).
- `.kcc/specs/<feature-slug>/ac.md` — from T3 (step-ac-writer).

## Outputs

- `.kcc/specs/<feature-slug>/review.md` — appended with a `## spec-ac`
  section (top-level `# Review — <feature-name>` header created if
  the file does not exist). The section name stays `## spec-ac` for
  stability with downstream consumers; its scope now covers spec +
  ui + ac.
- `.kcc/specs/<feature-slug>/review-drafts/` — eight reviewer drafts
  (`reviewer-<N>-round1.md`, `reviewer-<N>-round2.md` for N ∈ {1,2,3,4})
  plus the `rewrite-plan.md` if rewrite runs.
- `.kcc/specs/<feature-slug>/.pre-review/` — backup of `spec.md`,
  `ui.md`, and `ac.md` taken immediately before rewrite (present
  only if rewrite was applied).
- `.kcc/specs/<feature-slug>/spec.md`, `ui.md`, and `ac.md` may be
  rewritten in-place when verdict ≤ approve-with-nits.

## Artifact layout

```
.kcc/specs/<slug>/
├── kickoff.md
├── spec.md                 (T4 may rewrite in place)
├── ui.md                   (T4 may rewrite in place)
├── ac.md                   (T4 may rewrite in place)
├── review.md               (T4 appends ## spec-ac)
├── .pre-review/
│   ├── spec.md             (backup, only if rewrite applied)
│   ├── ui.md
│   └── ac.md
└── review-drafts/
    ├── reviewer-1-round1.md
    ├── reviewer-1-round2.md
    ├── reviewer-2-round1.md
    ├── reviewer-2-round2.md
    ├── reviewer-3-round1.md
    ├── reviewer-3-round2.md
    ├── reviewer-4-round1.md
    ├── reviewer-4-round2.md
    └── rewrite-plan.md       (only if rewrite applied)
```

## Reviewer personas (avoid homogeneity)

- **R1 — Requirements lens**: Does spec + ui + ac cover every kickoff
  intent (all 9 sections)? Scope creep or scope gap? Do FRs, ACs, and
  ui components trace back to user stories and personas from kickoff?
- **R2 — Testability lens**: Is every AC mechanically verifiable? Are
  FRs atomic? Are NFRs quantified? Are traceability tags
  self-consistent? Are edge-case ACs realistic oracles? Are ui
  components' states / events testable with ARIA-based locators?
- **R3 — Risk/Architecture lens**: Does spec's System Design hold up
  (four sub-sections)? Are edge cases realistic and exhaustive for the
  architecture? Are data / API shapes in spec internally consistent
  with ui's Component Catalog events? Any security / performance /
  maintainability risks?
- **R4 — UX lens**: Does ui.md cover every user-facing intent in
  kickoff's Users & Personas and Key Scenarios? Is the Component
  Catalog complete (every interactive surface in ui's User Flows has
  a row)? Are Interaction Specs concrete (feedback latency + failure
  mode specified)? Do Accessibility Targets list concrete WCAG level,
  keyboard order, and screen-reader labels for every interactive
  component? Does Visual Hierarchy & Design Tokens avoid vague /
  subjective language?

Every reviewer subagent receives the same base prompt PLUS a persona
directive ("You are R1 — review from the Requirements lens. Focus on
...") so their drafts do not converge to the same findings.

## Process

### Phase R0 — Idempotence check (resume fast-path)

If `.kcc/specs/<feature-slug>/review.md` already contains a complete
`## spec-ac` section with all 7 required sub-sections (`### Reviewers`,
`### Round 2 convergence highlights`, `### Consensus findings` with
all four severity sub-headers, `### Traceability audit`, `### Vote`,
`### Final verdict`, `### Rewrite`), AND `### Final verdict` carries
one of the three allowed values (approve / approve-with-nits /
request-changes), AND (if the Rewrite sub-section says `applied`)
`.pre-review/spec.md`, `.pre-review/ui.md`, and `.pre-review/ac.md`
exist — then:

1. Call `TaskUpdate(taskId=T4, status=completed)`.
2. Reply `done (already present — resumed)` with the review.md path.
3. Stop. Do NOT spawn reviewer or rewriter subagents. Do NOT modify
   spec.md / ui.md / ac.md.

Partial state (some drafts in `review-drafts/` but no complete
`## spec-ac` section in `review.md`) counts as a fail for this check
— drop through to Phase R1 and regenerate; overwriting stale drafts is
expected.

### Phase R1 — Parallel independent review

Spawn 4 reviewer subagents in parallel via `Agent`:

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  team_name="dev-plan-<slug>",
  name="reviewer-<N>-round1",
  prompt=<reviewer base prompt + persona <N>>
)
```

Each reviewer writes `.kcc/specs/<slug>/review-drafts/reviewer-<N>-round1.md`
with the per-reviewer draft schema below, then replies `done` and stops.

Wait for all four idle notifications before Phase R2. If any reviewer
fails, retry once; if it fails again, mark it absent for downstream
vote accounting.

### Phase R2 — Cross-read & rebuttal

Spawn the same 4 personas again, each given read access to the other
three reviewers' round-1 drafts and instructed to **revise their own
position**:

```
name="reviewer-<N>-round2"
prompt=<reviewer base prompt
       + persona <N>
       + "Before drafting, read reviewer-<A>-round1.md,
          reviewer-<B>-round1.md, and reviewer-<C>-round1.md (the
          three other reviewers). For each finding they raised:
          explicitly concur, refine, or refute with justification.
          For your own round-1 findings: keep, demote severity,
          or retract with justification. Also update your verdict
          if your position has changed."
       + "Write .../reviewer-<N>-round2.md">
```

All four round-2 drafts complete before Phase R3.

### Phase R3 — Synthesis (T4 inline)

Do not spawn subagents. Read all 8 drafts. Compute:

1. **Consensus findings**: for each finding in any round-2 draft, count
   how many reviewers support it. Merge "substantively the same"
   findings (same underlying issue, possibly different wording).
   - Supported by ≥ 2/4 reviewers → include in Consensus findings at
     the severity chosen by majority (elevate to the higher severity
     on tie).
   - Supported by 1/4 (singleton) → T4 judgment: include as Minor if
     plausible; include as Major with `raised by R<N> only` note if
     severe; drop if weak and already refuted by the others.
2. **Traceability + UI audit**: run mechanically on the current
   spec.md / ui.md / ac.md. Record results verbatim. Covers:
   - FR / US / NFR / edge-case coverage by AC
   - ASSUMPTION propagation from spec to ac
   - spec Open Items ↔ ac Pending AC alignment
   - ui Component Catalog completeness vs ui User Flows
   - ui ARIA / keyboard / screen-reader entries for every
     interactive component
   - ui ASSUMPTION ↔ Open UX Questions pairings
3. **Vote tally**: collect each reviewer's round-1 verdict and round-2
   verdict.
4. **Preliminary verdict**: majority of round-2 verdicts.
   - 4-0 / 3-1 → majority wins.
   - 2-2 tie → take the **most conservative** of the two (e.g.
     approve-with-nits vs request-changes → request-changes).
   - Four distinct values is impossible with 3 allowed verdict labels;
     any three-way split at 2-1-1 uses the 2-count; ties between
     equal-count factions resolve to the most conservative.
5. **Schema-level override**: if any Consensus finding is a
   schema-level issue, T4 **automatically overrides the verdict to
   request-changes** regardless of the reviewer vote. The schema-level
   list covers all three files:
   - spec.md: section order broken, FR / US / NFR numbering broken,
     System Design missing one of its four sub-sections.
   - ui.md: section order broken (7 sections required), Component
     Catalog table header broken or missing columns, User Flows
     section missing Mermaid block without N/A justification,
     Accessibility Targets missing WCAG / keyboard / screen-reader
     sub-bullets.
   - ac.md: missing one of its three group headers (Functional /
     Non-functional / Edge Cases), AC missing one of its four fields
     (Traces to / Given / When / Then).
   Reason: these issues cannot be mechanically patched by a rewriter.
6. **Absent-reviewer rule**: if one reviewer was marked absent in R1
   or R2, synthesis proceeds with the remaining 3 reviewers. Consensus
   threshold remains ≥ 2 supporting reviewers. For verdict, 2-of-3
   agreement suffices for non-request-changes; 1-1-1 splits resolve
   to the most conservative. If two reviewers are absent, abort: the
   review lacks sufficient perspective.

### Phase R4 — Conditional rewrite (verdict ≤ approve-with-nits)

If the final verdict from R3 is `request-changes`, skip this entire
phase and proceed to R5. Otherwise:

#### R4.1 Generate the rewrite plan

T4 inline writes `.kcc/specs/<slug>/review-drafts/rewrite-plan.md` by
translating every Consensus finding at Critical / Major / Minor
severity into one or more concrete edit operations. Each operation
carries three fields: `reason` (cites the Consensus finding), location
(section or numbered ID), and content (`before`/`after` for EDIT,
`content` for ADD, `reason` for REMOVE).

Rewrite-plan schema:

```markdown
# Rewrite plan

## spec.md edits
- EDIT   — §Functional Requirements → FR-03
  reason: consensus finding Major#2 (untestable wording)
  before: "The system should be fast."
  after:  "p95 response time ≤ 300 ms."

- ADD    — §Edge Cases & Error Handling
  reason: consensus finding Major#4 (missing timeout edge)
  content: "When upstream API times out after 5s, system returns
           cached result with staleness banner."

## ui.md edits
- EDIT   — §Accessibility Targets → screen-reader labels
  reason: consensus finding Major#3 (ApplyButton has no aria-label)
  before: "- ApplyButton: defaults to visible text"
  after:  "- ApplyButton: aria-label=\"Apply coupon and recalculate total\""

- ADD    — §Component Catalog
  reason: consensus finding Major#5 (missing loading state)
  content: |
    | ApplyButton | default, loading, success, error | click | apply-coupon-requested |

## ac.md edits
- ADD    — §Functional (new AC-F07)
  reason: FR-05 had zero AC coverage (Traceability audit)
  content: |
    ### AC-F07: retry on upstream 503
    - Traces to: FR-05, US-02, ui §Component ApplyButton
    - **Given** upstream returns 503
    - **When** the user submits the form
    - **Then** system retries once after 200ms before surfacing error
```

Nits are optional (may or may not be in the plan). Schema-level
changes must never appear in the plan (R3 already overrode verdict
if any were in consensus).

#### R4.2 Back up originals

```
mkdir -p .kcc/specs/<slug>/.pre-review
cp .kcc/specs/<slug>/spec.md .kcc/specs/<slug>/.pre-review/spec.md
cp .kcc/specs/<slug>/ui.md   .kcc/specs/<slug>/.pre-review/ui.md
cp .kcc/specs/<slug>/ac.md   .kcc/specs/<slug>/.pre-review/ac.md
```

#### R4.3 Apply via rewriter subagents

Spawn up to three rewriter subagents in parallel — one per touched
file — via `Agent`. Each applies the plan to its target file. A file
that has no edits in the rewrite plan gets no rewriter (skipped).

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  team_name="dev-plan-<slug>",
  name="rewriter-spec",
  prompt="""
    Apply the rewrite plan to spec.md exactly as specified.

    Inputs:
    - current file: .kcc/specs/<slug>/spec.md
    - rewrite plan: .kcc/specs/<slug>/review-drafts/rewrite-plan.md
      (only the `## spec.md edits` block)

    Constraints:
    - Apply every EDIT / ADD / REMOVE for spec.md in the order listed
    - Preserve the 7-section order and all IDs not touched by the plan
    - When an ADD introduces a new FR / US / NFR, append at the end of
      the respective group with the next N+1 number (two-digit zero
      padded)
    - Do NOT invent changes beyond the plan
    - Do NOT modify .kcc/specs/<slug>/ac.md — that is a sibling job
    - Write the result back to .kcc/specs/<slug>/spec.md
    - Reply 'done' with a 3-line summary of sections touched
  """
)
```

Sibling subagents with analogous prompts:

- `rewriter-ui` — applies the `## ui.md edits` block; preserves
  ui.md's 7-section order, the Component Catalog table header, and
  the WCAG / keyboard / screen-reader sub-bullets.
- `rewriter-ac` — applies the `## ac.md edits` block; preserves the
  three group headers (Functional / Non-functional / Edge Cases),
  the two-digit zero-padded numbering (AC-F / AC-N / AC-E), and the
  four Gherkin fields (Traces to / Given / When / Then).

Wait for all spawned rewriters to idle before R4.4.

#### R4.4 Post-rewrite traceability audit

T4 reruns the full mechanical audit against the rewritten spec.md,
ui.md, and ac.md:

- FRs without AC coverage
- USs without AC coverage
- NFRs without AC coverage
- Edge cases without AC coverage
- ACs whose `Traces to:` points to a non-existent FR / US / NFR / ui
  component or flow
- Orphan ASSUMPTIONs (in spec or ui but not propagated to ac)
- spec `Open Items → Carried forward` ↔ ac `Pending AC` alignment
- ui Component Catalog coverage of User Flows (every interactive
  surface in a flow has a catalog row)
- ui Accessibility Targets: every interactive component in the
  catalog has an ARIA label / role entry

#### R4.5 Rollback if audit failed

If any audit item fails:

```
cp .kcc/specs/<slug>/.pre-review/spec.md .kcc/specs/<slug>/spec.md
cp .kcc/specs/<slug>/.pre-review/ui.md   .kcc/specs/<slug>/ui.md
cp .kcc/specs/<slug>/.pre-review/ac.md   .kcc/specs/<slug>/ac.md
```

Then:

- Set final verdict to `request-changes` regardless of the R3 vote.
- Record the failure detail in the `Rewrite` section of review.md
  (step R5): `failed — rewrite aborted (<specific audit failure>)`.

#### R4.6 Accept on clean audit

If every audit line is clean, keep the rewritten spec.md, ui.md, and
ac.md. The `Rewrite` section of review.md will record `applied` with
the list of touched sections (per file).

### Phase R5 — Write review.md

Append (or create) `.kcc/specs/<slug>/review.md`. If the file does not
exist, create it with a top-level header `# Review — <feature-name>`
first, then append.

The appended content MUST begin with `## spec-ac` and contain, in
order:

```markdown
## spec-ac

### Reviewers
- R1: Requirements lens → review-drafts/reviewer-1-round{1,2}.md
- R2: Testability lens  → review-drafts/reviewer-2-round{1,2}.md
- R3: Risk/Architecture lens → review-drafts/reviewer-3-round{1,2}.md
- R4: UX lens → review-drafts/reviewer-4-round{1,2}.md

### Round 2 convergence highlights
- <which round-1 disagreements converged in round-2 and how>
- <which remained contested, and how T4 resolved them>

### Consensus findings

#### Critical
- <finding> — loc: <spec/ui/ac ref> — supported by: R1, R3 — fix: <specific change>
- _none_

#### Major
- _none_

#### Minor
- _none_

#### Nit
- _none_

### Traceability + UI audit (post-round2, pre-rewrite)
- FRs without AC: none — all covered
- USs without AC: none
- NFRs without AC: none
- Edge cases without AC: none
- ACs with dangling `Traces to:`: none
- Orphan ASSUMPTIONs: none
- Open Items ↔ Pending AC alignment: aligned
- ui Component Catalog covers every interactive surface in User Flows: yes
- ui Accessibility Targets per interactive component: complete

### Vote
| Reviewer | Round 1 verdict | Round 2 verdict |
|---|---|---|
| R1 | ... | ... |
| R2 | ... | ... |
| R3 | ... | ... |
| R4 | ... | ... |

### Final verdict
- **Outcome:** approve | approve-with-nits | request-changes
- **Rationale:** <one-line, tied to Consensus findings + audits>

### Rewrite
- **Applied?** yes | no (skipped because verdict = request-changes)
- **Changed spec.md sections:** <list + one-line summary each, or `-` if none>
- **Changed ui.md sections:** <list + one-line summary each, or `-` if none>
- **Changed ac.md sections:** <list + one-line summary each, or `-` if none>
- **Backup location:** .kcc/specs/<slug>/.pre-review/
- **Post-rewrite traceability audit:** all green | failed — rewrite aborted (<detail>)
```

Use `_none_` as the placeholder for empty severity buckets — do not
omit any severity sub-header.

### Phase R6 — Finalize

1. Run the structural self-check below.
2. `TaskUpdate(taskId=T4, status=completed)`.
3. Reply `done` with the output path, then stop.

## Per-reviewer draft schema (what round-1 and round-2 each produce)

```markdown
# Reviewer <N> — <persona name> — Round <R>

## Summary
<1–2 paragraphs of overall take + scope of the audit>

## Findings

### Critical
- <finding> — loc: <ref> — fix: <suggestion>
- _none_

### Major
- _none_

### Minor
- _none_

### Nit
- _none_

## Traceability + UI audit (this reviewer's independent pass)
- FRs without AC: ...
- USs without AC: ...
- NFRs without AC: ...
- Edge cases without AC: ...
- ACs with dangling `Traces to:`: ...
- Orphan ASSUMPTIONs: ...
- Open Items ↔ Pending AC alignment: ...
- ui Component Catalog ↔ User Flows coverage: ...
- ui Accessibility Targets coverage per component: ...

## Verdict
- approve | approve-with-nits | request-changes
- Rationale: <one-line>
```

## Definition of Done

- 8 reviewer drafts exist under `review-drafts/` (4 reviewers × 2 rounds).
- `review.md` exists with a top-level `# Review — <feature-name>` header
  and a `## spec-ac` section containing all 7 sub-sections listed
  above.
- Final verdict is one of `approve` / `approve-with-nits` /
  `request-changes`.
- Verdict is consistent with rules: schema-level consensus issues
  force `request-changes`; majority of round-2 reviewer verdicts
  otherwise; 2-2 tie → most conservative.
- If the Rewrite section says `applied`:
  - `.pre-review/spec.md`, `.pre-review/ui.md`, and `.pre-review/ac.md`
    exist.
  - `review-drafts/rewrite-plan.md` exists.
  - Post-rewrite traceability audit is all green.
- If the Rewrite section says `failed — rewrite aborted`:
  - `spec.md` / `ui.md` / `ac.md` on disk match `.pre-review/` copies
    (rolled back).
  - Final verdict has been downgraded to `request-changes`.
- Task T4 has been marked `completed` via `TaskUpdate`.

## Structural self-check (run before TaskUpdate)

- `review.md` exists; top-level header matches the pattern.
- `## spec-ac` section contains all 7 sub-sections: `### Reviewers`,
  `### Round 2 convergence highlights`, `### Consensus findings`
  (with all four severity sub-headers `#### Critical`, `#### Major`,
  `#### Minor`, `#### Nit`), `### Traceability + UI audit`,
  `### Vote`, `### Final verdict`, `### Rewrite`.
- Every severity bucket has at least one bullet (`_none_` is a valid
  placeholder).
- Vote table has 4 reviewer rows × 2 round columns.
- Final verdict is one of the three allowed values.
- Rewrite section's `Applied?` value matches reality (yes implies
  `.pre-review/` backups for all three files present; no implies
  verdict = request-changes or audit failed).
- No bullet is exactly `TBD`.
- 8 reviewer drafts present on disk (unless reviewers were marked
  absent, in which case each absent reviewer's row in Vote must say
  `absent` and the rule from R3.6 applies).

## Anti-patterns

- **Do not skip Round 2.** Without cross-read, the four reviewers
  don't actually discuss; you're just collecting four parallel
  opinions. Round 2 is the "discuss with each other" step.
- **Do not use identical prompts for R1/R2/R3/R4.** Inject the
  persona directive; otherwise the reviews converge to redundant
  copies of the same findings.
- **Do not rewrite on verdict = request-changes.** The whole point of
  the override is that those problems need upstream iteration.
- **Do not rewrite schema-level issues.** If consensus has any such
  finding, verdict flips to request-changes and rewrite is skipped.
- **Do not skip the post-rewrite audit.** The whole purpose of having
  rewriter subagents is that T4 must verify their output didn't break
  traceability. No audit means no trust.
- **Do not leave `.pre-review/` or `review-drafts/` files stale from
  a prior run.** If either directory has unrelated files, remove them
  before starting Phase R1.
- **Do not modify spec.md / ui.md / ac.md outside of Phase R4.3.**
  The rewriter subagents are the only writers of those files in this
  phase; T4 coordinates but does not edit the files directly.
- **Do not TaskUpdate before self-check passes.**

## Failure modes

- **kickoff.md / spec.md / ac.md missing** — abort with a clear error;
  do not proceed to R1.
- **spec.md or ac.md unparseable** — abort; list every section that
  failed to parse. Upstream-contract violation.
- **A reviewer subagent fails** — retry once. If it fails again, mark
  it absent; downstream vote/consensus uses only the remaining
  reviewers. Absent rule: if only two reviewers remain, they must
  agree for verdict ≠ request-changes; if they disagree, verdict =
  request-changes.
- **Both rewriter subagents fail or return malformed output** — do
  not accept their output; treat as rewrite failure: rollback and
  downgrade verdict to request-changes.
- **Post-rewrite audit fails** — rollback from `.pre-review/`;
  downgrade verdict to request-changes; note the specific audit
  failure in the Rewrite section.

<!-- kcc-dev-workflow-step-spec-ac-reviewer-sentinel: v1 -->
