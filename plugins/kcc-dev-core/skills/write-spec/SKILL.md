---
description: Use when the user asks to 写 spec / 出个技术方案 / 把这个需求写成 spec / 写需求文档 / write a spec / turn this into an engineering spec / spec this feature. Turns a feature idea or PRD fragment in the current context into a single engineer-ready spec.md with a fixed 7-section schema (Summary & Scope / User Stories / Functional Requirements / Non-functional Requirements / System Design / Edge Cases / Open Items). Standalone capability — no workflow, no orchestration, no team.
---

# Writing an engineer-ready spec

Produces **one** `spec.md` from whatever feature description, PRD
fragment, or design discussion is available in the current session.
Self-contained: read context → confirm scope if ambiguous → ground in
the codebase → write → self-check.

Output path: `<project-root>/.kcc/specs/<feature-slug>/spec.md`.
`<feature-slug>` is ASCII-only kebab-case, max 64 chars
(transliterate / summarize CJK rather than preserving it).

## When to use

Trigger phrases: 写 spec / 出个技术方案 / 把这个需求写成 spec / 写需求文档 /
write a spec / turn this into an engineering spec / spec this feature.

### When NOT to use

- Writing acceptance criteria → `kcc-dev-core:write-acceptance-criteria`.
- Writing QA test cases → `kcc-testing:write-test-cases`.
- Pure brainstorming with no committed artifact — stay in conversation.

## Process

### 1. Form a hypothesis

From the session plus any PRD-like material in the repo (`docs/`,
`specs/`, `product/`, `prds/`, …), state in one sentence: *"I think
you want a spec for **X**, based on **Y**."*

### 2. Confirm scope — only if genuinely ambiguous

If the context leaves the feature scope or a load-bearing decision
(one that materially changes the spec) genuinely open, make **one**
`AskUserQuestion` call: your hypothesis as the recommended option plus
up to three candidates, and the one or two decisions you'd otherwise
have to guess. If the context already pins these down, don't
manufacture a question — state your reading in one line and proceed.
Either way, anything left unresolved becomes an `ASSUMPTION:` carried
into Open Items.

### 3. Ground in the codebase

If the project has a codebase, read the parts this feature touches
before designing. System Design must anchor to it — real file paths,
module names, existing signatures; a new component states where it
lives and which existing code it calls. Architecture prose that could
apply to any repo is a defect. If there is no codebase yet, design
freely and note `greenfield` in Architecture.

### 4. Write spec.md

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

Count floors below are calibrated to a typical feature — they are
not quotas. A genuinely small feature may land under one; open that
section with a one-line reason instead of padding. Inventing
requirements to hit a floor is scope creep, strictly worse than an
honest short section.

Section rules:

- **Summary & Scope** — one prose paragraph, then `### In scope` (≥ 2
  bullets) and `### Out of scope` (≥ 2 bullets, each stating what is
  excluded and why).
- **User Stories** — ≥ 3 in the strict format
  `US-NN: As a <persona>, I want to <action>, so that <outcome>.`
  Two-digit zero-padded (US-01, US-02, …).
- **Functional Requirements** — ≥ 5 numbered `FR-NN`. Each atomic
  (one observable behavior), testable, ending with a traceability tag
  `(US-NN, §<source-section>)`.
- **Non-functional Requirements** — ≥ 3 `NFR-NN` covering at least
  one of performance / security / accessibility / i18n / reliability,
  each ending with `(§<source>)` or `(derived from US-NN)`.
- **System Design** — technical architecture, not UI, grounded per
  step 3. Four required sub-sections (use `N/A — <reason>` rather than
  dropping any):
  - `### Architecture` — components, responsibilities, how they fit.
  - `### Data Model` — entities, fields, relationships.
  - `### API / Interface` — endpoints, signatures, event shapes.
  - `### State Machine` — system-side states. If ≥ 2 observable states,
    give a Mermaid `stateDiagram-v2` or `graph TD`; otherwise
    `N/A — stateless` with a one-line reason.
- **Edge Cases & Error Handling** — ≥ 5 entries in
  `when X happens, system does Y` form.
- **Open Items** — `### Resolved` (each citing the source that answered
  it) and `### Carried forward` (each a `[open|blocked|deferred]` tag +
  the question). Before carrying an item forward, if a quick check of
  official docs or the codebase settles it (an API capability, a
  version bound), do the check and file it under `### Resolved` with
  the source; only product decisions and genuinely open questions are
  carried forward. Every `ASSUMPTION:` from step 2 lives here.

ASSUMPTION discipline: any FR / US depending on an unconfirmed decision
carries an inline `[ASSUMED: <content>]` marker AND a
`### Carried forward` entry. Promote to `### Resolved` only when the
source material actually answers it. Inventing features not grounded
in the input is scope creep — put them in Out of scope or Open Items.

### 5. Self-check & report

Re-verify every hard rule above — headers and order, sub-sections,
formats, count floors (or their stated one-line reasons), ASSUMPTION
pairing — and fix inline. Then report: the output path plus one line
of counts (US / FR / NFR / edge cases) and how many items were
carried forward unresolved.

<!-- kcc-dev-core-write-spec-sentinel: v2 -->
