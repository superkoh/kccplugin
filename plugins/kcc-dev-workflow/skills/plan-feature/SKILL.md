---
description: Use when the user wants to plan a new feature end-to-end — brainstorm (including a user-driven UX visual direction loop that produces an approved ui-kickoff.html style reference) → spec → UI/UX → acceptance criteria → review → QA test cases → review. Triggers on 规划功能 / 写 spec 和测试用例 / 做需求规划 / 出新 feature 的 spec / 帮我规划这个 feature / plan feature / plan this feature / write spec and test cases / draft spec and AC. Delegates the interactive brainstorm to kcc-dev-workflow:step-brainstorm in the main session (brainstorm now produces kickoff.md with 10 sections incl. §UX Direction, plus a conditional ui-kickoff.html visual ground truth), then runs a 6-teammate team via TeamCreate and produces 5 artifacts under .kcc/.
---

# plan-feature — orchestrate a new feature from idea to QA cases

Run this in the main session. The skill first delegates the interactive
brainstorm to `kcc-dev-workflow:step-brainstorm` (Phase 0) — which also
runs a user-driven UX visual direction loop for UI-surface features
and writes an approved `ui-kickoff.html` — then builds a team of 6
teammates that each own one production step, and produces five
artifacts:

- `.kcc/specs/<feature-slug>/kickoff.md` (10 sections, incl. §UX Direction)
- `.kcc/specs/<feature-slug>/ui-kickoff.html` (conditional — only for UI-surface features)
- `.kcc/specs/<feature-slug>/spec.md`
- `.kcc/specs/<feature-slug>/ui.md`
- `.kcc/specs/<feature-slug>/ac.md`
- `.kcc/tests/cases/<feature-slug>.yaml`

Plus AI peer-review notes at `.kcc/specs/<feature-slug>/review.md`.

## When to use
Trigger phrases (Chinese + English):
- 规划功能 / 写 spec 和测试用例 / 做需求规划 / 出新 feature 的 spec / 帮我规划这个 feature
- plan feature / plan this feature / write spec and test cases / draft spec and AC

## When NOT to use
- Quick code changes that don't need a spec (use general coding workflow)
- Writing test cases alone without a spec (use an existing test-authoring flow)
- A feature that already has spec + AC + test cases written — no orchestration needed

## Process

### Phase -1 — Preflight / state inference (resume detection)

Before invoking `step-brainstorm`, check whether a prior run for this
feature exists that the user may want to resume.

1. **Detect candidate resumable features.** List directories under
   `.kcc/specs/` that contain a non-empty `kickoff.md`. For each, read
   its `## Metadata` block to extract `feature name` and `slug`. Build
   a candidate list.

2. **Match against conversation context.** Scan the last ~20 turns for
   a feature name or slug reference. Narrow the candidate list to ones
   that plausibly match; rank by recency of
   `.kcc/specs/<slug>/kickoff.md` mtime.

3. **If at least one candidate matches, confirm with a single
   `AskUserQuestion`**:

   - "Detected prior plan for `<slug>` (`<feature name>`) — resume it
     or start fresh?"
     - **Resume** `<slug>` from its last completed step (recommended)
     - Start fresh (step-brainstorm will derive `<slug>-v2` as usual)
     - Abort

   If no candidates match, skip straight to Phase 0.

4. **Resume branch.** If the user picks Resume:
   - Skip Phase 0 (do NOT invoke `step-brainstorm`).
   - Set `<feature-slug>` and `<platform>` by reading
     `.kcc/specs/<slug>/kickoff.md` `## Metadata` directly.
   - Proceed to Phase 1 under the State inference rules below.

5. **Fresh branch.** If the user picks Start fresh (or no candidates):
   proceed normally to Phase 0.

### State inference rules

These rules apply in Phases 1 and 2 regardless of whether the run is
fresh or resumed — they are the single mechanical contract that keeps
fresh and resume paths symmetric.

1. Team `dev-plan-<slug>` missing → Phase 1 builds it normally.
2. Team exists but TaskList is empty → Phase 1 adds T1..T6.
3. Team exists with T1..T6 already present → skip TaskCreate in
   Phase 1; proceed to Phase 2 using the existing tasks.
4. Phase 2 per `T<N>`:
   - If `T<N>.status == completed` AND the expected output file exists
     and is non-empty AND (for N ∈ {4, 6}) `review.md` contains the
     required section header → emit
     `✓ Step <N>: <role> already complete (resumed)` and skip spawning;
     continue to `T<N+1>`.
   - Otherwise → spawn normally. (Each step skill carries its own
     idempotence check as a second line of defense against drift
     between task status and artifact state.)

### Phase 0 — Brainstorm (delegated to step-brainstorm)

The interactive brainstorm runs inside a dedicated skill, not inline in
this orchestrator. Invoke it via the Skill tool:

```
Skill(skill="kcc-dev-workflow:step-brainstorm")
```

`kcc-dev-workflow:step-brainstorm` owns, in order:

- The silent context scan (last ~20 conversation turns + `docs/` /
  `specs/` / `product/` / `prds/`).
- The three routing `AskUserQuestion` questions (feature name / input
  material / platform).
- The interactive brainstorm dialog — if `superpowers:brainstorming` is
  available in the session the skill leverages it with a scope override
  (Path A); otherwise it runs an inline probing flow (Path B).
- Writing `.kcc/specs/<feature-slug>/kickoff.md` with a fixed 10-section
  schema (Metadata, Original material, Problem Statement, Users &
  Personas, UX Direction, Goals & Non-goals, Key Scenarios, Considered
  Alternatives, Constraints, Open Questions & Risks).
- For UI-surface features: running a UX visual direction discussion
  loop with the user (unbounded until Approve or Abort) and writing
  `.kcc/specs/<feature-slug>/ui-kickoff.html` — a self-contained HTML
  style reference (palette, typography, density, sample components,
  anti-pattern callouts). For UI-less features, kickoff §UX Direction
  carries `Status: N/A` and no HTML is written.

The skill returns `<feature-slug>` and `<platform>`. Bind those for use
in Phase 1. Also create the test-case output root:

```bash
mkdir -p .kcc/tests/cases
```

### Phase 1 — Create or reuse team and task chain

1. **Build or reuse the team (idempotent).** First check whether team
   `dev-plan-<feature-slug>` already exists (use `TeamList`, or catch a
   duplicate-name error from `TeamCreate`). If it exists, reuse it
   without recreating — its existing task list is the durable state.
   Otherwise:
   ```
   TeamCreate(
     team_name="dev-plan-<feature-slug>",
     agent_type="orchestrator",
     description="Plan <feature-name> end-to-end (brainstorm → spec → AC → review → test cases → review)"
   )
   ```

2. **Build or reuse the 6-task chain (idempotent).** Call `TaskList`
   for the team. If T1..T6 are all present, skip creation entirely.
   If some are missing, create only the missing ones with the correct
   `addBlockedBy` link into the existing chain. If none exist, create
   the full chain below. Use the task description template for each.
   (Brainstorm is not a teammate — it ran in Phase 0.)

   | # | subject | blocked by |
   |---|---------|------------|
   | T1 | `Step 1: Write spec for <feature-slug>` | — |
   | T2 | `Step 2: Design UI/UX for <feature-slug>` | T1 |
   | T3 | `Step 3: Write AC for <feature-slug>` | T2 |
   | T4 | `Step 4: Review spec+UI+AC for <feature-slug>` | T3 |
   | T5 | `Step 5: Write test cases for <feature-slug>` | T4 |
   | T6 | `Step 6: Review test cases for <feature-slug>` | T5 |

### Step skill bindings

Each step spawns a teammate that invokes a specific skill via the Skill tool. The `<role>` placeholder in the teammate prompt template maps to these concrete skill names:

- Step 1 → `kcc-dev-workflow:step-spec-writer`
- Step 2 → `kcc-dev-workflow:step-ui-ux-designer`
- Step 3 → `kcc-dev-workflow:step-ac-writer`
- Step 4 → `kcc-dev-workflow:step-spec-ac-reviewer` (scope now includes ui.md; see that skill for persona expansion)
- Step 5 → `kcc-dev-workflow:step-test-case-writer`
- Step 6 → `kcc-dev-workflow:step-test-case-reviewer`

### Task description template

Each task's `description` (set via TaskCreate's `description` field) uses this format:

```
## Step <N>: <Role>

**Goal:** <one-sentence goal for this step>

**Inputs (read):**
- .kcc/specs/<feature-slug>/kickoff.md
- <prior step output paths>

**Output (write):**
- <exact output path>

**Skill to invoke:** kcc-dev-workflow:step-<role>

**DoD:**
- <structural conditions specific to this step>
- Run TaskUpdate(status=completed) when done
```

### Phase 2 — Execute steps sequentially (with resume)

For each step N from 1 to 6, first run the **resume check** before the
spawn sequence below:

Read `T<N>` via `TaskGet`. If `status == completed` AND the expected
output file exists and is non-empty AND (for N ∈ {4, 6}) `review.md`
contains the required section header (`## spec-ac` for N=4,
`## test-cases` for N=6), emit
`✓ Step <N>: <role> already complete (resumed)` and continue to
`T<N+1>`. If `status == completed` but the artifact check fails
(drift), treat T<N> as `pending` and proceed with the normal sequence.

Normal sequence:

1. **Wait for T<N> to be unblocked.** Poll TaskList; proceed when T<N> status is `pending` and every task in its `blockedBy` is `completed`.

2. **Spawn teammate** via the Agent tool:
   ```
   Agent(
     subagent_type="general-purpose",
     model="opus",
     team_name="dev-plan-<feature-slug>",
     name="step-<N>-<role>",
     prompt=<teammate prompt template below>
   )
   ```

3. **Wait for the teammate's idle notification.** The system delivers it automatically — do not poll.

4. **Verify on idle:**
   - Read T<N> via TaskGet; status must be `completed`.
   - Stat the expected output file; it must exist and be non-empty.
   - For Steps 4 and 6 (reviewers), also confirm `review.md` contains the required section header (`## spec-ac` for Step 4, `## test-cases` for Step 6).

5. **On failure, follow the escalation protocol** (see below).

6. **On success, emit to main session:**
   ```
   ✓ Step <N>: <role> complete → <output path>
   ```

### Teammate prompt template

Each teammate receives exactly this prompt (substitute `<N>`, `<role>`, and the team name; everything else is literal):

```
You are a teammate in team dev-plan-<feature-slug>.
Your task: Step <N> — <role>. Task ID: T<N>.

1. Read the kickoff file: .kcc/specs/<feature-slug>/kickoff.md
2. Read any prior-step outputs listed in your task description (call TaskGet with taskId=T<N> to see it).
3. Invoke the skill `kcc-dev-workflow:step-<role>` (use the Skill tool). That skill tells you exactly what to write and where.
4. After the skill has written its output file, call TaskUpdate(taskId=T<N>, status=completed).
5. Do NOT write anything outside the paths listed in your task description.
6. Reply with "done" and the output file path, then stop.
```

### Phase 3 — Wrap up

1. **Sanity check.** Read the first 30 lines of each of:
   - `.kcc/specs/<feature-slug>/kickoff.md`
   - `.kcc/specs/<feature-slug>/ui-kickoff.html` (if present)
   - `.kcc/specs/<feature-slug>/spec.md`
   - `.kcc/specs/<feature-slug>/ui.md`
   - `.kcc/specs/<feature-slug>/ac.md`
   - `.kcc/tests/cases/<feature-slug>.yaml`

   For each, confirm it is non-empty and well-formed (kickoff.md / spec.md / ui.md / ac.md are markdown with sections; ui-kickoff.html contains an `<html>` block; yaml parses).

2. **Emit summary to user:**
   ```
   ✅ Plan complete: <feature-slug>
      - kickoff:    .kcc/specs/<slug>/kickoff.md
      - ui kickoff: .kcc/specs/<slug>/ui-kickoff.html  (if UI-surface feature)
      - spec:       .kcc/specs/<slug>/spec.md
      - ui:         .kcc/specs/<slug>/ui.md
      - AC:         .kcc/specs/<slug>/ac.md
      - test cases: .kcc/tests/cases/<slug>.yaml
      - review:     .kcc/specs/<slug>/review.md
   ```

3. **Shut down teammates** by sending each one a shutdown_request:
   ```
   SendMessage(to=<teammate name>, message={type: "shutdown_request"})
   ```

## Failure escalation

If a teammate does not complete its task (task status not `completed` OR expected output file missing / empty):

1. **1st failure** — SendMessage to the teammate with the concrete problem (e.g. "Output file not found at `.kcc/specs/<slug>/spec.md`; please retry and make sure the skill writes before TaskUpdate.") Ask it to retry.
2. **2nd failure** — switch strategy: re-prompt the teammate with "Skip the Skill tool; directly use the Write tool to create the file at `<path>` with the following structure: <inline template from the step skill's DoD>. Then TaskUpdate(status=completed)."
3. **3rd failure** — stop. List 3 non-overlapping hypotheses:
   - Hypothesis A: the step skill itself has a bug (read the skill file to verify).
   - Hypothesis B: the task description is missing required context (read TaskGet output).
   - Hypothesis C: the prior-step input file is malformed (read it).
   Investigate each before any further retry.
4. **4th failure** — emit an AskUserQuestion: "Step <N> (<role>) has failed 3 times. Attempts tried: <retry / inline write / hypothesis-driven fix>. Current hypotheses: <A / B / C>. Options: (a) skip this step with a TODO stub, (b) I take over manually, (c) describe a new approach in Other."

## Invariants

Before returning to the user, confirm:
- All 6 teammate tasks are `completed`.
- All 4 output files exist and are non-empty.
- `review.md` contains both `## spec-ac` (from Step 4; scope covers spec + ui + ac) and `## test-cases` (from Step 6) sections.
- `<feature-slug>` is ASCII-only kebab-case and matches all 4 output paths.
- The team `dev-plan-<feature-slug>` has received a shutdown_request for each teammate.

## Anti-patterns

- **Do not write any teammate's output yourself.** Your job is orchestration. If you find yourself reaching for Write on spec.md, stop — spawn the teammate instead.
- **Do not skip step-brainstorm.** The kickoff file it writes is the only thing teammates use to coordinate; without it they'll each ask the user, fragmenting the conversation.
- **Do not parallelize steps.** The chain is strictly linear. If you're tempted to spawn T1 and T2 together, remember T2 reads spec.md which T1 writes.
- **Do not re-create the team** on fresh failures within a single run. Use the existing team; the task list is the durable state. Resume across sessions, by contrast, is explicitly supported — Phase -1 detects it and Phase 1's "reuse if exists" rule reattaches to the durable team / task list.

<!-- kcc-dev-workflow-plan-feature-sentinel: v1 -->
