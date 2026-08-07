---
description: Use when the user asks to 写 spec / 出个技术方案 / 把这个需求写成 spec / 写需求文档 / write a spec / turn this into an engineering spec / spec this feature. Turns a feature idea or PRD fragment in the current context into a single engineer-ready spec document with a fixed 7-section schema (Summary & Scope / User Stories / Functional Requirements / Non-functional Requirements / System Design / Edge Cases / Open Items). Standalone capability — no workflow, no orchestration, no team.
---
# Writing an engineer-ready spec

The failure this skill exists to prevent is the ungrounded spec — architecture prose that could apply to any repo, and requirements invented rather than traced to the input.

## Principles

- **One spec document** — Produce exactly one spec document, not a set of documents.
- **Location by project convention** — Choose the spec's location and filename from the project's own conventions, and keep them stable so later stages can find the spec.
- **Feature slug** — Name the feature's artifacts with one slug that is ASCII-only kebab-case at most 64 characters, transliterating or summarizing a CJK feature name rather than preserving it.
- **Black-box cases are elsewhere** — A request for black-box test cases belongs to `kcc-dev-core:blackbox-tests`, not here.
- **Brainstorming stays in conversation** — Pure brainstorming with no committed artifact produces no file.
- **Read the repo's PRDs too** — Source the spec from the session plus any PRD-like material in the repo (`docs/`, `specs/`, `product/`, `prds/`, …).
- **Ask only if genuinely ambiguous** — Make the `AskUserQuestion` call only when the context leaves the feature scope or a decision that materially changes the spec genuinely open, and don't manufacture a question the context already answers.
- **One question, not a series** — When you do ask, make exactly one `AskUserQuestion` call before writing, carrying both the scope choice and the one or two decisions you would otherwise have to guess, with your own reading offered as the recommended option plus up to three candidates.
- **Unresolved becomes ASSUMPTION** — Anything left unresolved after that becomes an `ASSUMPTION:` carried into Open Items.
- **Ground in the codebase** — When the project has a codebase, read the parts this feature touches before designing anything.
- **Anchor System Design to real code** — System Design cites real file paths, module names, and existing signatures.
- **New components declare their seams** — A new component states where it lives and which existing code it calls.
- **Greenfield is declared** — With no codebase yet, design freely and note `greenfield` in Architecture.
- **Exactly seven sections** — The spec carries exactly the seven `##` headers listed under Output format, with none added and none missing.
- **Sections keep their order** — Those seven headers appear in the order listed.
- **Under a floor, say why** — The count floors below are calibrated to a typical feature rather than targets to hit, so a genuinely small feature may land under one when that section opens with a one-line reason instead of padding.
- **Scope is split both ways** — `### In scope` and `### Out of scope` each carry at least two bullets.
- **Exclusions carry a reason** — Each `### Out of scope` bullet states what is excluded and why.
- **At least three user stories** — User Stories carries at least three entries.
- **Story format is strict** — Each story reads `US-NN: As a <persona>, I want to <action>, so that <outcome>.` with a two-digit zero-padded number (US-01, US-02, …).
- **At least five functional requirements** — Functional Requirements carries at least five entries.
- **FR IDs are numbered** — Each functional requirement is numbered `FR-NN`.
- **One behavior per requirement** — Each functional requirement is atomic, covering exactly one observable behavior.
- **Requirements trace to a source** — Each functional requirement ends with a traceability tag `(US-NN, §<source-section>)`, and each non-functional requirement with `(§<source>)` or `(derived from US-NN)`.
- **At least three NFRs** — Non-functional Requirements carries at least three entries.
- **NFR IDs are numbered** — Each non-functional requirement is numbered `NFR-NN`.
- **NFRs cover a real category** — The non-functional requirements cover at least one of performance, security, accessibility, i18n, or reliability.
- **System Design is technical, not UI** — System Design describes technical architecture rather than user interface.
- **All four sub-sections appear** — System Design carries `### Architecture` (the components, their responsibilities, and how they fit together), `### Data Model` (entities, fields, and relationships), `### API / Interface` (endpoints, signatures, and event shapes), and `### State Machine` (system-side states).
- **Inapplicable is N/A, never absent** — A sub-section that does not apply is written `N/A — <reason>` rather than dropped.
- **Two states earn a diagram** — With two or more observable states, render a Mermaid `stateDiagram-v2` or `graph TD`, and with fewer write `N/A — stateless` plus a one-line reason.
- **At least five edge cases** — Edge Cases & Error Handling carries at least five entries.
- **Edge cases name the response** — Each edge case is written `when X happens, system does Y`.
- **Open Items splits two ways** — Open Items carries `### Resolved` and `### Carried forward`.
- **Resolved cites its source** — Each `### Resolved` entry cites the source that answered it.
- **Carried forward is tagged** — Each `### Carried forward` entry opens with an `[open|blocked|deferred]` tag followed by the question.
- **Check before carrying forward** — When a quick check of official docs or the codebase would settle an item (an API capability, a version bound), do the check and file it under `### Resolved` with the source, so that only product decisions and genuinely open questions carry forward.
- **Assumptions are marked twice** — Any FR or US depending on an unconfirmed decision carries an inline `[ASSUMED: <content>]` marker and a matching `### Carried forward` entry.
- **Ungrounded features are scope creep** — Inventing features not grounded in the input is scope creep, so park them in `### Out of scope` or Open Items instead of speccing them.
- **Re-verify every rule** — After writing, re-check headers and order, sub-sections, formats, count floors or their stated one-line reasons, and ASSUMPTION pairing.
- **Fix defects in place** — Repair whatever that check finds inline rather than reporting it as a known gap.
- **Report the path** — The closing report gives the output path.
- **Report the counts** — The closing report gives one line of counts — US, FR, NFR, edge cases — and how many items were carried forward unresolved.

## Output format

```
## Summary & Scope
## User Stories
## Functional Requirements
## Non-functional Requirements
## System Design
## Edge Cases & Error Handling
## Open Items
```

<!-- kcc-dev-core-spec-sentinel: v1 -->
