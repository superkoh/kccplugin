---
description: Use when the user asks to 写 spec / 出个技术方案 / 把这个需求写成 spec / 写需求文档 / write a spec / turn this into an engineering spec / spec this feature. Turns a feature idea or PRD fragment in the current context into a single engineer-ready spec.md with a fixed 7-section schema (Summary & Scope / User Stories / Functional Requirements / Non-functional Requirements / System Design / Edge Cases / Open Items). Standalone capability — no workflow, no orchestration, no team.
---

# Writing an engineer-ready spec

Produces **one** `spec.md` from whatever feature description, PRD
fragment, or design discussion is available in the current session.
Self-contained: read context → confirm scope → write → self-check.

Output path: `<project-root>/.kcc/specs/<feature-slug>/spec.md`.
`<feature-slug>` is ASCII-only kebab-case, max 64 chars
(transliterate / summarize CJK rather than preserving it).

## When to use

Trigger phrases: 写 spec / 出个技术方案 / 把这个需求写成 spec / 写需求文档 /
write a spec / turn this into an engineering spec / spec this feature.

### When NOT to use

- Writing acceptance criteria → `kcc-dev-core:write-acceptance-criteria`.
- Writing QA test cases → `kcc-testing:write-test-cases`.
- Decomposing an existing UI artifact → `kcc-design:decompose-design`.
- Pure brainstorming with no committed artifact — stay in conversation.

## Process

### 1. Scan context, draft a hypothesis

Without asking, read the last ~20 turns for the feature / goals /
constraints / PRD fragments, plus recently opened or edited files under
`docs/`, `specs/`, `product/`, `prds/`, and the repo root for a PRD-like
directory. Emit one sentence: *"I think you want a spec for **X**, based
on **Y**."*

### 2. Confirm scope with `AskUserQuestion`

Single call: the feature scope (your hypothesis as the recommended
option + up to three other candidates), plus surface any **load-bearing
assumption** you'd otherwise have to guess (the one or two decisions
that most change the spec). Anything the user doesn't resolve becomes
an `ASSUMPTION:` carried into Open Items.

### 3. Write spec.md

Exactly these seven `##` headers, in order:

```
## Summary & Scope
## User Stories
## Functional Requirements
## Non-functional Requirements
## System Design
## Edge Cases & Error Handling
## Open Items
```

Section rules:

- **Summary & Scope** — one prose paragraph, then `### In scope` (≥ 2
  bullets) and `### Out of scope` (≥ 2 bullets, each stating what is
  excluded and why).
- **User Stories** — **≥ 3** in the strict format
  `US-NN: As a <persona>, I want to <action>, so that <outcome>.`
  Two-digit zero-padded (US-01, US-02, …).
- **Functional Requirements** — **≥ 5** numbered `FR-NN`. Each atomic
  (one observable behavior), testable, ending with a traceability tag
  `(US-NN, §<source-section>)`.
- **Non-functional Requirements** — **≥ 3** `NFR-NN` covering at least
  one of performance / security / accessibility / i18n / reliability,
  each ending with `(§<source>)` or `(derived from US-NN)`.
- **System Design** — technical architecture, not UI. Four required
  sub-sections (use `N/A — <reason>` rather than dropping any):
  - `### Architecture` — components, responsibilities, how they fit.
  - `### Data Model` — entities, fields, relationships.
  - `### API / Interface` — endpoints, signatures, event shapes.
  - `### State Machine` — system-side states. If ≥ 2 observable states,
    give a Mermaid `stateDiagram-v2` or `graph TD`; otherwise
    `N/A — stateless` with a one-line reason.
- **Edge Cases & Error Handling** — **≥ 5** entries in
  `when X happens, system does Y` form.
- **Open Items** — `### Resolved` (each citing the source that answered
  it) and `### Carried forward` (each a `[open|blocked|deferred]` tag +
  the question). Every `ASSUMPTION:` from step 2 lives here.

ASSUMPTION discipline: any FR / US depending on an unconfirmed decision
carries an inline `[ASSUMED: <content>]` marker AND a
`### Carried forward` entry. Promote to `### Resolved` only when the
source material actually answers it. Inventing features not grounded
in the input is scope creep — put them in Out of scope or Open Items.

### 4. Structural self-check

Before reporting done: exactly 7 `##` headers in order; System Design
has all four sub-sections; ≥ 3 US (all in format); ≥ 5 FR (each with a
trace tag); ≥ 3 NFR (each with a rationale source); ≥ 5 edge cases;
In/Out scope ≥ 2 bullets each; no bullet is bare `TBD`; every
`ASSUMPTION:` is paired with a `[ASSUMED: …]` marker and a
Carried-forward entry. Fix inline before reporting.

### 5. Report

State the output path and a one-line summary: counts of US / FR / NFR /
edge cases, and how many items were carried forward unresolved.

<!-- kcc-dev-core-write-spec-sentinel: v1 -->
