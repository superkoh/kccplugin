# kcc-dev-workflow

A two-part dev workflow plugin for the kccplugin marketplace.

## Part 1 — `plan-feature` (v0.1.1, engineer-ready)

Orchestrates an end-to-end planning workflow that turns a feature idea
into four artifacts:

- `.kcc/specs/<slug>/kickoff.md` — structured brainstorm (Metadata +
  Original material + 7 thinking sections)
- `.kcc/specs/<slug>/spec.md` — engineer-ready spec (7 sections incl.
  System Design with Architecture / Data Model / API / State Machine)
- `.kcc/specs/<slug>/ac.md` — Gherkin-strict acceptance criteria,
  grouped into Functional / Non-functional / Edge Cases with Traces-to
- `.kcc/tests/cases/<slug>.yaml` — QA test cases, kcc-testing
  schema-compatible
- `.kcc/specs/<slug>/review.md` — multi-agent peer review with
  consensus + vote + conditional rewrite, covering both `## spec-ac`
  and `## test-cases` sections

### Workflow

**Phase 0 — Brainstorm (main session)**. `step-brainstorm` handles the
only interactive step: silent context scan of the repo, 3 routing
questions (feature / input material / platform), then either leverages
`superpowers:brainstorming` when present (Path A, scoped to items 1–5)
or runs an inline probing flow (Path B). Writes the 9-section
`kickoff.md`.

**Team phase — 5 teammates (T1..T5)** run in the `dev-plan-<slug>`
team, each owning one production step:

1. **T1 `step-spec-writer`** — synthesizes `spec.md` from kickoff.
   Leverages `superpowers:brainstorming` item 6 when present (Path A)
   or inline synthesis (Path B). ASSUMPTION markers propagate
   explicitly; schema is 7 sections, System Design has 4 mandatory
   sub-sections.
2. **T2 `step-ac-writer`** — Gherkin-strict AC with three groups
   (Functional / Non-functional / Edge Cases), numbered AC-F / AC-N /
   AC-E, every FR / US / NFR / edge case covered at least once, with
   `Traces to:` citations.
3. **T3 `step-spec-ac-reviewer`** — **multi-agent review + vote**: 3
   reviewer subagents (Requirements / Testability / Risk-Architecture
   lenses) × 2 rounds (independent + cross-read rebuttal) → consensus
   synthesis → vote. If verdict ≤ `approve-with-nits`, applies
   consensus edits to `spec.md` and `ac.md` via two parallel rewriter
   subagents, guarded by pre-backup and post-rewrite traceability
   audit (rollback on audit failure).
4. **T4 `step-test-case-writer`** — derives kcc-testing's Step 2
   answers from spec + kickoff (no user interaction), then either
   invokes `kcc-testing:write-test-cases` with a scope override that
   skips its Step 2 AskUserQuestion (Path A) or generates a
   minimum-viable kcc-testing-compatible YAML inline (Path B).
5. **T5 `step-test-case-reviewer`** — same multi-agent +
   vote + conditional rewrite pattern as T3, but personas are
   Coverage / Testability / Quality lenses and the rewriter target is
   the YAML test-case file, gated by kcc-testing-compatible post-
   rewrite lint.

All 5 team tasks chain linearly (T1 → T2 → T3 → T4 → T5). Teammates
use the `general-purpose` agent type with the `opus` model; reviewer
and rewriter subagents follow the same pattern.

### Conditional leverage of companion plugins

The plugin stays useful standalone, and uses companion plugins when
they are present in the session:

| Companion | Leveraged by | Mechanism |
|---|---|---|
| `superpowers:brainstorming` | Phase 0 and T1 | Scope override: execute subset of its checklist, do NOT write `docs/superpowers/specs/`, do NOT invoke `writing-plans` |
| `kcc-testing:write-test-cases` | T4 | Scope override: pre-supplies answers for its Step 2 AskUserQuestion; teammate context has no user access |

When a companion is missing, each step falls through to a
self-contained inline path (Path B). Silent fallback is forbidden —
teammate replies always state `fell back to Path B (reason: …)`.

### Artifact layout

```
.kcc/specs/<slug>/
├── kickoff.md
├── spec.md
├── ac.md
├── review.md
├── .pre-review/
│   ├── spec.md                   (backup, iff T3 rewrite applied)
│   ├── ac.md                     (backup, iff T3 rewrite applied)
│   └── tests-cases-<slug>.yaml   (backup, iff T5 rewrite applied)
└── review-drafts/
    ├── reviewer-<N>-round<R>.md        (6 files, T3)
    ├── tc-reviewer-<N>-round<R>.md     (6 files, T5)
    ├── rewrite-plan.md                 (iff T3 rewrite applied)
    └── tc-rewrite-plan.md              (iff T5 rewrite applied)
.kcc/tests/cases/<slug>.yaml
```

### Invoke

Ask Claude any of:

- "帮我规划 <feature> 这个功能"
- "写 spec 和测试用例"
- "plan this feature"

The orchestrator then delegates Phase 0 to `step-brainstorm` (which
handles the feature / platform / input-material questions) and chains
the 5 teammate steps end-to-end.

## Part 2 — `build-feature` (placeholder)

Not yet implemented. Invoking it today returns a TODO notice pointing
back to `plan-feature`. Intended to consume `spec.md` + `ac.md` +
`<slug>.yaml` and drive implementation.
