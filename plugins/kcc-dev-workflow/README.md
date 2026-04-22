# kcc-dev-workflow

A two-part dev workflow plugin for the kccplugin marketplace.

## Part 1 — `plan-feature` (v0.1.4, engineer-ready, resumable, UI/UX-aware)

Orchestrates an end-to-end planning workflow that turns a feature idea
into six artifacts:

- `.kcc/specs/<slug>/kickoff.md` — structured brainstorm (Metadata +
  Original material + **10 sections incl. §UX Direction**)
- `.kcc/specs/<slug>/ui-kickoff.html` — **conditional, UI-surface
  features only**: user-approved self-contained HTML style reference
  (palette swatches, typography specimens, density tokens, sample
  components, anti-pattern callouts). Produced via an unbounded
  Approve/Request-changes/Abort discussion loop during Phase 0.
- `.kcc/specs/<slug>/spec.md` — engineer-ready spec (7 sections incl.
  technical System Design with Architecture / Data Model / API /
  system-side State Machine)
- `.kcc/specs/<slug>/ui.md` — UI/UX design (7 sections: Summary & UI
  Scope / User Flows in Mermaid / Component Catalog / Interaction
  Specs / Visual Hierarchy & Design Tokens / Accessibility Targets /
  Open UX Questions) — a **faithful implementation** of kickoff
  §UX Direction + ui-kickoff.html, not a fresh invention.
- `.kcc/specs/<slug>/ac.md` — Gherkin-strict acceptance criteria,
  grouped into Functional / Non-functional / Edge Cases with Traces-to
- `.kcc/tests/cases/<slug>.yaml` — QA test cases, kcc-testing
  schema-compatible
- `.kcc/specs/<slug>/review.md` — multi-agent peer review with
  consensus + vote + conditional rewrite, covering both `## spec-ac`
  (scope: spec + ui + ac; UX lens audits HTML faithfulness) and
  `## test-cases` sections

### Workflow

**Phase 0 — Brainstorm (main session)**. `step-brainstorm` handles
all interactive steps with the user:

1. Silent context scan + 3 routing questions (feature / input material
   / platform).
2. Main brainstorm via Path A (leverages `superpowers:brainstorming`
   items 1–5 with a scope override) or Path B (inline probing).
3. **UX Visual Direction sub-phase** (conditional on platform + UI
   signals). AskUserQuestion probes UX posture / palette / typography
   / density / interaction archetype / anti-patterns → skill
   generates a self-contained `ui-kickoff.html` → pushes to
   `kcc-preview` (if available) so the user sees it rendered in
   browser → **unbounded loop**: user picks Approve / Request changes
   (free text) / Abort. Request-changes feedback is applied to the
   HTML and the loop re-asks; no round cap. Soft nudge appears after
   ≥3 iterations on the same dimension. Only Approve or Abort exits.

Writes the 10-section `kickoff.md` (with populated `## UX Direction`
referencing the approved HTML) and — when the sub-phase ran —
`ui-kickoff.html`.

**Team phase — 6 teammates (T1..T6)** run in the `dev-plan-<slug>`
team, each owning one production step:

1. **T1 `step-spec-writer`** — synthesizes `spec.md` from kickoff.
   Leverages `superpowers:brainstorming` item 6 when present (Path A)
   or inline synthesis (Path B). ASSUMPTION markers propagate
   explicitly; 7 sections with 4 mandatory System Design sub-sections.
   System Design is **technical architecture only**; UI/UX concerns
   move to T2.
2. **T2 `step-ui-ux-designer`** — produces `ui.md` from kickoff +
   spec + `ui-kickoff.html` (if present): Summary & UI Scope, User
   Flows (Mermaid), Component Catalog (table: Component / States /
   Events / Emits), Interaction Specs (event → reaction + feedback
   latency + failure mode), Visual Hierarchy & Design Tokens (hex /
   typography / density drawn from the HTML), Accessibility Targets
   (WCAG level + keyboard order + screen-reader labels), Open UX
   Questions. **Faithfulness rule**: ui.md is a disciplined
   implementation of kickoff §UX Direction + ui-kickoff.html, not a
   fresh invention; no kickoff anti-pattern may appear in ui.md (hard
   reject at self-check). Path B only.
3. **T3 `step-ac-writer`** — Gherkin-strict AC with three groups
   (Functional / Non-functional / Edge Cases), numbered AC-F / AC-N /
   AC-E, every FR / US / NFR / edge case covered at least once. AC
   may additionally cite `ui §Component <Name>` or `ui §User Flows
   #<N>` to anchor to specific UI contracts.
4. **T4 `step-spec-ac-reviewer`** — **multi-agent review + vote**: 4
   reviewer subagents (Requirements / Testability / Risk-Architecture
   / UX lenses) × 2 rounds (independent + cross-read rebuttal) →
   consensus synthesis → vote. The **UX lens** also audits
   faithfulness: does ui.md actually implement kickoff §UX Direction
   and the approved `ui-kickoff.html` (palette / typography / density
   / anti-patterns)? Drift is Major; any anti-pattern appearance is
   Critical. If verdict ≤ `approve-with-nits`, applies consensus
   edits to `spec.md`, `ui.md`, and `ac.md` via up to three parallel
   rewriter subagents (rewriter-spec / rewriter-ui / rewriter-ac),
   guarded by pre-backup and post-rewrite traceability + UI audit
   (rollback on audit failure). Review section name stays `## spec-ac`
   for stability; scope covers all three upstream files.
5. **T5 `step-test-case-writer`** — derives kcc-testing's Step 2
   answers from ui.md (primary source for `ui_change`) + kickoff +
   spec (no user interaction). `design_tokens_source` prefers
   `ui-kickoff.html` when present (it carries concrete palette and
   typography approved by the user), falling back to ui.md's Visual
   Hierarchy cite, then spec's Architecture cite, then `null`. Path A
   invokes `kcc-testing:write-test-cases` with a scope override that
   skips its Step 2 AskUserQuestion; Path B generates minimum-viable
   kcc-testing-compatible YAML inline. `requirement_ref` may cite ui
   entries.
6. **T6 `step-test-case-reviewer`** — same multi-agent + vote +
   conditional rewrite pattern as T4, but personas are Coverage /
   Testability / Quality lenses and the rewriter target is the YAML
   test-case file, gated by kcc-testing-compatible post-rewrite lint.

All 6 team tasks chain linearly (T1 → T2 → T3 → T4 → T5 → T6).
Teammates use the `general-purpose` agent type with the `opus` model;
reviewer and rewriter subagents follow the same pattern.

### Resume support

The plugin is **artifact-driven and resumable**. If a session is
interrupted mid-run, re-invoking `plan-feature` against the same
feature picks up from the last completed step rather than restarting.

- **Phase -1 preflight** scans `.kcc/specs/` for prior `kickoff.md`
  files, matches them against conversation context, and offers Resume
  / Start fresh / Abort via `AskUserQuestion` when a candidate is
  detected.
- **Phase 1 is idempotent**: existing team / existing T1..T6 are
  reused; only missing pieces are created.
- **Phase 2 skips completed steps**: per-step resume check reads task
  status and verifies the artifact matches before spawning teammates.
- **Each step skill has its own idempotence check** as a second line
  of defense against drift (task marked completed but artifact gone,
  or artifact present but task not marked).

No separate state file — task status + filesystem artifacts are the
single source of truth. Detection is purely artifact-driven.

### Conditional leverage of companion plugins

The plugin stays useful standalone, and uses companion plugins when
they are present in the session:

| Companion | Leveraged by | Mechanism |
|---|---|---|
| `superpowers:brainstorming` | Phase 0 and T1 | Scope override: execute subset of its checklist, do NOT write `docs/superpowers/specs/`, do NOT invoke `writing-plans` |
| `kcc-testing:write-test-cases` | T5 | Scope override: pre-supplies answers for its Step 2 AskUserQuestion; teammate context has no user access |

When a companion is missing, each step falls through to a
self-contained inline path (Path B). Silent fallback is forbidden —
teammate replies always state `fell back to Path B (reason: …)`.

### Artifact layout

```
.kcc/specs/<slug>/
├── kickoff.md                           (10 sections incl. §UX Direction)
├── ui-kickoff.html                      (conditional — UI-surface features only)
├── spec.md                              (T4 may rewrite in place)
├── ui.md                                (T4 may rewrite in place)
├── ac.md                                (T4 may rewrite in place)
├── review.md
├── .pre-review/
│   ├── spec.md                          (backup, iff T4 rewrite applied)
│   ├── ui.md                            (backup, iff T4 rewrite applied)
│   ├── ac.md                            (backup, iff T4 rewrite applied)
│   └── tests-cases-<slug>.yaml          (backup, iff T6 rewrite applied)
└── review-drafts/
    ├── reviewer-<N>-round<R>.md         (8 files, T4 — 4 personas × 2 rounds)
    ├── tc-reviewer-<N>-round<R>.md      (6 files, T6 — 3 personas × 2 rounds)
    ├── rewrite-plan.md                  (iff T4 rewrite applied)
    └── tc-rewrite-plan.md               (iff T6 rewrite applied)
.kcc/tests/cases/<slug>.yaml
```

### Invoke

Ask Claude any of:

- "帮我规划 <feature> 这个功能"
- "写 spec 和测试用例"
- "plan this feature"

The orchestrator then delegates Phase 0 to `step-brainstorm` (which
handles the feature / platform / input-material questions) and chains
the 6 teammate steps end-to-end.

## Part 2 — `build-feature` (placeholder)

Not yet implemented. Invoking it today returns a TODO notice pointing
back to `plan-feature`. Intended to consume `spec.md` + `ui.md` +
`ac.md` + `<slug>.yaml` and drive implementation.
