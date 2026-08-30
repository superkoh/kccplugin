---
description: Use when the user asks to 写黑盒测试 / 写黑盒用例 / 把 spec 转成黑盒用例 / 写验收标准 / 出 AC / 落地黑盒测试 / 把黑盒用例落成代码 / 写黑盒测试代码 / 生成黑盒测试代码 / write black-box test cases / cover this spec with black-box tests / write acceptance criteria / materialize black-box tests / turn the black-box cases file into runnable test code / implement the black-box test suite. Before any implementation exists, turns the requirements in context into one cases file of implementation-independent cases — grouped Main Flow / Corner Cases / Non-functional, each traced to a requirement and tagged automated or llm-driven — then turns the automated ones into a runnable isolated test project, lints the black-box boundary, runs the suite red, and classifies every case as expected-red / broken-test / unexpected-green. Unit tests and any other white-box tests (写单测 / write unit tests) are kcc-dev-core.unit-tests. Standalone capability — no workflow, no orchestration, no team.
---

# Writing and materializing black-box tests

The failure this skill exists to prevent is the case that cannot go red — one bound to how the system happens to be built, or one asserting an outcome no wrong implementation could violate — and the suite that looks black-box while reaching into the implementation.

## Principles

### Writing the cases

- **Requirements only** — Every case derives from the requirements in context and from nothing else.
- **Never read implementation** — Never open the implementation the cases will be run against, and when the change targets an existing product, that product's code is equally off-limits.
- **One cases file** — Write all cases to one file whose location and name follow the project's own conventions, and keep both stable, because materializing reads back that same file and parses what is inside.
- **Sibling slug** — A sibling spec document lends its slug, and the cases file sits beside the spec it derives from.
- **Coined slug** — With no sibling spec to borrow from, coin a slug that is ASCII kebab-case and at most 64 characters.
- **Definition of Done** — Every case passing is the task's Definition of Done.
- **No invented endpoints** — Cases use no invented endpoints.
- **Unpinned surface** — A case whose surface the requirements leave unpinned moves to `## Pending cases`.
- **Given names its surface** — Every **Given** names the surface that prepares it, because a bare state assertion such as "a paid order exists" is not a **Given** whereas the call that creates one is.
- **Decidable Then** — Every **Then** is pass/fail-decidable in requirement language.
- **Unfailable Then is not a case** — A **Then** that cannot fail is not a case.
- **No vague oracle** — "works correctly", "same as before", "document the actual behavior", and "pin whatever it does today" are notes, not **Then** clauses.
- **Unquantified NFR** — An NFR with no number in the spec → Pending, never an invented threshold, while a performance **Then** asserts the spec's own NFR number.
- **Locale oracle** — Locale oracles assert format rules, not literals.
- **UI target** — UI targets are role plus visible label.
- **Boundary pair** — Every input the requirements bound earns a case at the cap and one past it.
- **Empty value** — Every input the requirements bound also earns a case for the empty value.
- **Red-first** — Every case fails until the requirement is implemented.
- **Pre-implementation green** — The one exception is a case pinning unchanged existing behavior, marked `[PRE-IMPL: green — existing behavior]`.
- **Omission sweep** — At `Depth: full`, sweep for what this spec omits, starting with the three angles that cost money — a focused pass skips that sweep.
- **Idempotency angle** — Repeat the same mutating action twice and assert that it produced exactly one effect.
- **Concurrency angle** — Put two actors on one resource at once and assert the invariant of one winner and no lost update.
- **Never timing or ordering** — Assert the invariant, never timing or ordering.
- **Privilege angle** — Cover the lower-privileged actor attempting the privileged action.
- **Privilege oracle** — Assert both the rejection and that nothing changed.
- **Text-encoding angle** — Sweep unicode homoglyph / BiDi / normalization on free-text inputs.
- **Localization angle** — Sweep i18n expansion and RTL.
- **Keyboard angle** — Sweep keyboard-only traversal.
- **Focused depth** — `Depth: focused` when the change touches one surface with no new persistence, concurrency, money, or permissions, covering the main flow plus the corner cases the requirements name, and `Depth: full` for every change that condition does not describe.
- **Tie-break** — When in doubt, full.
- **Closing reviewer** — Close with one fresh-context reviewer subagent carrying only the requirements and the draft, ask it what user-visible behavior could break with no case going red, and turn its findings into cases or Pending entries.
- **Reviewer at both depths** — Run it at both depths, because a simple surface predicts nothing about whether the requirements have holes.
- **Reproduce the shape** — Reproduce the output shape below exactly, with `Setup:` and `Cleanup:`, when present, sitting between `Surface:` and **Given**.
- **Depth line** — `Depth:` carries exactly `focused` or `full` — no trailing prose.
- **Trace identifiers** — `Traces to:` names every requirement the case covers by that requirement's own identifier — `FR-NN`, `US-NN`, `NFR-NN`, or `§Edge Cases item #N` — and any `[ASSUMED: …]` / `[PRE-IMPL: …]` / `[EXTERNAL-SETUP: …]` marker for the case rides on the same line.
- **Automated mode** — `Mode: automated` when the check is deterministic at contract level, and `llm-driven` when deciding the check needs page- or flow-level judgment.
- **Prefer automated** — Prefer automated, because this plugin ships no llm-driven executor.
- **Pending entries** — `## Pending cases` appears only when open items or unpinned surfaces exist, holding sketches with no BB-ID and no seven fields, which is why materializing skips them when splitting by `Mode:`.
- **No HTML comments** — When emitting the cases file, write no HTML comments into it.
- **Report the path** — Report the path written, the depth and what triggered it, the per-group case counts, and every gap flagged back to the spec.

### Materializing them

- **Automated cases only** — Materialize only the `Mode: automated` cases of the reviewed cases file.
- **llm-driven stays in the file** — A `Mode: llm-driven` case is deliberately left unmaterialized and stays in the cases file for a human or an LLM agent to run.
- **Before implementation** — Write the test code before any implementation of the feature exists.
- **Pipeline order** — Follow the order read → confirm → scaffold → write → lint → review → red-run → report.
- **White-box tests are elsewhere** — Unit tests and any other white-box tests are written during implementation by `kcc-dev-core.unit-tests`.
- **Read it in full** — Read the cases file in full before materializing anything.
- **Read the sibling spec** — Read the sibling spec for the surface contracts whenever it exists.
- **Surface line is the fallback contract** — Without a spec, each case's `Surface:` text is the contract.
- **Missing depth means full** — A file with no `Depth:` line counts as `full`.
- **Nothing automated, report only** — A cases file holding no `Mode: automated` case skips scaffolding through the red run and produces the report alone.
- **Confirm with AskUserQuestion** — Confirm the run's unsettled inputs through `AskUserQuestion` instead of assuming them.
- **Case review** — Ask on every run whether a human has read the cases, because it is a property of these cases, not of the repo.
- **Known-wrong inputs stop the run** — Only unresolved `## Pending cases` or `[ASSUMED: …]` markers stop the run, because those are known-wrong inputs rather than unreviewed ones.
- **First run only** — Ask about test project location and harness only on the first run in a repo.
- **Propose the location** — Propose 1–3 test project locations derived from this repo's own conventions — existing test layout, language, build tooling — with your recommendation first.
- **Confirm the target environment** — Confirm the target environment as a base URL, app entry, and credentials source, or as "no environment yet".
- **Isolation is non-negotiable** — Wherever the test project lands, it must be an isolated package with its own dependency manifest and lockfile and zero imports from implementation source.
- **Extend, do not re-scaffold** — After the first run, and whenever the repo already has a suite meeting the isolation constraint, extend it instead of standing up a second one.
- **One file group per slug** — Organize the tests as one file group per feature slug.
- **One test per case** — Write exactly one test per `Mode: automated` case, named so that the name carries that case's BB-ID.
- **Assert nothing beyond Then** — A case's **When** becomes the test's action and its **Then** the assertions, with nothing asserted beyond them.
- **Oracles from case text** — Every oracle must be decidable from the case text alone.
- **Carry PRE-IMPL annotations** — Carry `[PRE-IMPL: green — existing behavior]` annotations into the test as a comment or metadata so the red-run classifier knows what to expect.
- **Blocked external setup is not materialized** — A case marked `[EXTERNAL-SETUP: blocked — <reason>]` is not materialized, listed as blocked in the report so the user decides whether to approve a documented fixture backdoor.
- **Lint the boundary** — Run the black-box lint over the written tests before running them.
- **No reference into the system under test** — The lint fails on any path or module reference from the test project into the system under test.
- **No internal clients** — The lint fails on any database client, ORM, or internal queue client in setup or cleanup.
- **Exactly one test per BB-ID** — The lint fails when an automated BB-ID has no test or carries more than one, and no test exists without a BB-ID.
- **Conformance review triggers** — The conformance review is required when the batch exceeds ~10 tests, when depth is `full`, or when any case involves concurrency, money, or permissions.
- **One fresh-context reviewer** — The conformance review is a single reviewer subagent spawned with fresh context.
- **Per-test review question** — Ask the reviewer, per test, whether it asserts exactly its case's **Then**, prepares exactly its **Given** and `Setup:`, tears down exactly its `Cleanup:`, and nothing more or less.
- **Fix findings before running** — Fix every review finding before running the suite.
- **Self-review below the bar** — Below the reviewer bar, run the same conformance check yourself.
- **expected-red** — Every case's red-run outcome is classified, and a case that fails because the surface or behavior doesn't exist yet is `expected-red`, the healthy state to record.
- **broken-test** — A crash, config error, syntax error, or harness timeout is `broken-test`, fixed on the spot and rerun.
- **unexpected-green** — A case that passes before the implementation exists is `unexpected-green`, legitimate if and only if that case is annotated `[PRE-IMPL: green]`, and otherwise a sign that the assertion is vacuous or the case is not testing the new behavior, so investigate it and report what you found.
- **Degrade without an environment** — With no environment yet, degrade the red run to a compile or dry-run plus the lint, mark the red run `deferred`, and make running it the first act of the implementation phase.
- **Persist the status file** — Write the per-case status table to a status file beside the cases file so the execution state survives the session.
- **Status table columns** — The status table carries BB-ID, status, and reason for each case.
- **Report the table** — Report the status table back at the end of the run.
- **Report the not-materialized** — Report as not materialized every `llm-driven` case and every case blocked by `[EXTERNAL-SETUP: blocked — <reason>]`, each with the reason it was left behind.
- **Report the exceptions** — Report every `deferred` red run, every lint exception, every conformance-review finding, and whether the conformance reviewer was skipped.
- **State the test project path** — State the test project path in the report.

## Output format

```markdown
# Black-box Test Cases — <feature-name>

Depth: full

## Main Flow

### BB-M01: <short title>
- Traces to: FR-03, US-02
- Priority: P0
- Mode: automated
- Surface: `POST /orders` (spec §System Design)
- **Given** <state, prepared through external surfaces>
- **When** <action on the surface>
- **Then** <observable outcome>

## Corner Cases

### BB-C01: <short title>
- Traces to: §Edge Cases item #3
- Priority: P1
- Mode: llm-driven
- Surface: checkout page (spec §User Stories US-02)
- **Given** … **When** … **Then** …

## Non-functional

### BB-N01: <short title>
- Traces to: NFR-01
- Priority: P1
- Mode: automated
- Surface: `GET /search` (spec §Non-functional Requirements)
- **Given** … **When** … **Then** <the NFR's own threshold>

## Pending cases (blocked by open items)

- <sketch>, blocked by <open item / unpinned surface>
```

<!-- kcc-dev-core-blackbox-tests-sentinel: v2 -->
